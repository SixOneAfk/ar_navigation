import base64
import unittest
from unittest.mock import patch

import cv2
import numpy as np
from fastapi import HTTPException

import main


def _jpeg_payload() -> str:
    image = np.full((480, 640, 3), 255, dtype=np.uint8)
    encoded_ok, encoded = cv2.imencode(".jpg", image)
    if not encoded_ok:
        raise RuntimeError("Unable to encode test image")
    return base64.b64encode(encoded.tobytes()).decode("ascii")


class ImagePipelineTests(unittest.TestCase):
    def test_decode_image_accepts_jpeg_base64(self) -> None:
        decoded = main._decode_image(_jpeg_payload())

        self.assertEqual(decoded.shape, (480, 640, 3))

    def test_decode_image_rejects_invalid_base64(self) -> None:
        with self.assertRaises(HTTPException) as context:
            main._decode_image("not-valid-base64")

        self.assertEqual(context.exception.status_code, 400)

    def test_score_match_uses_edit_distance(self) -> None:
        self.assertAlmostEqual(main._score_match("ROM101", "ROOM101"), 6 / 7)

    def test_match_node_accepts_similar_signage(self) -> None:
        node_id, detected_text, confidence = main._match_node([("ROM 101", 0.9)])

        self.assertEqual(node_id, "N101")
        self.assertEqual(detected_text, "ROM101")
        self.assertGreater(confidence, 0.7)


class EasyOcrCacheTests(unittest.TestCase):
    def tearDown(self) -> None:
        main._get_easyocr_reader.cache_clear()

    def test_reader_is_created_once(self) -> None:
        reader = object()
        fake_easyocr = type(
            "FakeEasyOcr",
            (),
            {"Reader": unittest.mock.Mock(return_value=reader)},
        )

        with patch.object(main, "easyocr", fake_easyocr):
            main._get_easyocr_reader.cache_clear()
            first = main._get_easyocr_reader()
            second = main._get_easyocr_reader()

        self.assertIs(first, reader)
        self.assertIs(second, reader)
        fake_easyocr.Reader.assert_called_once_with(["en"], gpu=False)


class RecalibrateTests(unittest.TestCase):
    @patch.object(main, "_estimate_horizon_roll_deg", return_value=(4.2, 0.81))
    @patch.object(main, "_ocr_candidates", return_value=[("ROOM 201", 0.95)])
    def test_recalibrate_returns_matching_node(
        self,
        _mock_ocr: object,
        _mock_horizon: object,
    ) -> None:
        request = main.RecalibrateRequest(
            session_id="test-session",
            timestamp=1,
            estimated_position=main.EstimatedPosition(x=0.0, y=0.0, floor=1),
            image_payload=_jpeg_payload(),
        )

        response = main.recalibrate_position(request)

        self.assertTrue(response.recalibrated)
        self.assertEqual(response.matched_node_id, "N201")
        self.assertEqual(response.detected_text, "ROOM201")
        self.assertEqual(response.marker_position, main.MARKER_COORDINATES["N201"])
        self.assertGreaterEqual(len(response.ocr_candidates), 1)
        self.assertIsNone(response.failure_reason)
        self.assertEqual(response.cv_horizon_roll_deg, 4.2)
        self.assertEqual(response.cv_horizon_confidence, 0.81)



class StructuralLinesEndpointTests(unittest.TestCase):
    @patch.object(main, "estimate_camera_pose")
    @patch.object(main, "detect_structural_lines")
    def test_endpoint_returns_diagnostic_pose_without_applying_it(
        self,
        detect_mock: unittest.mock.Mock,
        pose_mock: unittest.mock.Mock,
    ) -> None:
        wall_outline = {
            "top_left": {"x": 0.2, "y": 0.2},
            "top_right": {"x": 0.8, "y": 0.2},
            "bottom_right": {"x": 0.9, "y": 0.7},
            "bottom_left": {"x": 0.1, "y": 0.7},
        }
        detect_mock.return_value = {
            "detected": True,
            "floor_boundary": {"x1": 0.1, "y1": 0.7, "x2": 0.9, "y2": 0.7},
            "boundary_angle_deg": 0.0,
            "boundary_confidence": 0.9,
            "camera_roll_deg": 0.0,
            "roll_confidence": 0.9,
            "wall_outline": wall_outline,
            "wall_confidence": 0.84,
            "wall_candidate_count": 2,
            "candidate_count": 8,
            "vertical_candidate_count": 4,
            "image_width": 640,
            "image_height": 480,
            "processing_time_ms": 3.2,
        }
        pose_mock.return_value = (
            {
                "position": {"x": 0.3, "y": 1.55, "z": -0.3},
                "delta": {
                    "x": 0.3,
                    "y": -0.05,
                    "z": -0.3,
                    "horizontal_m": 0.424,
                    "distance_m": 0.427,
                },
                "confidence": 0.79,
                "reprojection_error_px": 1.2,
                "distance_to_wall_m": 4.71,
                "method": "solvepnp_ippe_planar",
                "diagnostic_only": True,
            },
            None,
        )
        corners = [
            {"x": -2.0, "y": 3.0, "z": -5.0},
            {"x": 2.0, "y": 3.0, "z": -5.0},
            {"x": 2.0, "y": 0.0, "z": -5.0},
            {"x": -2.0, "y": 0.0, "z": -5.0},
        ]
        request = main.StructuralLinesRequest(
            session_id="test-session",
            timestamp=1,
            image_payload=_jpeg_payload(),
            estimated_position={"x": 0.0, "y": 1.6, "z": 0.0},
            camera_intrinsics={
                "fx": 554.256,
                "fy": 554.256,
                "cx": 320.0,
                "cy": 240.0,
            },
            wall_reference={"id": "wall-front", "corners": corners},
            reference_confidence=0.82,
            intrinsics_confidence=0.35,
        )

        response = main.structural_lines(request)

        self.assertEqual(response.selected_wall_id, "wall-front")
        self.assertIsNone(response.pose_failure_reason)
        self.assertIsNotNone(response.pose_estimate)
        if response.pose_estimate is None:
            self.fail("Expected a diagnostic pose estimate")
        self.assertTrue(response.pose_estimate.diagnostic_only)
        self.assertAlmostEqual(response.pose_estimate.delta.horizontal_m, 0.424)
        pose_mock.assert_called_once_with(
            wall_outline,
            corners,
            {
                "fx": 554.256,
                "fy": 554.256,
                "cx": 320.0,
                "cy": 240.0,
                "distortion": [0.0, 0.0, 0.0, 0.0, 0.0],
            },
            {"x": 0.0, "y": 1.6, "z": 0.0},
            640,
            480,
            0.84,
            0.82,
            0.35,
        )


if __name__ == "__main__":
    unittest.main()
