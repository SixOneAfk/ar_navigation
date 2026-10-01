import math
import time
from typing import Any

import cv2
import numpy as np
from wall_pose import detect_wall_outline


def _normalize_angle_deg(value: float) -> float:
    normalized = value
    while normalized <= -90:
        normalized += 180
    while normalized > 90:
        normalized -= 180
    return normalized


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _angle_delta_deg(first: float, second: float) -> float:
    return abs(_normalize_angle_deg(first - second))


def _weighted_median(values: list[tuple[float, float]]) -> float:
    ordered = sorted(values, key=lambda item: item[0])
    half_weight = sum(weight for _value, weight in ordered) / 2.0
    cumulative = 0.0
    for value, weight in ordered:
        cumulative += weight
        if cumulative >= half_weight:
            return value
    return ordered[-1][0]


def _fit_supported_line(
    segments: list[dict[str, float]],
    width: int,
    height: int,
) -> tuple[dict[str, float], float]:
    points = np.array(
        [
            point
            for segment in segments
            for point in (
                (segment["x1"], segment["y1"]),
                (segment["x2"], segment["y2"]),
            )
        ],
        dtype=np.float32,
    )
    vx, vy, center_x, center_y = (
        float(value)
        for value in cv2.fitLine(
            points,
            cv2.DIST_L2,
            0,
            0.01,
            0.01,
        ).flatten()
    )
    projections = [
        ((float(x) - center_x) * vx) + ((float(y) - center_y) * vy)
        for x, y in points
    ]
    start_t = min(projections)
    end_t = max(projections)
    x1 = _clamp(center_x + (start_t * vx), 0.0, width - 1.0)
    y1 = _clamp(center_y + (start_t * vy), 0.0, height - 1.0)
    x2 = _clamp(center_x + (end_t * vx), 0.0, width - 1.0)
    y2 = _clamp(center_y + (end_t * vy), 0.0, height - 1.0)
    if x1 > x2:
        x1, x2 = x2, x1
        y1, y2 = y2, y1

    angle = _normalize_angle_deg(
        math.degrees(math.atan2(y2 - y1, x2 - x1))
    )
    return (
        {
            "x1": round(x1 / width, 5),
            "y1": round(y1 / height, 5),
            "x2": round(x2 / width, 5),
            "y2": round(y2 / height, 5),
        },
        angle,
    )


def _extract_segments(image: np.ndarray) -> tuple[list[dict[str, float]], int, int]:
    source_height, source_width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    scale = min(1.0, 320.0 / max(source_width, 1))
    if scale < 1.0:
        working = cv2.resize(
            gray,
            (
                max(1, int(round(source_width * scale))),
                max(1, int(round(source_height * scale))),
            ),
            interpolation=cv2.INTER_AREA,
        )
    else:
        working = gray

    working = cv2.GaussianBlur(working, (5, 5), 0)
    height, width = working.shape
    detector = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
    detected_lines = detector.detect(working)[0]
    minimum_length = max(width * 0.10, 24.0)
    segments: list[dict[str, float]] = []

    if detected_lines is None:
        return segments, width, height

    for raw_line in detected_lines:
        x1, y1, x2, y2 = (float(value) for value in raw_line[0])
        dx = x2 - x1
        dy = y2 - y1
        length = math.hypot(dx, dy)
        if length < minimum_length:
            continue
        segments.append(
            {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "length": length,
                "angle": _normalize_angle_deg(
                    math.degrees(math.atan2(dy, dx))
                ),
                "mid_x": (x1 + x2) / 2.0,
                "mid_y": (y1 + y2) / 2.0,
            }
        )

    return segments, width, height


def detect_structural_lines(image: np.ndarray) -> dict[str, Any]:
    started_at = time.perf_counter()
    source_height, source_width = image.shape[:2]
    segments, width, height = _extract_segments(image)
    boundary_candidates = [
        segment
        for segment in segments
        if abs(segment["angle"]) <= 55.0
        and height * 0.38 <= segment["mid_y"] <= height * 0.94
    ]

    best_boundary: dict[str, float] | None = None
    best_boundary_angle: float | None = None
    best_boundary_confidence = 0.0

    for candidate in boundary_candidates:
        dx = candidate["x2"] - candidate["x1"]
        dy = candidate["y2"] - candidate["y1"]
        supported: list[dict[str, float]] = []
        for other in boundary_candidates:
            distance = abs(
                (dy * other["mid_x"])
                - (dx * other["mid_y"])
                + (candidate["x2"] * candidate["y1"])
                - (candidate["y2"] * candidate["x1"])
            ) / max(candidate["length"], 1.0)
            if (
                _angle_delta_deg(candidate["angle"], other["angle"]) <= 7.0
                and distance <= 10.0
            ):
                supported.append(other)

        support_length = sum(segment["length"] for segment in supported)
        length_score = min(
            candidate["length"] / max(width * 0.65, 1.0),
            1.0,
        )
        support_score = min(
            support_length / max(width * 0.9, 1.0),
            1.0,
        )
        region_score = 1.0 - min(
            abs((candidate["mid_y"] / height) - 0.68) / 0.34,
            1.0,
        )
        orientation_score = 1.0 - min(
            abs(candidate["angle"]) / 55.0,
            1.0,
        )
        confidence = (
            (0.40 * length_score)
            + (0.25 * support_score)
            + (0.20 * region_score)
            + (0.15 * orientation_score)
        )
        if confidence > best_boundary_confidence:
            best_boundary, best_boundary_angle = _fit_supported_line(
                supported,
                width,
                height,
            )
            best_boundary_confidence = confidence

    vertical_candidates: list[tuple[float, float]] = []
    for segment in segments:
        if segment["length"] < height * 0.14:
            continue
        x1 = segment["x1"]
        y1 = segment["y1"]
        x2 = segment["x2"]
        y2 = segment["y2"]
        if y1 > y2:
            x1, x2 = x2, x1
            y1, y2 = y2, y1
        vertical_deviation = math.degrees(math.atan2(x2 - x1, y2 - y1))
        if abs(vertical_deviation) <= 35.0:
            vertical_candidates.append(
                (vertical_deviation, segment["length"])
            )

    camera_roll_deg: float | None = None
    roll_confidence = 0.0
    if vertical_candidates:
        median_deviation = _weighted_median(vertical_candidates)
        absolute_deviations = [
            (abs(value - median_deviation), weight)
            for value, weight in vertical_candidates
        ]
        median_absolute_deviation = _weighted_median(absolute_deviations)
        inlier_limit = max(
            3.0,
            min(10.0, median_absolute_deviation * 2.5),
        )
        inliers = [
            (value, weight)
            for value, weight in vertical_candidates
            if abs(value - median_deviation) <= inlier_limit
        ]
        total_weight = sum(weight for _value, weight in inliers)
        mean_deviation = sum(
            value * weight for value, weight in inliers
        ) / max(total_weight, 1.0)
        variance = sum(
            weight * ((value - mean_deviation) ** 2)
            for value, weight in inliers
        ) / max(total_weight, 1.0)
        dispersion = math.sqrt(variance)
        length_score = min(total_weight / max(height * 1.8, 1.0), 1.0)
        count_score = min(len(inliers) / 4.0, 1.0)
        dispersion_score = 1.0 - min(dispersion / 12.0, 1.0)
        roll_confidence = (
            (0.45 * length_score)
            + (0.20 * count_score)
            + (0.35 * dispersion_score)
        )
        camera_roll_deg = -mean_deviation

    wall_detection = detect_wall_outline(
        segments,
        best_boundary,
        width,
        height,
    )

    return {
        "detected": best_boundary is not None,
        **wall_detection,
        "floor_boundary": best_boundary,
        "boundary_angle_deg": (
            round(float(best_boundary_angle), 3)
            if best_boundary_angle is not None
            else None
        ),
        "boundary_confidence": round(
            _clamp(best_boundary_confidence, 0.0, 1.0),
            3,
        ),
        "camera_roll_deg": (
            round(float(camera_roll_deg), 3)
            if camera_roll_deg is not None
            else None
        ),
        "roll_confidence": round(_clamp(roll_confidence, 0.0, 1.0), 3),
        "candidate_count": len(boundary_candidates),
        "vertical_candidate_count": len(vertical_candidates),
        "image_width": source_width,
        "image_height": source_height,
        "processing_time_ms": round(
            (time.perf_counter() - started_at) * 1000.0,
            2,
        ),
    }
