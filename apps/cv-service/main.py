import base64
from functools import lru_cache
import math
import re
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None

try:
    import easyocr
except Exception:  # pragma: no cover
    easyocr = None

try:
    import pytesseract
except Exception:  # pragma: no cover
    pytesseract = None


app = FastAPI(title="Nav_Ar CV Service", version="1.0.0")


class EstimatedPosition(BaseModel):
    x: float
    y: float
    floor: int


class RecalibrateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str
    timestamp: int
    estimated_position: EstimatedPosition
    image_payload: str
    device_heading: Optional[float] = None


class ScanRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    device_id: str = Field(alias="deviceId")
    frame_base64: str = Field(alias="frameBase64")
    mime_type: str = Field(default="image/jpeg", alias="mimeType")
    timestamp: str


class RecalibrateResponse(BaseModel):
    recalibrated: bool
    detected_text: Optional[str]
    confidence: float
    matched_node_id: Optional[str]
    marker_position: Optional[dict[str, float | int]]
    candidate_count: int
    ocr_candidates: list[dict[str, float | str]]
    failure_reason: Optional[str] = None
    cv_horizon_roll_deg: Optional[float] = None
    cv_horizon_confidence: float = 0.0


@lru_cache(maxsize=1)
def _get_easyocr_reader() -> Any | None:
    if easyocr is None:
        return None

    return easyocr.Reader(["en"], gpu=False)


def _decode_image(payload: str) -> np.ndarray:
    if cv2 is None:
        raise HTTPException(status_code=500, detail="opencv is not installed")

    encoded = payload.split(",", 1)[1] if "," in payload else payload
    try:
        binary = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image payload: {exc}") from exc

    image_np = np.frombuffer(binary, dtype=np.uint8)
    image = cv2.imdecode(image_np, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Unable to decode image data")

    return image


def _preprocess_for_ocr(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    thresholded = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        5,
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    cleaned = cv2.morphologyEx(thresholded, cv2.MORPH_CLOSE, kernel, iterations=1)
    return cleaned


def _ocr_candidates(processed: np.ndarray) -> list[tuple[str, float]]:
    candidates: list[tuple[str, float]] = []

    reader = _get_easyocr_reader()
    if reader is not None:
        for _bbox, text, conf in reader.readtext(processed):
            candidates.append((text, float(conf)))
        if candidates:
            return candidates

    if pytesseract is not None:
        data = pytesseract.image_to_data(processed, output_type=pytesseract.Output.DICT)
        texts = data.get("text", [])
        confs = data.get("conf", [])
        for idx, text in enumerate(texts):
            normalized = str(text).strip()
            if not normalized:
                continue
            conf_raw = str(confs[idx]) if idx < len(confs) else "-1"
            try:
                conf_value = max(float(conf_raw), 0.0) / 100.0
            except ValueError:
                conf_value = 0.0
            candidates.append((normalized, conf_value))

    return candidates


def _normalize_text(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def _match_node(candidates: list[tuple[str, float]]) -> tuple[Optional[str], Optional[str], float]:
    best_text: Optional[str] = None
    best_confidence = 0.0

    for raw_text, ocr_conf in candidates:
        normalized = _normalize_text(raw_text)
        if normalized and ocr_conf > best_confidence:
            best_text = normalized
            best_confidence = ocr_conf

    return None, best_text, best_confidence


def _build_ranked_candidates(candidates: list[tuple[str, float]]) -> list[dict[str, float | str]]:
    ranked: list[dict[str, float | str]] = []
    for raw_text, confidence in candidates:
        normalized = _normalize_text(raw_text)
        if not normalized:
            continue
        ranked.append(
            {
                "text": normalized,
                "confidence": round(float(confidence), 3),
            }
        )

    ranked.sort(key=lambda item: float(item["confidence"]), reverse=True)
    return ranked[:5]


def _normalize_line_angle_deg(value: float) -> float:
    normalized = value
    while normalized <= -90:
        normalized += 180
    while normalized > 90:
        normalized -= 180
    return normalized


def _estimate_horizon_roll_deg(image: np.ndarray) -> tuple[Optional[float], float]:
    if cv2 is None:
        return None, 0.0

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 60, 150)

    height, width = gray.shape
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=70,
        minLineLength=max(int(width * 0.22), 60),
        maxLineGap=20,
    )

    if lines is None:
        return None, 0.0

    best_angle: Optional[float] = None
    best_score = 0.0
    best_length = 0.0

    for line in lines:
        x1, y1, x2, y2 = line[0]
        dx = float(x2 - x1)
        dy = float(y2 - y1)
        length = math.hypot(dx, dy)
        if length < 1:
            continue

        angle = _normalize_line_angle_deg(math.degrees(math.atan2(dy, dx)))
        if abs(angle) > 35:
            continue

        horizontal_weight = 1.0 - min(abs(angle) / 35.0, 1.0)
        score = length * horizontal_weight
        if score > best_score:
            best_score = score
            best_angle = angle
            best_length = length

    if best_angle is None:
        return None, 0.0

    length_score = min(best_length / max(width * 0.8, 1.0), 1.0)
    angle_score = 1.0 - min(abs(best_angle) / 30.0, 1.0)
    confidence = max(0.0, min(1.0, (0.65 * length_score) + (0.35 * angle_score)))
    return round(float(best_angle), 3), round(float(confidence), 3)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "cv-service"}


@app.post("/api/v1/recalibrate", response_model=RecalibrateResponse)
def recalibrate_position(payload: RecalibrateRequest) -> RecalibrateResponse:
    image = _decode_image(payload.image_payload)
    cv_horizon_roll_deg, cv_horizon_confidence = _estimate_horizon_roll_deg(image)
    processed = _preprocess_for_ocr(image)
    candidates = _ocr_candidates(processed)
    matched_node_id, detected_text, confidence = _match_node(candidates)
    ranked_candidates = _build_ranked_candidates(candidates)

    marker_position = None
    failure_reason: Optional[str] = None
    if matched_node_id is None:
        failure_reason = "no_text_candidates" if len(ranked_candidates) == 0 else "no_navigation_point_mapping"

    return RecalibrateResponse(
        recalibrated=matched_node_id is not None,
        detected_text=detected_text,
        confidence=round(float(confidence), 3),
        matched_node_id=matched_node_id,
        marker_position=marker_position,
        candidate_count=len(candidates),
        ocr_candidates=ranked_candidates,
        failure_reason=failure_reason,
        cv_horizon_roll_deg=cv_horizon_roll_deg,
        cv_horizon_confidence=cv_horizon_confidence,
    )


@app.post("/scan")
def scan_frame(payload: ScanRequest) -> dict[str, object]:
    synthetic = RecalibrateRequest(
        session_id=payload.device_id,
        timestamp=0,
        estimated_position=EstimatedPosition(x=0.0, y=0.0, floor=1),
        image_payload=payload.frame_base64,
    )
    result = recalibrate_position(synthetic)
    return {
        "status": "accepted",
        "device_id": payload.device_id,
        "result": result.model_dump(),
    }
