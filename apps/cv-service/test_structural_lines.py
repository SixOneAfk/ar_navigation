import base64
import unittest
from unittest.mock import patch

import cv2
import numpy as np

import main
from structural_lines import detect_structural_lines


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


if __name__ == "__main__":
    unittest.main()
