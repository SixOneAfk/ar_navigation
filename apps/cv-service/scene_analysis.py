import logging
import math
import os
from pathlib import Path
from threading import Lock
import time
from typing import Any, Callable

import cv2
import numpy as np


LOGGER = logging.getLogger(__name__)
SERVICE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = "yoloe-26n-seg-pf.pt"
MAX_DETECTIONS = 40


def scene_model_path() -> Path:
    configured = Path(os.environ.get("CV_SCENE_MODEL_PATH", f"models/{DEFAULT_MODEL}"))
    return configured if configured.is_absolute() else SERVICE_DIR / configured


def load_scene_model(allow_download: bool = False) -> Any:
    path = scene_model_path()
    if not allow_download and not path.is_file():
        raise FileNotFoundError(
            "Object model is not prepared. Run .venv/bin/python prepare_scene_model.py "
            "in apps/cv-service."
        )
    # Keep downloads and settings out of camera requests.
    os.environ.setdefault("YOLO_AUTOINSTALL", "false")
    os.environ.setdefault("YOLO_CONFIG_DIR", str(SERVICE_DIR / "models" / "settings"))
    Path(os.environ["YOLO_CONFIG_DIR"]).mkdir(parents=True, exist_ok=True)
    from ultralytics import YOLOE, settings
    import torch

    settings.update({"sync": False})
    path.parent.mkdir(parents=True, exist_ok=True)
    model = YOLOE(str(path))
    model.predict(np.zeros((480, 640, 3), dtype=np.uint8), imgsz=416, device="cpu", verbose=False)
    # Ultralytics selects its own thread count during the first prediction.
    torch.set_num_threads(max(1, min(int(os.environ.get("CV_SCENE_THREADS", "2")), 4)))
    return model


def _polygon(points: Any) -> list[dict[str, float]]:
    array = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    if len(array) < 3 or not np.isfinite(array).all():
        return []
    array = np.clip(array, 0.0, 1.0)
    epsilon = max(cv2.arcLength(array.reshape(-1, 1, 2), True) * 0.008, 0.002)
    simplified = cv2.approxPolyDP(array.reshape(-1, 1, 2), epsilon, True).reshape(-1, 2)
    if len(simplified) > 32:
        simplified = simplified[np.linspace(0, len(simplified) - 1, 32, dtype=int)]
    return [{"x": round(float(x), 5), "y": round(float(y), 5)} for x, y in simplified]


def object_detections(result: Any, minimum_confidence: float) -> list[dict[str, Any]]:
    detections: list[dict[str, Any]] = []
    if result.boxes is None:
        return detections
    boxes = result.boxes.xyxyn.cpu().numpy()
    confidences = result.boxes.conf.cpu().numpy()
    classes = result.boxes.cls.cpu().numpy()
    masks = result.masks.xyn if result.masks is not None else []
    for index, (box, confidence, class_id) in enumerate(zip(boxes, confidences, classes)):
        if not math.isfinite(float(confidence)) or confidence < minimum_confidence:
            continue
        x1, y1, x2, y2 = map(float, box)
        if not all(math.isfinite(value) for value in (x1, y1, x2, y2)):
            continue
        if x2 <= x1 or y2 <= y1:
            continue
        polygon = _polygon(masks[index]) if index < len(masks) else []
        if len(polygon) < 3:
            polygon = _polygon([[x1, y1], [x2, y1], [x2, y2], [x1, y2]])
        if len(polygon) < 3:
            continue
        label = str(result.names.get(int(class_id), "object"))[:100]
        detections.append({
            "kind": "object",
            "label": label,
            "confidence": round(min(float(confidence), 1.0), 4),
            "polygon": polygon,
        })
    return sorted(detections, key=lambda item: item["confidence"], reverse=True)[:MAX_DETECTIONS]


def read_scene_text(image: np.ndarray, minimum_confidence: float) -> list[dict[str, Any]]:
    import pytesseract

    os.environ.setdefault("OMP_THREAD_LIMIT", "1")
    data = pytesseract.image_to_data(
        cv2.cvtColor(image, cv2.COLOR_BGR2RGB),
        config="--psm 11",
        lang=os.environ.get("CV_SCENE_OCR_LANG", "eng"),
        output_type=pytesseract.Output.DICT,
        timeout=1.5,
    )
    height, width = image.shape[:2]
    lines: dict[tuple[int, int, int], list[tuple[str, float, int, int, int, int]]] = {}
    for index, raw_text in enumerate(data.get("text", [])):
        text = str(raw_text).strip()
        confidence = float(data["conf"][index]) / 100.0
        if not text or not math.isfinite(confidence) or confidence < minimum_confidence:
            continue
        key = tuple(int(data[field][index]) for field in ("block_num", "par_num", "line_num"))
        left, top, box_width, box_height = (
            int(data[field][index]) for field in ("left", "top", "width", "height")
        )
        if box_width <= 0 or box_height <= 0:
            continue
        lines.setdefault(key, []).append((text, confidence, left, top, box_width, box_height))
    detections: list[dict[str, Any]] = []
    for words in lines.values():
        x1 = min(word[2] for word in words) / width
        y1 = min(word[3] for word in words) / height
        x2 = max(word[2] + word[4] for word in words) / width
        y2 = max(word[3] + word[5] for word in words) / height
        detections.append({
            "kind": "text",
            "label": " ".join(word[0] for word in words)[:160],
            "confidence": round(sum(word[1] for word in words) / len(words), 4),
            "polygon": _polygon([[x1, y1], [x2, y1], [x2, y2], [x1, y2]]),
        })
    return sorted(detections, key=lambda item: item["confidence"], reverse=True)[:MAX_DETECTIONS]


class SceneAnalyzer:
    def __init__(
        self,
        model_loader: Callable[[], Any] = load_scene_model,
        text_reader: Callable[[np.ndarray, float], list[dict[str, Any]]] = read_scene_text,
    ) -> None:
        self._lock = Lock()
        self._model: Any = None
        self._model_loader = model_loader
        self._text_reader = text_reader
        self._retry_after = 0.0
        self._load_error: str | None = None

    def analyze(
        self,
        image: np.ndarray,
        minimum_confidence: float = 0.25,
        include_text: bool = True,
    ) -> dict[str, Any]:
        started_at = time.perf_counter()
        height, width = image.shape[:2]
        response: dict[str, Any] = {
            "status": "ready",
            "detector_status": "ready",
            "text_status": "disabled" if not include_text else "ready",
            "model_name": scene_model_path().name,
            "vocabulary_size": 0,
            "detections": [],
            "messages": [],
            "image_width": width,
            "image_height": height,
            "object_time_ms": 0.0,
            "text_time_ms": 0.0,
            "processing_time_ms": 0.0,
            "diagnostic_only": True,
        }
        if not self._lock.acquire(blocking=False):
            response.update(status="busy", detector_status="busy", text_status="busy")
            response["messages"] = ["Scene analyzer is busy. No frame was queued."]
            return response
        try:
            object_started_at = time.perf_counter()
            try:
                if self._model is None:
                    if time.monotonic() < self._retry_after:
                        raise RuntimeError(self._load_error)
                    try:
                        self._model = self._model_loader()
                    except Exception as error:
                        self._load_error = str(error)
                        self._retry_after = time.monotonic() + 10.0
                        raise
                response["vocabulary_size"] = len(self._model.names)
                result = self._model.predict(
                    image,
                    device="cpu",
                    imgsz=416,
                    conf=minimum_confidence,
                    max_det=MAX_DETECTIONS,
                    verbose=False,
                    save=False,
                    agnostic_nms=True,
                )[0]
                response["detections"] = object_detections(result, minimum_confidence)
            except Exception as error:
                LOGGER.warning("Scene object detection unavailable: %s", error)
                response["status"] = "partial"
                response["detector_status"] = "unavailable"
                response["messages"].append(str(error)[:240])
            response["object_time_ms"] = round((time.perf_counter() - object_started_at) * 1000, 1)
            if include_text:
                text_started_at = time.perf_counter()
                try:
                    response["detections"].extend(self._text_reader(image, minimum_confidence))
                except Exception as error:
                    response["status"] = "partial"
                    response["text_status"] = "unavailable"
                    response["messages"].append(f"Text recognition unavailable: {str(error)[:180]}")
                response["text_time_ms"] = round((time.perf_counter() - text_started_at) * 1000, 1)
            response["processing_time_ms"] = round((time.perf_counter() - started_at) * 1000, 1)
            return response
        finally:
            self._lock.release()


scene_analyzer = SceneAnalyzer()
