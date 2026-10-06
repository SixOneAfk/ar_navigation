import math
from typing import Any

import cv2
import numpy as np


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _normalize_angle_deg(value: float) -> float:
    normalized = value
    while normalized <= -90:
        normalized += 180
    while normalized > 90:
        normalized -= 180
    return normalized


def _angle_delta_deg(first: float, second: float) -> float:
    return abs(_normalize_angle_deg(first - second))


def _line_from_points(
    first: tuple[float, float],
    second: tuple[float, float],
) -> np.ndarray:
    x1, y1 = first
    x2, y2 = second
    line = np.array([y1 - y2, x2 - x1, (x1 * y2) - (x2 * y1)])
    norm = math.hypot(float(line[0]), float(line[1]))
    return line / max(norm, 1e-9)


def _line_from_normalized(
    line: dict[str, float],
    width: int,
    height: int,
) -> np.ndarray:
    return _line_from_points(
        (line["x1"] * width, line["y1"] * height),
        (line["x2"] * width, line["y2"] * height),
    )


def _fit_line(segments: list[dict[str, float]]) -> np.ndarray:
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
    line = np.array(
        [
            vy,
            -vx,
            (-vy * center_x) + (vx * center_y),
        ],
        dtype=np.float64,
    )
    return line / max(math.hypot(float(line[0]), float(line[1])), 1e-9)


def _intersection(
    first: np.ndarray,
    second: np.ndarray,
) -> tuple[float, float] | None:
    point = np.cross(first, second)
    if abs(float(point[2])) < 1e-7:
        return None
    return float(point[0] / point[2]), float(point[1] / point[2])


def _supported_segments(
    candidate: dict[str, float],
    candidates: list[dict[str, float]],
    distance_limit: float,
) -> list[dict[str, float]]:
    candidate_line = _line_from_points(
        (candidate["x1"], candidate["y1"]),
        (candidate["x2"], candidate["y2"]),
    )
    return [
        segment
        for segment in candidates
        if _angle_delta_deg(candidate["angle"], segment["angle"]) <= 8.0
        and abs(
            (candidate_line[0] * segment["mid_x"])
            + (candidate_line[1] * segment["mid_y"])
            + candidate_line[2]
        ) <= distance_limit
    ]


def _rank_fitted_lines(
    candidates: list[dict[str, float]],
    span: float,
    distance_limit: float,
) -> list[dict[str, Any]]:
    fitted: list[dict[str, Any]] = []
    for candidate in candidates:
        supported = _supported_segments(
            candidate,
            candidates,
            distance_limit,
        )
        support_length = sum(segment["length"] for segment in supported)
        score = (
            0.55 * min(candidate["length"] / max(span * 0.55, 1.0), 1.0)
            + 0.45 * min(support_length / max(span * 0.9, 1.0), 1.0)
        )
        fitted.append(
            {
                "line": _fit_line(supported),
                "score": score,
                "support_length": support_length,
                "mid_x": candidate["mid_x"],
                "mid_y": candidate["mid_y"],
            }
        )
    return sorted(fitted, key=lambda item: item["score"], reverse=True)


def _inside_margin(
    point: tuple[float, float],
    width: int,
    height: int,
    margin: float = 0.16,
) -> bool:
    x, y = point
    return (
        -width * margin <= x <= width * (1.0 + margin)
        and -height * margin <= y <= height * (1.0 + margin)
    )


def _normalized_point(
    point: tuple[float, float],
    width: int,
    height: int,
) -> dict[str, float]:
    return {
        "x": round(_clamp(point[0] / width, 0.0, 1.0), 5),
        "y": round(_clamp(point[1] / height, 0.0, 1.0), 5),
    }


def _deduplicate_vertical_lines(
    fitted: list[dict[str, Any]],
    floor_line: np.ndarray,
) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    for item in fitted:
        bottom = _intersection(item["line"], floor_line)
        if bottom is None:
            continue
        item["bottom"] = bottom
        if any(abs(existing["bottom"][0] - bottom[0]) < 14.0 for existing in unique):
            continue
        unique.append(item)
        if len(unique) >= 8:
            break
    return unique


def _deduplicate_top_lines(
    fitted: list[dict[str, Any]],
    width: int,
) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    center_x = width / 2.0
    vertical_center = np.array([1.0, 0.0, -center_x])
    for item in fitted:
        center = _intersection(item["line"], vertical_center)
        if center is None:
            continue
        item["center_y"] = center[1]
        if any(abs(existing["center_y"] - center[1]) < 12.0 for existing in unique):
            continue
        unique.append(item)
        if len(unique) >= 6:
            break
    return unique


def detect_wall_outline(
    segments: list[dict[str, float]],
    floor_boundary: dict[str, float] | None,
    width: int,
    height: int,
) -> dict[str, Any]:
    if floor_boundary is None:
        return {
            "wall_outline": None,
            "wall_confidence": 0.0,
            "wall_candidate_count": 0,
        }

    floor_line = _line_from_normalized(floor_boundary, width, height)
    vertical_segments = [
        segment
        for segment in segments
        if abs(segment["angle"]) >= 55.0
        and segment["length"] >= height * 0.14
    ]
    top_segments = [
        segment
        for segment in segments
        if abs(segment["angle"]) <= 50.0
        and segment["length"] >= width * 0.12
        and height * 0.05 <= segment["mid_y"] <= height * 0.58
    ]
    vertical_lines = _deduplicate_vertical_lines(
        _rank_fitted_lines(
            vertical_segments,
            height,
            max(7.0, width * 0.022),
        ),
        floor_line,
    )
    floor_min_x = min(floor_boundary["x1"], floor_boundary["x2"]) * width
    floor_max_x = max(floor_boundary["x1"], floor_boundary["x2"]) * width
    floor_range_margin = width * 0.08
    vertical_lines = [
        line
        for line in vertical_lines
        if floor_min_x - floor_range_margin
        <= line["bottom"][0]
        <= floor_max_x + floor_range_margin
    ]
    top_lines = _deduplicate_top_lines(
        _rank_fitted_lines(
            top_segments,
            width,
            max(7.0, height * 0.022),
        ),
        width,
    )

    best_outline: dict[str, dict[str, float]] | None = None
    best_confidence = 0.0
    candidate_count = 0

    ordered_verticals = sorted(
        vertical_lines,
        key=lambda item: item["bottom"][0],
    )
    for left_index, left in enumerate(ordered_verticals):
        for right in ordered_verticals[left_index + 1:]:
            bottom_left = left["bottom"]
            bottom_right = right["bottom"]
            bottom_width = bottom_right[0] - bottom_left[0]
            if bottom_width < width * 0.22:
                continue

            for top in top_lines:
                top_left = _intersection(left["line"], top["line"])
                top_right = _intersection(right["line"], top["line"])
                if top_left is None or top_right is None:
                    continue
                candidate_count += 1
                points = (top_left, top_right, bottom_right, bottom_left)
                if not all(
                    _inside_margin(point, width, height)
                    for point in points
                ):
                    continue

                top_width = top_right[0] - top_left[0]
                left_height = bottom_left[1] - top_left[1]
                right_height = bottom_right[1] - top_right[1]
                if (
                    top_width < width * 0.12
                    or left_height < height * 0.14
                    or right_height < height * 0.14
                ):
                    continue
                if (
                    top_left[0] >= top_right[0]
                    or bottom_left[0] >= bottom_right[0]
                ):
                    continue

                polygon = np.asarray(points, dtype=np.float32)
                area = abs(float(cv2.contourArea(polygon)))
                if area < width * height * 0.055:
                    continue

                line_score = (
                    left["score"] + right["score"] + top["score"]
                ) / 3.0
                area_score = min(area / (width * height * 0.42), 1.0)
                separation_score = min(bottom_width / (width * 0.72), 1.0)
                height_balance = 1.0 - min(
                    abs(left_height - right_height)
                    / max(left_height, right_height, 1.0),
                    1.0,
                )
                confidence = (
                    0.42 * line_score
                    + 0.24 * area_score
                    + 0.20 * separation_score
                    + 0.14 * height_balance
                )
                if confidence <= best_confidence:
                    continue

                best_confidence = confidence
                best_outline = {
                    "top_left": _normalized_point(top_left, width, height),
                    "top_right": _normalized_point(top_right, width, height),
                    "bottom_right": _normalized_point(
                        bottom_right,
                        width,
                        height,
                    ),
                    "bottom_left": _normalized_point(
                        bottom_left,
                        width,
                        height,
                    ),
                }

    return {
        "wall_outline": best_outline,
        "wall_confidence": round(_clamp(best_confidence, 0.0, 1.0), 3),
        "wall_candidate_count": candidate_count,
    }


def _outline_image_points(
    outline: dict[str, dict[str, float]],
    width: int,
    height: int,
) -> np.ndarray:
    return np.asarray(
        [
            [
                outline[key]["x"] * width,
                outline[key]["y"] * height,
            ]
            for key in (
                "top_left",
                "top_right",
                "bottom_right",
                "bottom_left",
            )
        ],
        dtype=np.float64,
    )


def estimate_camera_pose(
    outline: dict[str, dict[str, float]],
    wall_corners: list[dict[str, float]],
    camera_intrinsics: dict[str, Any],
    estimated_position: dict[str, float],
    image_width: int,
    image_height: int,
    wall_confidence: float,
    reference_confidence: float,
    intrinsics_confidence: float,
) -> tuple[dict[str, Any] | None, str | None]:
    if len(wall_corners) != 4:
        return None, "wall_reference_requires_four_corners"

    object_points = np.asarray(
        [
            [corner["x"], corner["y"], corner["z"]]
            for corner in wall_corners
        ],
        dtype=np.float64,
    )
    image_points = _outline_image_points(
        outline,
        image_width,
        image_height,
    )
    camera_matrix = np.asarray(
        [
            [
                camera_intrinsics["fx"],
                0.0,
                camera_intrinsics["cx"],
            ],
            [
                0.0,
                camera_intrinsics["fy"],
                camera_intrinsics["cy"],
            ],
            [0.0, 0.0, 1.0],
        ],
        dtype=np.float64,
    )
    distortion = np.asarray(
        camera_intrinsics.get("distortion", [0.0] * 5),
        dtype=np.float64,
    )

    centered_points = object_points - object_points.mean(axis=0)
    if np.linalg.matrix_rank(centered_points, tol=1e-6) != 2:
        return None, "wall_reference_is_not_planar"

    solver_results: list[tuple[str, np.ndarray, np.ndarray]] = []
    solver_errored = False
    solver_flags = (
        ("solvepnp_ippe_planar", cv2.SOLVEPNP_IPPE),
        ("solvepnp_iterative_planar", cv2.SOLVEPNP_ITERATIVE),
        ("solvepnp_sqpnp_planar", cv2.SOLVEPNP_SQPNP),
    )
    for method, flag in solver_flags:
        try:
            result = cv2.solvePnPGeneric(
                object_points,
                image_points,
                camera_matrix,
                distortion,
                flags=flag,
            )
        except cv2.error:
            solver_errored = True
            continue
        if not bool(result[0]):
            continue
        solver_results.extend(
            (method, rotation_vector, translation_vector)
            for rotation_vector, translation_vector in zip(
                result[1],
                result[2],
            )
        )

    if not solver_results:
        failure = (
            "pose_solver_failed"
            if solver_errored
            else "pose_solution_not_found"
        )
        return None, failure

    prior = np.asarray(
        [
            estimated_position["x"],
            estimated_position["y"],
            estimated_position["z"],
        ],
        dtype=np.float64,
    )
    candidates: list[tuple[float, float, np.ndarray, str]] = []
    for method, rotation_vector, translation_vector in solver_results:
        rotation, _ = cv2.Rodrigues(rotation_vector)
        translation = np.asarray(translation_vector).reshape(3, 1)
        camera_points = (
            rotation @ object_points.T
        ) + translation
        if np.any(camera_points[2] <= 0.05):
            continue

        camera_position = (
            -rotation.T @ translation
        ).reshape(3)
        prior_distance = float(np.linalg.norm(camera_position - prior))
        projected, _ = cv2.projectPoints(
            object_points,
            rotation_vector,
            translation_vector,
            camera_matrix,
            distortion,
        )
        reprojection_error = float(
            np.sqrt(
                np.mean(
                    np.sum(
                        (
                            projected.reshape(-1, 2)
                            - image_points
                        ) ** 2,
                        axis=1,
                    )
                )
            )
        )
        selection_score = (
            reprojection_error
            + (min(prior_distance, 30.0) * 0.12)
        )
        candidates.append(
            (
                selection_score,
                reprojection_error,
                camera_position,
                method,
            )
        )

    if not candidates:
        return None, "pose_solution_behind_camera"

    (
        _selection_score,
        reprojection_error,
        camera_position,
        selected_method,
    ) = min(candidates, key=lambda item: item[0])
    delta = camera_position - prior
    horizontal_delta = math.hypot(float(delta[0]), float(delta[2]))
    distance_delta = float(np.linalg.norm(delta))

    reprojection_score = math.exp(-reprojection_error / 6.0)
    prior_score = math.exp(-distance_delta / 8.0)
    confidence = (
        0.30 * _clamp(wall_confidence, 0.0, 1.0)
        + 0.25 * _clamp(reference_confidence, 0.0, 1.0)
        + 0.15 * _clamp(intrinsics_confidence, 0.0, 1.0)
        + 0.20 * reprojection_score
        + 0.10 * prior_score
    )

    wall_plane_points = object_points[:3]
    plane_normal = np.cross(
        wall_plane_points[1] - wall_plane_points[0],
        wall_plane_points[2] - wall_plane_points[0],
    )
    plane_normal /= max(float(np.linalg.norm(plane_normal)), 1e-9)
    distance_to_wall = abs(
        float(
            np.dot(
                camera_position - wall_plane_points[0],
                plane_normal,
            )
        )
    )

    return (
        {
            "position": {
                "x": round(float(camera_position[0]), 3),
                "y": round(float(camera_position[1]), 3),
                "z": round(float(camera_position[2]), 3),
            },
            "delta": {
                "x": round(float(delta[0]), 3),
                "y": round(float(delta[1]), 3),
                "z": round(float(delta[2]), 3),
                "horizontal_m": round(horizontal_delta, 3),
                "distance_m": round(distance_delta, 3),
            },
            "confidence": round(_clamp(confidence, 0.0, 1.0), 3),
            "reprojection_error_px": round(reprojection_error, 3),
            "distance_to_wall_m": round(distance_to_wall, 3),
            "method": selected_method,
            "diagnostic_only": True,
        },
        None,
    )
