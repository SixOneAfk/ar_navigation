import base64
from functools import lru_cache
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


KNOWN_SIGNAGE = {
    "101": "N101",
    "ROOM101": "N101",
    "102": "N103",
    "ROOM102": "N103",
    "STAIRSF2": "N104",
    "201": "N201",
    "ROOM201": "N201",
}


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
    candidate_count: int


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


def _score_match(candidate: str, known: str) -> float:
    if not candidate or not known:
        return 0.0
    if candidate == known:
        return 1.0

    previous_row = list(range(len(known) + 1))
    for candidate_index, candidate_char in enumerate(candidate, start=1):
        current_row = [candidate_index]
        for known_index, known_char in enumerate(known, start=1):
            insertion = current_row[known_index - 1] + 1
            deletion = previous_row[known_index] + 1
            substitution = previous_row[known_index - 1] + (candidate_char != known_char)
            current_row.append(min(insertion, deletion, substitution))
        previous_row = current_row

    distance = previous_row[-1]
    return 1.0 - distance / max(len(candidate), len(known))


def _match_node(candidates: list[tuple[str, float]]) -> tuple[Optional[str], Optional[str], float]:
    best_node: Optional[str] = None
    best_text: Optional[str] = None
    best_score = 0.0

    for raw_text, ocr_conf in candidates:
        normalized = _normalize_text(raw_text)
        if not normalized:
            continue

        if normalized in KNOWN_SIGNAGE:
            confidence = max(ocr_conf, 0.4)
            return KNOWN_SIGNAGE[normalized], normalized, confidence

        for known, node_id in KNOWN_SIGNAGE.items():
            score = _score_match(normalized, known) * ocr_conf
            if score > best_score:
                best_score = score
                best_node = node_id
                best_text = normalized

    if best_score >= 0.4:
        return best_node, best_text, best_score

    return None, None, 0.0


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "cv-service"}


@app.post("/api/v1/recalibrate", response_model=RecalibrateResponse)
def recalibrate_position(payload: RecalibrateRequest) -> RecalibrateResponse:
    image = _decode_image(payload.image_payload)
    processed = _preprocess_for_ocr(image)
    candidates = _ocr_candidates(processed)
    matched_node_id, detected_text, confidence = _match_node(candidates)

    return RecalibrateResponse(
        recalibrated=matched_node_id is not None,
        detected_text=detected_text,
        confidence=round(float(confidence), 3),
        matched_node_id=matched_node_id,
        candidate_count=len(candidates),
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
