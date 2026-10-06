import math
import time
from typing import Any

import cv2
import numpy as np
from wall_pose import detect_wall_outline


MAX_FLOOR_BOUNDARIES = 3
MAX_WALL_OUTLINES = 3
WALL_SEARCH_MAX_DOWNWARD_PITCH_DEG = 30.0
FLOOR_JOIN_ENDPOINT_TOLERANCE = 0.13
FLOOR_ENVELOPE_MIN_OVERLAP_RATIO = 0.55
FLOOR_ENVELOPE_MIN_VERTICAL_GAP = 0.035
FLOOR_WALL_SUPPORT_THRESHOLD = 0.45


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


def _line_y_at_x(
    line: dict[str, float],
    normalized_x: float,
) -> float:
    delta_x = line["x2"] - line["x1"]
    if abs(delta_x) < 1e-6:
        return (line["y1"] + line["y2"]) / 2.0
    ratio = (normalized_x - line["x1"]) / delta_x
    return line["y1"] + (ratio * (line["y2"] - line["y1"]))


def _normalized_line_intersection(
    first: dict[str, float],
    second: dict[str, float],
) -> tuple[float, float] | None:
    x1, y1, x2, y2 = (
        first["x1"],
        first["y1"],
        first["x2"],
        first["y2"],
    )
    x3, y3, x4, y4 = (
        second["x1"],
        second["y1"],
        second["x2"],
        second["y2"],
    )
    denominator = ((x1 - x2) * (y3 - y4)) - ((y1 - y2) * (x3 - x4))
    if abs(denominator) < 1e-7:
        return None
    first_cross = (x1 * y2) - (y1 * x2)
    second_cross = (x3 * y4) - (y3 * x4)
    return (
        ((first_cross * (x3 - x4)) - ((x1 - x2) * second_cross))
        / denominator,
        ((first_cross * (y3 - y4)) - ((y1 - y2) * second_cross))
        / denominator,
    )


def _line_x_range(line: dict[str, float]) -> tuple[float, float]:
    return min(line["x1"], line["x2"]), max(line["x1"], line["x2"])


def _intersection_joins_line_endpoints(
    first: dict[str, float],
    second: dict[str, float],
    intersection: tuple[float, float],
) -> bool:
    def nearest_endpoint_distance(line: dict[str, float]) -> float:
        return min(
            math.hypot(
                intersection[0] - line["x1"],
                intersection[1] - line["y1"],
            ),
            math.hypot(
                intersection[0] - line["x2"],
                intersection[1] - line["y2"],
            ),
        )

    return (
        nearest_endpoint_distance(first) <= FLOOR_JOIN_ENDPOINT_TOLERANCE
        and nearest_endpoint_distance(second) <= FLOOR_JOIN_ENDPOINT_TOLERANCE
    )


def _is_above_lower_envelope(
    candidate: dict[str, Any],
    other: dict[str, Any],
) -> bool:
    candidate_left, candidate_right = _line_x_range(candidate["line"])
    other_left, other_right = _line_x_range(other["line"])
    candidate_span = candidate_right - candidate_left
    other_span = other_right - other_left
    overlap_left = max(candidate_left, other_left)
    overlap_right = min(candidate_right, other_right)
    overlap = overlap_right - overlap_left

    if (
        candidate_span <= 1e-6
        or overlap <= 0.0
        or overlap / candidate_span < FLOOR_ENVELOPE_MIN_OVERLAP_RATIO
        or other_span < candidate_span * 0.75
        or other["confidence"] < max(0.34, candidate["confidence"] * 0.60)
    ):
        return False

    sample_positions = (0.1, 0.3, 0.5, 0.7, 0.9)
    vertical_gaps = [
        _line_y_at_x(
            other["line"],
            overlap_left + (overlap * sample_position),
        )
        - _line_y_at_x(
            candidate["line"],
            overlap_left + (overlap * sample_position),
        )
        for sample_position in sample_positions
    ]
    lower_sample_count = sum(gap >= 0.018 for gap in vertical_gaps)
    return (
        lower_sample_count >= 4
        and sum(vertical_gaps) / len(vertical_gaps)
        >= FLOOR_ENVELOPE_MIN_VERTICAL_GAP
    )


def _wall_endpoint_support(
    line: dict[str, float],
    vertical_segments: list[dict[str, float]],
    width: int,
    height: int,
    parallel_lines: list[dict[str, float]],
) -> float:
    left, right = _line_x_range(line)
    junctions: list[tuple[float, float]] = []
    for segment in vertical_segments:
        if segment["y1"] < segment["y2"]:
            top_y = segment["y1"]
            bottom_x, bottom_y = segment["x2"], segment["y2"]
        else:
            top_y = segment["y2"]
            bottom_x, bottom_y = segment["x1"], segment["y1"]
        normalized_x = bottom_x / width
        if not left - 0.04 <= normalized_x <= right + 0.04:
            continue
        boundary_y = _line_y_at_x(line, normalized_x) * height
        gap = abs(bottom_y - boundary_y) / height
        if gap > 0.05 or boundary_y - top_y < height * 0.14:
            continue
        family_top_y = min(
            (
                _line_y_at_x(other, normalized_x) * height
                for other in parallel_lines
                if other["x1"] - 0.04 <= normalized_x <= other["x2"] + 0.04
            ),
            default=boundary_y,
        )
        if top_y > family_top_y - (height * 0.10):
            continue
        junctions.append((normalized_x, 1.0 - (gap / 0.05)))

    unique_junctions: list[tuple[float, float]] = []
    for junction in sorted(junctions, key=lambda item: item[1], reverse=True):
        if not any(
            abs(junction[0] - existing[0]) < 0.06
            for existing in unique_junctions
        ):
            unique_junctions.append(junction)
    return min(sum(score for _x, score in unique_junctions) / 2.0, 1.0)


def _overlapping_parallel_lines(
    first: dict[str, Any],
    second: dict[str, Any],
) -> bool:
    if _angle_delta_deg(first["angle_deg"], second["angle_deg"]) > 10.0:
        return False
    first_left, first_right = _line_x_range(first["line"])
    second_left, second_right = _line_x_range(second["line"])
    overlap = min(first_right, second_right) - max(first_left, second_left)
    shorter_span = min(first_right - first_left, second_right - second_left)
    return overlap > 0.0 and overlap >= shorter_span * 0.60


def _filter_floor_texture(
    hypotheses: list[dict[str, Any]],
    vertical_segments: list[dict[str, float]],
    width: int,
    height: int,
) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    for hypothesis in sorted(
        hypotheses,
        key=lambda item: item["confidence"],
        reverse=True,
    ):
        if any(
            _overlapping_parallel_lines(hypothesis, existing)
            and abs(
                _line_y_at_x(hypothesis["line"], hypothesis["mid_x"])
                - _line_y_at_x(existing["line"], hypothesis["mid_x"])
            ) < 0.035
            for existing in unique
        ):
            continue
        unique.append(hypothesis)

    for hypothesis in unique:
        parallel_lines = [
            other["line"]
            for other in unique
            if _overlapping_parallel_lines(hypothesis, other)
        ]
        hypothesis["wall_support"] = _wall_endpoint_support(
            hypothesis["line"],
            vertical_segments,
            width,
            height,
            parallel_lines,
        )

    filtered: list[dict[str, Any]] = []
    for hypothesis in unique:
        if hypothesis["wall_support"] >= FLOOR_WALL_SUPPORT_THRESHOLD:
            filtered.append(hypothesis)
            continue
        parallel_count = sum(
            other is not hypothesis
            and _overlapping_parallel_lines(hypothesis, other)
            for other in unique
        )
        below_supported_boundary = any(
            other["wall_support"] >= FLOOR_WALL_SUPPORT_THRESHOLD
            and _is_above_lower_envelope(other, hypothesis)
            for other in unique
        )
        # Repeated unsupported lines are ambiguous floor texture.
        if parallel_count < 2 and not below_supported_boundary:
            filtered.append(hypothesis)
    return filtered


def _floor_search_region(
    device_pitch_deg: float | None,
) -> tuple[float, float, float]:
    if device_pitch_deg is None or not math.isfinite(device_pitch_deg):
        target_y = 0.68
    else:
        pitch = _clamp(device_pitch_deg, -30.0, 60.0)
        target_y = _clamp(0.68 - (pitch * 0.007), 0.22, 0.86)
    return max(0.06, target_y - 0.38), min(0.96, target_y + 0.38), target_y


def _detect_floor_boundaries(
    segments: list[dict[str, float]],
    width: int,
    height: int,
    device_pitch_deg: float | None,
) -> tuple[list[dict[str, Any]], int]:
    minimum_y, maximum_y, target_y = _floor_search_region(device_pitch_deg)
    candidates = [
        segment
        for segment in segments
        if abs(segment["angle"]) <= 55.0
        and height * minimum_y <= segment["mid_y"] <= height * maximum_y
    ]
    hypotheses: list[dict[str, Any]] = []
    vertical_segments = [
        segment
        for segment in segments
        if abs(segment["angle"]) >= 55.0
        and segment["length"] >= height * 0.14
    ]

    for candidate in candidates:
        dx = candidate["x2"] - candidate["x1"]
        dy = candidate["y2"] - candidate["y1"]
        supported: list[dict[str, float]] = []
        for other in candidates:
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

        line, angle = _fit_supported_line(supported, width, height)
        support_length = sum(segment["length"] for segment in supported)
        fitted_length = math.hypot(
            (line["x2"] - line["x1"]) * width,
            (line["y2"] - line["y1"]) * height,
        )
        length_score = min(fitted_length / max(width * 0.65, 1.0), 1.0)
        support_score = min(support_length / max(width * 0.9, 1.0), 1.0)
        region_score = 1.0 - min(
            abs((candidate["mid_y"] / height) - target_y) / 0.38,
            1.0,
        )
        orientation_score = 1.0 - min(abs(angle) / 55.0, 1.0)
        confidence = (
            (0.40 * length_score)
            + (0.25 * support_score)
            + (0.20 * region_score)
            + (0.15 * orientation_score)
        )
        hypotheses.append(
            {
                "line": line,
                "angle_deg": angle,
                "confidence": confidence,
                "mid_x": (line["x1"] + line["x2"]) / 2.0,
            }
        )

    hypotheses = _filter_floor_texture(hypotheses, vertical_segments, width, height)
    envelope_hypotheses = [
        hypothesis
        for hypothesis in hypotheses
        if not any(
            other is not hypothesis
            and other["wall_support"] >= hypothesis["wall_support"] * 0.75
            and _is_above_lower_envelope(hypothesis, other)
            for other in hypotheses
        )
    ]
    ranked = sorted(
        envelope_hypotheses,
        key=lambda hypothesis: (
            hypothesis["confidence"] + (0.25 * hypothesis["wall_support"])
        ),
        reverse=True,
    )
    selected: list[dict[str, Any]] = []
    for hypothesis in ranked:
        if selected and hypothesis["confidence"] < max(
            0.34,
            selected[0]["confidence"] * 0.52,
        ):
            continue
        duplicate = any(
            _angle_delta_deg(
                hypothesis["angle_deg"],
                existing["angle_deg"],
            ) <= 8.0
            and abs(
                _line_y_at_x(hypothesis["line"], 0.5)
                - _line_y_at_x(existing["line"], 0.5)
            ) <= 0.055
            for existing in selected
        )
        if duplicate:
            continue
        if selected:
            connected = False
            for existing in selected:
                intersection = _normalized_line_intersection(
                    hypothesis["line"],
                    existing["line"],
                )
                if (
                    intersection is not None
                    and -0.18 <= intersection[0] <= 1.18
                    and 0.04 <= intersection[1] <= 1.08
                    and _intersection_joins_line_endpoints(
                        hypothesis["line"],
                        existing["line"],
                        intersection,
                    )
                ):
                    connected = True
                    break
            if not connected:
                continue
        selected.append(hypothesis)
        if len(selected) >= MAX_FLOOR_BOUNDARIES:
            break

    selected.sort(key=lambda hypothesis: hypothesis["mid_x"])
    return selected, len(candidates)


def _outline_center(outline: dict[str, dict[str, float]]) -> tuple[float, float]:
    points = tuple(outline.values())
    return (
        sum(point["x"] for point in points) / len(points),
        sum(point["y"] for point in points) / len(points),
    )


def _detect_wall_outlines(
    segments: list[dict[str, float]],
    floor_boundaries: list[dict[str, Any]],
    width: int,
    height: int,
) -> tuple[list[dict[str, Any]], int]:
    detections: list[dict[str, Any]] = []
    candidate_count = 0
    for floor_index, floor_detection in enumerate(floor_boundaries):
        result = detect_wall_outline(
            segments,
            floor_detection["line"],
            width,
            height,
        )
        candidate_count += result["wall_candidate_count"]
        outline = result["wall_outline"]
        if outline is None:
            continue
        center = _outline_center(outline)
        duplicate = any(
            math.hypot(
                center[0] - existing["center"][0],
                center[1] - existing["center"][1],
            ) < 0.08
            for existing in detections
        )
        if duplicate:
            continue
        detections.append(
            {
                "outline": outline,
                "confidence": result["wall_confidence"],
                "floor_boundary_index": floor_index,
                "center": center,
            }
        )

    detections = sorted(
        detections,
        key=lambda detection: detection["confidence"],
        reverse=True,
    )[:MAX_WALL_OUTLINES]
    detections.sort(key=lambda detection: detection["center"][0])
    return [
        {
            "outline": detection["outline"],
            "confidence": detection["confidence"],
            "floor_boundary_index": detection["floor_boundary_index"],
        }
        for detection in detections
    ], candidate_count


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


def detect_structural_lines(
    image: np.ndarray,
    device_pitch_deg: float | None = None,
) -> dict[str, Any]:
    started_at = time.perf_counter()
    source_height, source_width = image.shape[:2]
    segments, width, height = _extract_segments(image)
    floor_boundaries, boundary_candidate_count = _detect_floor_boundaries(
        segments,
        width,
        height,
        device_pitch_deg,
    )
    primary_floor = max(
        floor_boundaries,
        key=lambda boundary: boundary["confidence"],
        default=None,
    )

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

    pitch_is_valid = (
        device_pitch_deg is not None
        and math.isfinite(device_pitch_deg)
    )
    wall_detection_skipped = bool(
        pitch_is_valid
        and device_pitch_deg > WALL_SEARCH_MAX_DOWNWARD_PITCH_DEG
    )
    wall_detection_reason = (
        "device_pitch_exceeds_wall_search_limit"
        if wall_detection_skipped
        else None
    )
    wall_outlines: list[dict[str, Any]] = []
    wall_candidate_count = 0
    if not wall_detection_skipped:
        wall_outlines, wall_candidate_count = _detect_wall_outlines(
            segments,
            floor_boundaries,
            width,
            height,
        )
    primary_wall = max(
        wall_outlines,
        key=lambda wall: wall["confidence"],
        default=None,
    )

    return {
        "detected": primary_floor is not None,
        "floor_boundaries": [
            {
                "line": boundary["line"],
                "angle_deg": round(float(boundary["angle_deg"]), 3),
                "confidence": round(
                    _clamp(boundary["confidence"], 0.0, 1.0),
                    3,
                ),
            }
            for boundary in floor_boundaries
        ],
        "floor_boundary": primary_floor["line"] if primary_floor else None,
        "boundary_angle_deg": (
            round(float(primary_floor["angle_deg"]), 3)
            if primary_floor is not None
            else None
        ),
        "boundary_confidence": round(
            _clamp(
                primary_floor["confidence"] if primary_floor else 0.0,
                0.0,
                1.0,
            ),
            3,
        ),
        "camera_roll_deg": (
            round(float(camera_roll_deg), 3)
            if camera_roll_deg is not None
            else None
        ),
        "roll_confidence": round(_clamp(roll_confidence, 0.0, 1.0), 3),
        "wall_outline": primary_wall["outline"] if primary_wall else None,
        "wall_confidence": primary_wall["confidence"] if primary_wall else 0.0,
        "wall_outlines": wall_outlines,
        "wall_candidate_count": wall_candidate_count,
        "wall_detection_skipped": wall_detection_skipped,
        "wall_detection_reason": wall_detection_reason,
        "device_pitch_deg": (
            round(float(device_pitch_deg), 3)
            if pitch_is_valid
            else None
        ),
        "candidate_count": boundary_candidate_count,
        "vertical_candidate_count": len(vertical_candidates),
        "image_width": source_width,
        "image_height": source_height,
        "processing_time_ms": round(
            (time.perf_counter() - started_at) * 1000.0,
            2,
        ),
    }
