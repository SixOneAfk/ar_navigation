from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Nav_Ar CV Service", version="0.1.0")


class ScanRequest(BaseModel):
    device_id: str
    frame_base64: str
    mime_type: str = "image/jpeg"
    timestamp: str


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "cv-service"}


@app.post("/scan")
def scan_frame(payload: ScanRequest) -> dict[str, str]:
    # Placeholder: OCR/CV pipeline will be integrated here.
    return {"status": "accepted", "message": "scan placeholder", "device_id": payload.device_id}
