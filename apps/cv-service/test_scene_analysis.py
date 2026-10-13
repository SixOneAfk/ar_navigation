import base64
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import cv2
import numpy as np
from fastapi import HTTPException
from pydantic import ValidationError

import main
from scene_analysis import SceneAnalyzer, object_detections, read_scene_text


def tensor(values: list) -> Mock:
    value = Mock()
    value.cpu.return_value.numpy.return_value = np.array(values, dtype=np.float32)
    return value


def prediction() -> SimpleNamespace:
    return SimpleNamespace(
        boxes=SimpleNamespace(
            xyxyn=tensor([[0.2, 0.1, 0.6, 0.9], [0.1, 0.2, 0.2, 0.3]]),
            conf=tensor([0.85, 0.1]),
            cls=tensor([0, 1]),
        ),
        masks=None,
        names={0: "door", 1: "lamp"},
    )


class SceneAnalyzerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.image = np.full((480, 640, 3), 225, dtype=np.uint8)
        self.model = Mock()
        self.model.names = {0: "door", 1: "lamp"}
        self.model.predict.return_value = [prediction()]
        self.loader = Mock(return_value=self.model)
        self.text_reader = Mock(return_value=[])
        self.analyzer = SceneAnalyzer(self.loader, self.text_reader)

    def test_caches_model_and_returns_normalized_diagnostic_detections(self) -> None:
        result = self.analyzer.analyze(self.image)
        self.analyzer.analyze(self.image)

        self.loader.assert_called_once()
        self.assertEqual(result["status"], "ready")
        self.assertTrue(result["diagnostic_only"])
        self.assertEqual(result["vocabulary_size"], 2)
        self.assertEqual(len(result["detections"]), 1)
        self.assertEqual(result["detections"][0]["label"], "door")
        self.assertAlmostEqual(result["detections"][0]["confidence"], 0.85)
        for point in result["detections"][0]["polygon"]:
            self.assertTrue(0.0 <= point["x"] <= 1.0)
            self.assertTrue(0.0 <= point["y"] <= 1.0)
        self.assertEqual(self.model.predict.call_args.kwargs["device"], "cpu")
        self.assertEqual(self.model.predict.call_args.kwargs["max_det"], 40)

    def test_returns_busy_without_queuing_or_running_ocr(self) -> None:
        self.analyzer._lock.acquire()
        try:
            result = self.analyzer.analyze(self.image)
        finally:
            self.analyzer._lock.release()

        self.assertEqual(result["status"], "busy")
        self.loader.assert_not_called()
        self.text_reader.assert_not_called()

    def test_keeps_text_results_when_optional_model_is_unavailable(self) -> None:
        self.loader.side_effect = FileNotFoundError("Prepare the model")
        self.text_reader.return_value = [{
            "kind": "text", "label": "ROOM 101", "confidence": 0.9,
            "polygon": [{"x": 0.1, "y": 0.1}] * 4,
        }]

        result = self.analyzer.analyze(self.image)
        self.analyzer.analyze(self.image)

        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["detector_status"], "unavailable")
        self.assertEqual(result["detections"][0]["label"], "ROOM 101")
        self.loader.assert_called_once()

    def test_can_disable_ocr(self) -> None:
        result = self.analyzer.analyze(self.image, include_text=False)

        self.text_reader.assert_not_called()
        self.assertEqual(result["text_status"], "disabled")

    def test_ocr_failure_keeps_object_detections_and_releases_lock(self) -> None:
        self.text_reader.side_effect = RuntimeError("Tesseract timeout")
        result = self.analyzer.analyze(self.image)

        self.assertEqual(result["text_status"], "unavailable")
        self.assertEqual(result["detections"][0]["label"], "door")
        self.assertFalse(self.analyzer._lock.locked())

    def test_uses_segmentation_polygon_when_available(self) -> None:
        result = prediction()
        result.masks = SimpleNamespace(xyn=[np.array([[0.2, 0.1], [0.6, 0.1], [0.4, 0.9]])])

        detections = object_detections(result, 0.25)

        self.assertEqual(len(detections[0]["polygon"]), 3)

    def test_ignores_nonfinite_model_outputs(self) -> None:
        result = prediction()
        result.boxes.conf = tensor([float("nan"), float("inf")])
        self.assertEqual(object_detections(result, 0.25), [])

    @patch("pytesseract.image_to_data")
    def test_groups_ocr_words_into_a_label_and_bounds(self, read_mock: Mock) -> None:
        read_mock.return_value = {
            "text": ["ROOM", "101", "noise"], "conf": [90, 80, 10],
            "block_num": [1, 1, 2], "par_num": [1, 1, 1], "line_num": [1, 1, 1],
            "left": [64, 150, 10], "top": [48, 48, 10],
            "width": [75, 40, 10], "height": [30, 30, 10],
        }

        result = read_scene_text(self.image, 0.25)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["label"], "ROOM 101")
        self.assertAlmostEqual(result[0]["confidence"], 0.85)
        self.assertEqual(result[0]["polygon"][0], {"x": 0.1, "y": 0.1})
        self.assertEqual(read_mock.call_args.kwargs["timeout"], 1.5)


class SceneEndpointTests(unittest.TestCase):
    def test_validates_confidence_limits(self) -> None:
        for confidence in (0.0, 1.1, float("nan")):
            with self.assertRaises(ValidationError):
                main.SceneAnalysisRequest(image_payload="image", minimum_confidence=confidence)

    def test_rejects_invalid_image(self) -> None:
        with self.assertRaises(HTTPException) as context:
            main.analyze_scene(main.SceneAnalysisRequest(image_payload="invalid"))
        self.assertEqual(context.exception.status_code, 400)

    def test_rejects_oversized_frame(self) -> None:
        image = np.zeros((961, 640, 3), dtype=np.uint8)
        success, encoded = cv2.imencode(".jpg", image)
        self.assertTrue(success)
        payload = base64.b64encode(encoded.tobytes()).decode("ascii")
        with self.assertRaises(HTTPException):
            main.analyze_scene(main.SceneAnalysisRequest(image_payload=payload))

    @patch.object(main.scene_analyzer, "analyze")
    def test_forwards_settings_without_position_corrections(self, analyze_mock: Mock) -> None:
        image = np.zeros((480, 640, 3), dtype=np.uint8)
        _, encoded = cv2.imencode(".jpg", image)
        analyze_mock.return_value = SceneAnalyzer(
            model_loader=Mock(side_effect=RuntimeError("optional")),
            text_reader=Mock(return_value=[]),
        ).analyze(image, include_text=False)
        payload = base64.b64encode(encoded.tobytes()).decode("ascii")

        response = main.analyze_scene(main.SceneAnalysisRequest(
            image_payload=payload, minimum_confidence=0.4, include_text=False,
        ))

        self.assertTrue(response.diagnostic_only)
        self.assertEqual(analyze_mock.call_args.args[1:], (0.4, False))


if __name__ == "__main__":
    unittest.main()
