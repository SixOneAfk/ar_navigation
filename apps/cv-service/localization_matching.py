import hashlib
import json
import re
from collections import OrderedDict
from pathlib import Path
from threading import Lock
from typing import Literal

import cv2
import numpy as np
from pydantic import BaseModel, ConfigDict, Field


ROOT = Path(__file__).resolve().parent / "localization_references"
ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$"


class Reference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=ID_PATTERN)
    image: str = Field(min_length=1, max_length=255)
    pointId: str = Field(pattern=ID_PATTERN)
    facingTarget: str | None = Field(default=None, pattern=ID_PATTERN)


class Catalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    searchRadiusMeters: float = Field(gt=0, le=100)
    updateThresholdMeters: float = Field(gt=0, le=20)
    references: list[Reference] = Field(max_length=10000)


class MatchRequest(BaseModel):
    image_payload: str = Field(min_length=1, max_length=2_000_000)
    reference_ids: list[str] = Field(max_length=256)
    revision: str = Field(min_length=1, max_length=64)


class MatchResponse(BaseModel):
    status: Literal["matched", "no_match", "busy", "references_changed"]
    reference_id: str | None = None
    point_id: str | None = None
    confidence: float = 0


class LocalizationMatcher:
    def __init__(self, root: Path = ROOT) -> None:
        self.root = root.resolve()
        self.lock = Lock()
        self.catalog_lock = Lock()
        self.catalog_key: tuple[int, int] | None = None
        self.catalog_snapshot: tuple[Catalog, str, dict[str, Reference]] | None = None
        self.cache: OrderedDict[tuple[str, int, int], tuple[list, np.ndarray]] = OrderedDict()

    def _catalog(self) -> tuple[Catalog, str, dict[str, Reference]]:
        with self.catalog_lock:
            path = self.root / "catalog.json"
            stat = path.stat()
            key = (stat.st_mtime_ns, stat.st_size)
            if self.catalog_snapshot is not None and self.catalog_key == key:
                return self.catalog_snapshot
            raw = path.read_bytes()
            catalog = Catalog.model_validate_json(raw)
            references = {ref.id: ref for ref in catalog.references}
            if len(references) != len(catalog.references):
                raise ValueError("Localization reference IDs must be unique")
            for ref in catalog.references:
                image_path = (self.root / ref.image).resolve()
                if not image_path.is_relative_to(self.root) or image_path == self.root:
                    raise ValueError(f"Invalid image path for reference {ref.id}")
                if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                    raise ValueError(f"Unsupported image path for reference {ref.id}")
            self.catalog_snapshot = (catalog, hashlib.sha256(raw).hexdigest()[:16], references)
            self.catalog_key = key
            return self.catalog_snapshot

    def catalog(self) -> tuple[Catalog, str]:
        catalog, revision, _ = self._catalog()
        return catalog, revision

    def _features(self, ref: Reference) -> tuple[list, np.ndarray]:
        path = (self.root / ref.image).resolve()
        if not path.is_relative_to(self.root) or path == self.root:
            raise ValueError(f"Invalid image path for reference {ref.id}")
        stat = path.stat()
        if stat.st_size > 12_000_000:
            raise ValueError(f"Reference image is too large: {ref.id}")
        key = (str(path), stat.st_mtime_ns, stat.st_size)
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            raise ValueError(f"Cannot read reference image: {ref.id}")
        height, width = image.shape
        scale = min(640 / max(height, width), 1.0)
        if scale < 1:
            image = cv2.resize(image, (max(1, int(width * scale)), max(1, int(height * scale))))
        points, descriptors = cv2.SIFT_create(nfeatures=1000).detectAndCompute(image, None)
        if descriptors is None or len(points) < 20:
            raise ValueError(f"Reference image has too few features: {ref.id}")
        self.cache[key] = (points, descriptors)
        if len(self.cache) > 256:
            self.cache.popitem(last=False)
        return self.cache[key]

    def match(self, image: np.ndarray, request: MatchRequest) -> MatchResponse:
        if not self.lock.acquire(blocking=False):
            return MatchResponse(status="busy")
        try:
            _, revision, references = self._catalog()
            if revision != request.revision:
                return MatchResponse(status="references_changed")
            if len(set(request.reference_ids)) != len(request.reference_ids):
                raise ValueError("Duplicate reference IDs")
            if any(ref_id not in references for ref_id in request.reference_ids):
                raise ValueError("Unknown localization reference ID")
            if not request.reference_ids:
                return MatchResponse(status="no_match")

            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            frame_points, frame_descriptors = cv2.SIFT_create(nfeatures=1000).detectAndCompute(gray, None)
            if frame_descriptors is None or len(frame_points) < 20:
                return MatchResponse(status="no_match")
            matcher = cv2.BFMatcher()
            scores_by_pose: dict[tuple[str, str | None], tuple[float, Reference]] = {}
            for ref_id in request.reference_ids:
                ref = references[ref_id]
                points, descriptors = self._features(ref)
                pairs = matcher.knnMatch(descriptors, frame_descriptors, k=2)
                good = [pair[0] for pair in pairs if len(pair) == 2 and pair[0].distance < 0.7 * pair[1].distance]
                if len(good) < 12:
                    continue
                source = np.float32([points[item.queryIdx].pt for item in good])
                target = np.float32([frame_points[item.trainIdx].pt for item in good])
                homography, mask = cv2.findHomography(source, target, cv2.RANSAC, 4.0)
                if homography is None or mask is None:
                    continue
                inliers = int(mask.sum())
                ratio = inliers / len(good)
                if inliers < 12 or ratio < 0.6:
                    continue
                inlier_points = target[mask.ravel().astype(bool)]
                coverage = cv2.contourArea(cv2.convexHull(inlier_points)) / (gray.shape[0] * gray.shape[1])
                if coverage < 0.02:
                    continue
                score = min(1.0, ratio * min(inliers / 30, 1.0))
                pose = (ref.pointId, ref.facingTarget)
                if pose not in scores_by_pose or score > scores_by_pose[pose][0]:
                    scores_by_pose[pose] = (score, ref)
            scores = list(scores_by_pose.values())
            scores.sort(key=lambda item: item[0], reverse=True)
            if not scores or scores[0][0] < 0.6 or (len(scores) > 1 and scores[0][0] - scores[1][0] < 0.1):
                return MatchResponse(status="no_match")
            score, ref = scores[0]
            return MatchResponse(status="matched", reference_id=ref.id, point_id=ref.pointId, confidence=round(score, 4))
        finally:
            self.lock.release()


localization_matcher = LocalizationMatcher()
