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
    @patch.object(main, "_ocr_candidates", return_value=[("ROOM 201", 0.95)])
    def test_recalibrate_returns_matching_node(self, _mock_ocr: object) -> None:
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


if __name__ == "__main__":
    unittest.main()
