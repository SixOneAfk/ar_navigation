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
