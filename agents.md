# NAV_AR — AI Agent Framework & Architecture Context

## Project Constraints & Goals
- **Grant:** TSI Innovation Grant (€1,200 budget total).
- **Goal:** TRL 4 laboratory validation in 6 months.
- **Budget Allocations:** Cloud Hosting (€360), OCR/Dev Tools (€300), Signage (€140), Calibration (€220), Documentation (€180).
- **Team Responsibilities:**
  - Dmitrii Vasilev: Technical PM & Coordination
  - Nikita Lebedevs: Backend API, Spatial Graph & OCR
  - Edgars Sažins: PWA Sensors, PDR & Testing

---

## Agent Role Definitions

### Agent 1: Frontend & PWA Sensor Engineer
- **Stack:** JS/TS, Web APIs (`DeviceMotionEvent`, `DeviceOrientationEvent`), HTML5 Canvas/WebGL, IndexedDB, Service Workers.
- **Rules:** Software-first, no beacons/hardware dependencies. Web-native APIs only (no React Native/Cordova). Must handle PDR low-pass filter, peak detection, and canvas rendering.

### Agent 2: Backend & Spatial Graph Architect
- **Stack:** Python/Node.js, NetworkX/PostGIS, REST/gRPC.
- **Rules:** Maintain 3D spatial graph (Nodes: rooms, doors, stairs; Edges: walkable paths). Shortest path (A* / Dijkstra) with floor transition weighting. Response latency < 200ms. Keep hosting within €360 limit.

### Agent 3: Computer Vision & OCR Specialist
- **Stack:** Python, OpenCV, EasyOCR / Tesseract, FastAPI/Flask.
- **Rules:** Process PWA camera frames. OpenCV pipeline (grayscale, blur, adaptive thresholding, perspective transform). OCR extraction + Levenshtein distance fuzzy matching with graph nodes. Target inference time < 1.5s.

### Agent 4: Technical PM & Grant Documentation Specialist
- **Stack:** WBS Tracking, Risk Register, TRL 4 testing logs.
- **Rules:** Maintain TRL 4 compliance logs, budget tracking, and update docstrings / Markdown docs upon code changes.

---

## Client-to-Microservice Payload Contract (JSON Schema)
```json
{
  "$schema": "[http://json-schema.org/draft-07/schema#](http://json-schema.org/draft-07/schema#)",
  "type": "object",
  "properties": {
    "session_id": { "type": "string" },
    "timestamp": { "type": "integer" },
    "estimated_position": {
      "type": "object",
      "properties": {
        "x": { "type": "number" },
        "y": { "type": "number" },
        "floor": { "type": "integer" }
      },
      "required": ["x", "y", "floor"]
    },
    "image_payload": { "type": "string", "contentEncoding": "base64" },
    "device_heading": { "type": "number" }
  },
  "required": ["session_id", "timestamp", "estimated_position", "image_payload"]
}