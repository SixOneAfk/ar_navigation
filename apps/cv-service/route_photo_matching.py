from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import re
from threading import Lock
import time
from typing import Any

import cv2
import numpy as np


DEFAULT_ROOT = Path(__file__).resolve().parent / "route_photos"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_REFERENCES_PER_POINT = 40
MIN_FEATURES = 20
MIN_INLIERS = 12
REFERENCE_PIPELINE_VERSION = b"portrait-overlap-v3"


@dataclass
class Features:
    points: np.ndarray
    descriptors: np.ndarray | None
    width: int
    height: int


@dataclass
class Reference:
    point_id: str
    filename: str
    features: Features


def resize_for_features(image: np.ndarray, max_edge: int) -> np.ndarray:
    height, width = image.shape[:2]
    pixel_budget = max_edge * max_edge * 0.75
    scale = min(max_edge / max(width, height), math.sqrt(pixel_budget / (width * height)), 1.0)
    if scale < 1.0:
        return cv2.resize(
            image, (max(1, int(width * scale)), max(1, int(height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    return image


def extract_features(image: np.ndarray, max_features: int = 1000) -> Features:
    image = resize_for_features(image, 640)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    keypoints, descriptors = cv2.SIFT_create(nfeatures=max_features).detectAndCompute(gray, None)
    return Features(
        np.asarray([keypoint.pt for keypoint in keypoints], dtype=np.float32).reshape(-1, 2),
        descriptors,
        gray.shape[1],
        gray.shape[0],
    )


def extract_reference_features(image: np.ndarray) -> Features:
    coarse = extract_features(image)
    image = resize_for_features(image, 1280)
    height, width = image.shape[:2]
    if (width, height) == (coarse.width, coarse.height):
        return coarse
    points, descriptors = [], []
    if coarse.descriptors is not None:
        points.append(coarse.points * np.float32([width / coarse.width, height / coarse.height]))
        descriptors.append(coarse.descriptors)
    tile_limit = (480, 640) if height > width else (640, 480)
    tile_width, tile_height = min(width, tile_limit[0]), min(height, tile_limit[1])
    columns = max(1, math.ceil((width - tile_width) / (tile_width / 2)) + 1)
    rows = max(1, math.ceil((height - tile_height) / (tile_height / 2)) + 1)
    # Cache overlapping detail views in one reference coordinate system.
    for top in np.linspace(0, height - tile_height, rows, dtype=int):
        for left in np.linspace(0, width - tile_width, columns, dtype=int):
            tile = extract_features(image[top:top + tile_height, left:left + tile_width], 300)
            if tile.descriptors is not None:
                points.append(tile.points + np.float32([left, top]))
                descriptors.append(tile.descriptors)
    return Features(
        np.concatenate(points) if points else np.empty((0, 2), np.float32),
        np.concatenate(descriptors) if descriptors else None,
        width, height,
    )


def _coverage(points: np.ndarray, width: int, height: int) -> float:
    if len(points) < 3:
        return 0.0
    return float(cv2.contourArea(cv2.convexHull(points))) / (width * height)


def clip_to_frame(points: np.ndarray, width: int, height: int) -> np.ndarray:
    # Explicit rectangle clipping avoids nearly coincident contour intersections.
    clipped = points.astype(np.float64).tolist()
    for axis, boundary, keep_greater in ((0, 0.0, True), (0, float(width), False),
                                         (1, 0.0, True), (1, float(height), False)):
        if not clipped:
            break
        output: list[list[float]] = []
        previous = clipped[-1]
        previous_inside = previous[axis] >= boundary if keep_greater else previous[axis] <= boundary
        for current in clipped:
            current_inside = current[axis] >= boundary if keep_greater else current[axis] <= boundary
            if current_inside != previous_inside:
                amount = (boundary - previous[axis]) / (current[axis] - previous[axis])
                output.append([
                    previous[dimension] + amount * (current[dimension] - previous[dimension])
                    for dimension in (0, 1)
                ])
            if current_inside:
                output.append(current)
            previous, previous_inside = current, current_inside
        clipped = output
    return np.asarray(clipped, dtype=np.float32).reshape(-1, 2)


def match_reference(
    reference: Reference,
    frame: Features,
    matcher: Any,
    attempt: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    features = reference.features
    if attempt is None:
        attempt = {}
    attempt.update(
        point_id=reference.point_id, reference_file=reference.filename,
        reference_features=len(features.points), good_matches=0, inliers=0,
        minimum_inliers=MIN_INLIERS, rejection_reason="insufficient_matches",
    )
    if features.descriptors is None:
        return None
    pairs = matcher.knnMatch(features.descriptors, k=2)
    # SIFT orientations and cached tiles must not duplicate a physical feature.
    unique: dict[tuple[int, int], Any] = {}
    for pair in pairs:
        if len(pair) != 2:
            continue
        first, second = pair
        if first.distance >= 0.72 * second.distance:
            continue
        location = tuple(np.rint(frame.points[first.trainIdx] * 2).astype(int))
        previous = unique.get(location)
        if previous is None or first.distance < previous.distance:
            unique[location] = first
    good = list(unique.values())
    attempt["good_matches"] = len(good)
    if len(good) < MIN_INLIERS:
        return None
    source = features.points[[match.queryIdx for match in good]]
    destination = frame.points[[match.trainIdx for match in good]]
    transform, mask = cv2.findHomography(
        source, destination, cv2.RANSAC, 3.5, maxIters=1500, confidence=0.995,
    )
    if transform is None or mask is None or not np.isfinite(transform).all():
        attempt["rejection_reason"] = "unstable_geometry"
        return None
    inlier_mask = mask.ravel().astype(bool)
    count = int(inlier_mask.sum())
    ratio = count / len(good)
    attempt["inliers"] = count
    if count < MIN_INLIERS:
        attempt["rejection_reason"] = "insufficient_inliers"
        return None
    if ratio < 0.45:
        attempt["rejection_reason"] = "inconsistent_matches"
        return None
    reference_coverage = _coverage(source[inlier_mask], features.width, features.height)
    frame_coverage = _coverage(destination[inlier_mask], frame.width, frame.height)
    if frame_coverage < 0.02:
        attempt["rejection_reason"] = "concentrated_matches"
        return None

    corners = np.float32([
        [0, 0], [frame.width - 1, 0],
        [frame.width - 1, frame.height - 1], [0, frame.height - 1],
    ])
    try:
        inverse = np.linalg.inv(transform)
    except np.linalg.LinAlgError:
        attempt["rejection_reason"] = "invalid_projection"
        return None
    if not np.isfinite(inverse).all():
        attempt["rejection_reason"] = "invalid_projection"
        return None
    denominators = np.column_stack((corners, np.ones(4))) @ inverse[2]
    if not (np.all(denominators > 1e-6) or np.all(denominators < -1e-6)):
        attempt["rejection_reason"] = "invalid_projection"
        return None
    visible_reference = cv2.perspectiveTransform(corners.reshape(-1, 1, 2), inverse).reshape(-1, 2)
    if not np.isfinite(visible_reference).all() or not cv2.isContourConvex(visible_reference):
        attempt["rejection_reason"] = "invalid_projection"
        return None
    overlap = clip_to_frame(visible_reference, features.width - 1, features.height - 1)
    overlap_area = abs(float(cv2.contourArea(overlap))) if len(overlap) >= 3 else 0.0
    if overlap_area <= 1e-6:
        attempt["rejection_reason"] = "reference_mostly_outside_frame"
        return None
    overlap_coverage = (
        abs(float(cv2.contourArea(cv2.convexHull(source[inlier_mask])))) / overlap_area
    )
    if overlap_coverage < 0.06:
        attempt["rejection_reason"] = "concentrated_matches"
        return None
    projected = cv2.perspectiveTransform(overlap.reshape(-1, 1, 2), transform).reshape(-1, 2)
    if not np.isfinite(projected).all() or not cv2.isContourConvex(projected):
        attempt["rejection_reason"] = "invalid_projection"
        return None
    if cv2.contourArea(overlap, oriented=True) * cv2.contourArea(projected, oriented=True) <= 0:
        attempt["rejection_reason"] = "invalid_projection"
        return None
    clipped = clip_to_frame(projected, frame.width, frame.height)
    visible_area = abs(float(cv2.contourArea(clipped))) if len(clipped) >= 3 else 0.0
    if visible_area < frame.width * frame.height * 0.02:
        attempt["rejection_reason"] = "reference_mostly_outside_frame"
        return None
    visible_fraction = float(visible_area) / (frame.width * frame.height)
    predicted = cv2.perspectiveTransform(source[inlier_mask].reshape(-1, 1, 2), transform).reshape(-1, 2)
    error = float(np.median(np.linalg.norm(predicted - destination[inlier_mask], axis=1)))
    if not math.isfinite(error) or error > 3.0:
        attempt["rejection_reason"] = "high_reprojection_error"
        return None
    coverage_score = math.sqrt(
        min(overlap_coverage / 0.35, 1.0) * min(frame_coverage / 0.20, 1.0)
    )
    score = (
        0.35 * min(count / 40, 1.0)
        + 0.30 * ratio
        + 0.25 * coverage_score
        + 0.10 * math.exp(-error / 3.0)
    )
    attempt["rejection_reason"] = None
    return {
        "point_id": reference.point_id,
        "score": round(score, 4),
        "reference_file": reference.filename,
        "inliers": count,
        "good_matches": len(good),
        "inlier_ratio": round(ratio, 4),
        "reference_coverage": round(reference_coverage, 4),
        "overlap_coverage": round(min(overlap_coverage, 1.0), 4),
        "reference_visible_fraction": round(min(overlap_area / (features.width * features.height), 1.0), 4),
        "frame_coverage": round(frame_coverage, 4),
        "visible_fraction": round(visible_fraction, 4),
        "reprojection_error_px": round(error, 3),
        "outline": [
            {"x": round(float(np.clip(x / frame.width, 0, 1)), 5),
             "y": round(float(np.clip(y / frame.height, 0, 1)), 5)}
            for x, y in cv2.convexHull(destination[inlier_mask]).reshape(-1, 2)
        ],
    }


class PhotoRouteMatcher:
    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or Path(os.environ.get("CV_ROUTE_PHOTOS_DIR", DEFAULT_ROOT))).resolve()
        self._lock = Lock()
        self._catalog: dict[str, Any] | None = None
        self._references: list[Reference] = []
        self._cache: dict[tuple[str, int, int], Features | None] = {}

    def _refresh(self, force: bool = False) -> dict[str, Any]:
        try:
            raw = (self.root / "route.json").read_bytes()
            manifest = json.loads(raw)
        except (OSError, ValueError) as error:
            raise ValueError("Cannot read route_photos/route.json") from error
        points = manifest.get("points") if isinstance(manifest, dict) else None
        if not isinstance(points, list) or not 1 <= len(points) <= 5:
            raise ValueError("The test route must contain one to five configured points")
        ids = [point.get("id") if isinstance(point, dict) else None for point in points]
        if any(not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", value) for value in ids):
            raise ValueError("Point IDs must contain only letters, digits, hyphens, or underscores")
        if len(set(ids)) != len(ids):
            raise ValueError("Point IDs must be unique")
        if any(not isinstance(point.get("enabled", True), bool) for point in points):
            raise ValueError("Point enabled flags must be booleans")
        disabled_points = [point for point in points if not point.get("enabled", True)]
        points = [point for point in points if point.get("enabled", True)]
        if not points:
            raise ValueError("The route must have at least one enabled point")
        ids = [point["id"] for point in points]
        files: list[tuple[str, Path, tuple[str, int, int]]] = []
        warnings: list[str] = []
        for point_id in ids:
            directory = self.root / point_id
            if directory.is_symlink():
                raise ValueError("Reference directories must not be symbolic links")
            candidates = sorted(directory.iterdir()) if directory.is_dir() else []
            images = [path for path in candidates if path.suffix.lower() in IMAGE_EXTENSIONS]
            if len(images) > MAX_REFERENCES_PER_POINT:
                warnings.append(f"{point_id}: only the first {MAX_REFERENCES_PER_POINT} images are used")
            for path in images[:MAX_REFERENCES_PER_POINT]:
                if path.is_symlink() or not path.is_file():
                    warnings.append(f"{point_id}/{path.name}: symbolic links are not supported")
                    continue
                stat = path.stat()
                files.append((point_id, path, (str(path), stat.st_mtime_ns, stat.st_size)))
        signature = hashlib.sha256(
            REFERENCE_PIPELINE_VERSION + raw + repr([item[2] for item in files]).encode(),
        ).hexdigest()[:16]
        if not force and self._catalog and self._catalog["revision"] == signature:
            return self._catalog
        references: list[Reference] = []
        next_cache: dict[tuple[str, int, int], Features | None] = {}
        filenames: dict[str, list[str]] = {point_id: [] for point_id in ids}
        usable: dict[str, list[str]] = {point_id: [] for point_id in ids}
        for point_id, path, key in files:
            filenames[point_id].append(path.name)
            if not force and key in self._cache:
                features = self._cache[key]
            else:
                image = cv2.imread(str(path)) if key[2] <= 12_000_000 else None
                features = extract_reference_features(image) if image is not None else None
            next_cache[key] = features
            if features is None or len(features.points) < MIN_FEATURES:
                warnings.append(f"{point_id}/{path.name}: unreadable or too few distinct image features")
                continue
            usable[point_id].append(path.name)
            references.append(Reference(point_id, path.name, features))
        self._cache = next_cache
        self._references = references
        self._catalog = {
            "id": str(manifest.get("id", "pilot-route")),
            "name": str(manifest.get("name", "Photo route")),
            "revision": signature,
            "ready": all(usable[point_id] for point_id in ids),
            "reference_root": "apps/cv-service/route_photos" if self.root == DEFAULT_ROOT else str(self.root),
            "points": [
                {"id": point["id"], "name": str(point.get("name", point["id"])),
                 "reference_count": len(filenames[point["id"]]),
                 "usable_reference_count": len(usable[point["id"]]),
                 "files": filenames[point["id"]]}
                for point in points
            ],
            "warnings": warnings,
            "disabled_points": [
                {"id": point["id"], "name": str(point.get("name", point["id"]))}
                for point in disabled_points
            ],
        }
        return self._catalog

    def catalog(self, force: bool = False) -> dict[str, Any]:
        with self._lock:
            return self._refresh(force)

    def analyze(
        self, image: np.ndarray, expected_point_id: str, revision: str,
        minimum_score: float = 0.60, minimum_margin: float = 0.10,
        minimum_visible_fraction: float = 0.10,
    ) -> dict[str, Any]:
        started = time.perf_counter()
        response: dict[str, Any] = {
            "status": "busy", "revision": revision, "expected_point_id": expected_point_id,
            "recognized_point_id": None, "expected_matched": False,
            "candidate": None, "candidates": [], "margin": 0.0,
            "attempt": None, "attempts": [],
            "query_features": 0, "processing_time_ms": 0.0, "diagnostic_only": True,
        }
        if not self._lock.acquire(blocking=False):
            return response
        try:
            catalog = self._refresh()
            response["revision"] = catalog["revision"]
            if expected_point_id not in [point["id"] for point in catalog["points"]]:
                raise ValueError("Unknown expected point ID")
            if revision != catalog["revision"]:
                response["status"] = "references_changed"
                return response
            if not catalog["ready"]:
                response["status"] = "not_ready"
                return response
            frame = extract_features(image)
            response["query_features"] = len(frame.points)
            if frame.descriptors is None or len(frame.points) < MIN_FEATURES:
                response["status"] = "low_detail"
                return response
            matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=4), dict(checks=48))
            matcher.add([frame.descriptors])
            matcher.train()
            best_by_point: dict[str, dict[str, Any]] = {}
            candidate_attempts: dict[str, dict[str, Any]] = {}
            attempts_by_point: dict[str, dict[str, Any]] = {}
            for reference in self._references:
                attempt: dict[str, Any] = {}
                candidate = match_reference(reference, frame, matcher, attempt)
                previous_attempt = attempts_by_point.get(reference.point_id)
                if previous_attempt is None or (attempt["inliers"], attempt["good_matches"]) > (
                    previous_attempt["inliers"], previous_attempt["good_matches"],
                ):
                    attempts_by_point[reference.point_id] = attempt
                if candidate is None:
                    continue
                previous = best_by_point.get(reference.point_id)
                if previous is None or candidate["score"] > previous["score"]:
                    best_by_point[reference.point_id] = candidate
                    candidate_attempts[reference.point_id] = attempt
            ranked = sorted(best_by_point.values(), key=lambda item: item["score"], reverse=True)
            attempts = sorted(
                attempts_by_point.values(),
                key=lambda item: (item["inliers"], item["good_matches"]), reverse=True,
            )
            response["attempts"] = attempts
            if attempts and attempts[0]["good_matches"] > 0:
                response["attempt"] = attempts[0]
            response["candidates"] = ranked
            response["status"] = "no_match"
            if not ranked:
                return response
            best = ranked[0]
            margin = round(best["score"] - (ranked[1]["score"] if len(ranked) > 1 else 0.0), 4)
            response.update(candidate=best, margin=margin, attempt=candidate_attempts[best["point_id"]])
            if best["score"] < minimum_score:
                return response
            if margin < minimum_margin:
                response["status"] = "ambiguous"
                return response
            if best["visible_fraction"] < minimum_visible_fraction:
                response["status"] = "too_small"
                return response
            response.update(
                status="matched", recognized_point_id=best["point_id"],
                expected_matched=best["point_id"] == expected_point_id,
            )
            return response
        finally:
            response["processing_time_ms"] = round((time.perf_counter() - started) * 1000, 1)
            self._lock.release()


photo_route_matcher = PhotoRouteMatcher()
