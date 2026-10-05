import base64
import math
import unittest
from unittest.mock import patch

import cv2
import numpy as np

import main
from structural_lines import detect_structural_lines
from wall_pose import estimate_camera_pose


def _structural_image(tilt_px: int = 0) -> np.ndarray:
    image = np.full((480, 640, 3), 225, dtype=np.uint8)
    cv2.line(image, (30, 330), (610, 330 + tilt_px), (30, 30, 30), 6)
    cv2.line(image, (100, 50), (100 + tilt_px, 430), (30, 30, 30), 6)
    cv2.line(image, (540, 50), (540 + tilt_px, 430), (30, 30, 30), 6)
    return image


def _corner_image() -> np.ndarray:
    image = np.full((480, 640, 3), 225, dtype=np.uint8)
    cv2.line(image, (20, 410), (320, 285), (30, 30, 30), 6)
    cv2.line(image, (320, 285), (620, 400), (30, 30, 30), 6)
    cv2.line(image, (20, 80), (20, 410), (30, 30, 30), 6)
    cv2.line(image, (320, 40), (320, 285), (30, 30, 30), 6)
    cv2.line(image, (620, 90), (620, 400), (30, 30, 30), 6)
    cv2.line(image, (20, 80), (320, 40), (30, 30, 30), 6)
    cv2.line(image, (320, 40), (620, 90), (30, 30, 30), 6)
    return image


def _downward_view_image() -> np.ndarray:
    image = np.full((480, 640, 3), 225, dtype=np.uint8)
    cv2.line(image, (30, 95), (610, 105), (30, 30, 30), 6)
    cv2.line(image, (100, 20), (100, 450), (30, 30, 30), 6)
    cv2.line(image, (540, 20), (540, 450), (30, 30, 30), 6)
    return image


def _door_image() -> np.ndarray:
    image = np.full((480, 640, 3), 225, dtype=np.uint8)
    cv2.line(image, (20, 370), (620, 370), (30, 30, 30), 6)
    cv2.rectangle(image, (190, 70), (500, 370), (30, 30, 30), 6)
    cv2.line(image, (210, 250), (500, 340), (30, 30, 30), 6)
    return image


def _tiled_floor_image(wall_edges: bool = True) -> np.ndarray:
    image = np.full((480, 640, 3), 225, dtype=np.uint8)
    image[280:] = 195
    cv2.line(image, (20, 280), (620, 280), (100, 100, 100), 4)
    if wall_edges:
        cv2.line(image, (80, 40), (80, 280), (30, 30, 30), 6)
        cv2.line(image, (560, 40), (560, 280), (30, 30, 30), 6)
    for row in (335, 390, 450):
        cv2.line(image, (20, row), (620, row), (20, 20, 20), 8)
    return image


def _jpeg_payload(image: np.ndarray) -> str:
    encoded_ok, encoded = cv2.imencode(".jpg", image)
    if not encoded_ok:
        raise RuntimeError("Unable to encode test image")
    return base64.b64encode(encoded.tobytes()).decode("ascii")


class StructuralLineDetectorTests(unittest.TestCase):
    def test_detects_floor_boundary_and_vertical_roll(self) -> None:
        result = detect_structural_lines(_structural_image())

        self.assertTrue(result["detected"])
        self.assertIsNotNone(result["floor_boundary"])
        self.assertGreater(result["boundary_confidence"], 0.7)
        self.assertAlmostEqual(result["boundary_angle_deg"], 0.0, delta=1.0)
        self.assertAlmostEqual(result["camera_roll_deg"], 0.0, delta=1.0)
        self.assertGreater(result["roll_confidence"], 0.7)

    def test_detects_complete_wall_outline(self) -> None:
        image = _structural_image()
        cv2.line(image, (100, 90), (540, 90), (30, 30, 30), 6)

        result = detect_structural_lines(image)

        self.assertIsNotNone(result["wall_outline"])
        self.assertGreater(result["wall_confidence"], 0.7)
        self.assertGreater(result["wall_candidate_count"], 0)

    def test_estimates_roll_from_multiple_vertical_edges(self) -> None:
        result = detect_structural_lines(_structural_image(tilt_px=40))

        self.assertIsNotNone(result["camera_roll_deg"])
        self.assertAlmostEqual(result["camera_roll_deg"], -6.0, delta=1.5)
        self.assertGreater(result["roll_confidence"], 0.6)

    def test_keeps_both_floor_edges_at_a_corner(self) -> None:
        result = detect_structural_lines(_corner_image())

        self.assertTrue(result["detected"])
        self.assertGreaterEqual(len(result["floor_boundaries"]), 2)
        angles = sorted(
            boundary["angle_deg"]
            for boundary in result["floor_boundaries"]
        )
        self.assertLess(angles[0], -10.0)
        self.assertGreater(angles[-1], 10.0)

    def test_rejects_door_lines_above_floor_boundary(self) -> None:
        result = detect_structural_lines(_door_image())

        self.assertTrue(result["detected"])
        self.assertEqual(len(result["floor_boundaries"]), 1)
        boundary = result["floor_boundaries"][0]["line"]
        self.assertGreater(boundary["y1"], 0.72)
        self.assertGreater(boundary["y2"], 0.72)

    def test_keeps_corner_floor_edges_with_door_detail(self) -> None:
        image = _corner_image()
        cv2.line(image, (370, 170), (590, 355), (30, 30, 30), 6)

        result = detect_structural_lines(image)

        self.assertEqual(len(result["floor_boundaries"]), 2)
        angles = sorted(
            boundary["angle_deg"]
            for boundary in result["floor_boundaries"]
        )
        self.assertLess(angles[0], -10.0)
        self.assertGreater(angles[-1], 10.0)

    def test_prefers_wall_junction_over_contrasting_tile_stripes(self) -> None:
        result = detect_structural_lines(_tiled_floor_image())

        self.assertTrue(result["detected"])
        self.assertEqual(len(result["floor_boundaries"]), 1)
        boundary = result["floor_boundaries"][0]["line"]
        self.assertAlmostEqual(boundary["y1"], 280 / 480, delta=0.035)
        self.assertAlmostEqual(boundary["y2"], 280 / 480, delta=0.035)

    def test_preserves_tiled_wall_junction_under_perspective(self) -> None:
        transform = cv2.getPerspectiveTransform(
            np.float32([[0, 0], [639, 0], [639, 479], [0, 479]]),
            np.float32([[75, 40], [560, 10], [630, 460], [10, 475]]),
        )
        image = cv2.warpPerspective(
            _tiled_floor_image(),
            transform,
            (640, 480),
            borderValue=(225, 225, 225),
        )
        image = main._decode_image(_jpeg_payload(image))
        expected = cv2.perspectiveTransform(
            np.float32([[[20, 280], [620, 280]]]),
            transform,
        )[0]

        result = detect_structural_lines(image)

        self.assertEqual(len(result["floor_boundaries"]), 1)
        boundary = result["floor_boundaries"][0]["line"]
        for index, endpoint in enumerate(expected, start=1):
            self.assertAlmostEqual(boundary[f"x{index}"], endpoint[0] / 640, delta=0.035)
            self.assertAlmostEqual(boundary[f"y{index}"], endpoint[1] / 480, delta=0.035)

    def test_tracks_tiled_floor_while_downward_pitch_skips_walls(self) -> None:
        image = cv2.warpAffine(
            _tiled_floor_image(),
            np.float32([[1, 0, 0], [0, 1, -140]]),
            (640, 480),
            borderValue=(195, 195, 195),
        )

        result = detect_structural_lines(image, device_pitch_deg=40.0)

        self.assertTrue(result["wall_detection_skipped"])
        self.assertEqual(len(result["floor_boundaries"]), 1)
        boundary = result["floor_boundaries"][0]["line"]
        self.assertAlmostEqual(boundary["y1"], 140 / 480, delta=0.035)
        self.assertAlmostEqual(boundary["y2"], 140 / 480, delta=0.035)

    def test_abstains_when_parallel_stripes_have_no_wall_evidence(self) -> None:
        result = detect_structural_lines(_tiled_floor_image(wall_edges=False))

        self.assertFalse(result["detected"])
        self.assertEqual(result["floor_boundaries"], [])
        self.assertIsNone(result["floor_boundary"])

    def test_tile_grid_junctions_do_not_count_as_wall_evidence(self) -> None:
        image = np.full((480, 640, 3), 225, dtype=np.uint8)
        for row in (220, 330, 440):
            cv2.line(image, (20, row), (620, row), (30, 30, 30), 6)
        for column in (160, 480):
            cv2.line(image, (column, 220), (column, 479), (30, 30, 30), 6)

        result = detect_structural_lines(image)

        self.assertFalse(result["detected"])
        self.assertEqual(result["floor_boundaries"], [])

    def test_preserves_corner_boundaries_with_floor_stripes(self) -> None:
        image = _corner_image()
        for row, left, right in ((340, 200, 460), (385, 85, 585), (445, 20, 620)):
            cv2.line(image, (left, row), (right, row), (30, 30, 30), 6)

        result = detect_structural_lines(image)

        self.assertEqual(len(result["floor_boundaries"]), 2)
        angles = sorted(
            boundary["angle_deg"] for boundary in result["floor_boundaries"]
        )
        self.assertLess(angles[0], -10.0)
        self.assertGreater(angles[1], 10.0)

    def test_separates_two_wall_outlines_at_a_corner(self) -> None:
        result = detect_structural_lines(_corner_image())

        self.assertEqual(len(result["wall_outlines"]), 2)
        self.assertEqual(
            {
                outline["floor_boundary_index"]
                for outline in result["wall_outlines"]
            },
            {0, 1},
        )
        for detection in result["wall_outlines"]:
            outline = detection["outline"]
            bottom_width = (
                outline["bottom_right"]["x"]
                - outline["bottom_left"]["x"]
            )
            self.assertLess(bottom_width, 0.6)

    def test_keeps_floor_detection_when_downward_pitch_skips_walls(self) -> None:
        result = detect_structural_lines(
            _downward_view_image(),
            device_pitch_deg=40.0,
        )

        self.assertTrue(result["detected"])
        self.assertGreaterEqual(len(result["floor_boundaries"]), 1)
        self.assertTrue(result["wall_detection_skipped"])
        self.assertEqual(
            result["wall_detection_reason"],
            "device_pitch_exceeds_wall_search_limit",
        )
        self.assertIsNone(result["wall_outline"])


class StructuralLinesEndpointTests(unittest.TestCase):
    @patch.object(main, "_ocr_candidates")
    def test_endpoint_does_not_run_ocr(self, mock_ocr: object) -> None:
        request = main.StructuralLinesRequest(
            session_id="test-session",
            timestamp=1,
            image_payload=_jpeg_payload(_structural_image()),
            device_roll_deg=0.0,
        )

        response = main.structural_lines(request)

        self.assertTrue(response.detected)
        self.assertIsNotNone(response.floor_boundary)
        self.assertGreater(response.boundary_confidence, 0.7)
        self.assertGreater(response.roll_confidence, 0.7)
        mock_ocr.assert_not_called()


class CameraPoseTests(unittest.TestCase):
    def test_recovers_camera_position_from_known_wall(self) -> None:
        outline = {
            "top_left": {"x": 0.1875, "y": 0.2916667},
            "top_right": {"x": 0.8125, "y": 0.2916667},
            "bottom_right": {"x": 0.8125, "y": 0.7083333},
            "bottom_left": {"x": 0.1875, "y": 0.7083333},
        }
        wall_corners = [
            {"x": -2.0, "y": 2.0, "z": 0.0},
            {"x": 2.0, "y": 2.0, "z": 0.0},
            {"x": 2.0, "y": 0.0, "z": 0.0},
            {"x": -2.0, "y": 0.0, "z": 0.0},
        ]
        intrinsics = {
            "fx": 500.0,
            "fy": 500.0,
            "cx": 320.0,
            "cy": 240.0,
            "distortion": [0.0] * 5,
        }
        prior = {"x": 0.2, "y": 1.0, "z": 4.8}

        estimate, failure = estimate_camera_pose(
            outline,
            wall_corners,
            intrinsics,
            prior,
            640,
            480,
            wall_confidence=0.95,
            reference_confidence=0.9,
            intrinsics_confidence=0.8,
        )

        self.assertIsNone(failure)
        self.assertIsNotNone(estimate)
        if estimate is None:
            self.fail("Expected a pose estimate")
        position = estimate["position"]
        self.assertAlmostEqual(position["x"], 0.0, delta=0.02)
        self.assertAlmostEqual(position["y"], 1.0, delta=0.02)
        self.assertAlmostEqual(position["z"], 5.0, delta=0.02)
        self.assertAlmostEqual(
            estimate["delta"]["horizontal_m"],
            math.hypot(0.2, 0.2),
            delta=0.02,
        )
        self.assertLess(estimate["reprojection_error_px"], 0.1)
        self.assertTrue(estimate["diagnostic_only"])

    def test_prefers_low_error_solution_for_detected_outline(self) -> None:
        outline = {
            "top_left": {"x": 0.18622, "y": 0.29018},
            "top_right": {"x": 0.81153, "y": 0.29012},
            "bottom_right": {"x": 0.81121, "y": 0.70231},
            "bottom_left": {"x": 0.18651, "y": 0.70228},
        }
        wall_corners = [
            {"x": -2.0, "y": 2.0, "z": 0.0},
            {"x": 2.0, "y": 2.0, "z": 0.0},
            {"x": 2.0, "y": 0.0, "z": 0.0},
            {"x": -2.0, "y": 0.0, "z": 0.0},
        ]

        estimate, failure = estimate_camera_pose(
            outline,
            wall_corners,
            {
                "fx": 500.0,
                "fy": 500.0,
                "cx": 320.0,
                "cy": 240.0,
                "distortion": [0.0] * 5,
            },
            {"x": 0.2, "y": 1.0, "z": 4.8},
            640,
            480,
            wall_confidence=0.84,
            reference_confidence=0.9,
            intrinsics_confidence=0.8,
        )

        self.assertIsNone(failure)
        self.assertIsNotNone(estimate)
        if estimate is None:
            self.fail("Expected a pose estimate")
        position = estimate["position"]
        self.assertAlmostEqual(position["x"], 0.0, delta=0.02)
        self.assertAlmostEqual(position["y"], 1.0, delta=0.03)
        self.assertAlmostEqual(position["z"], 5.0, delta=0.03)
        self.assertLess(estimate["reprojection_error_px"], 1.1)
        self.assertIn(
            estimate["method"],
            {"solvepnp_iterative_planar", "solvepnp_sqpnp_planar"},
        )



if __name__ == "__main__":
    unittest.main()
