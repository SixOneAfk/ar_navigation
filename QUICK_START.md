# AR Nav Quick Start

Use this if you want to hand the app to a friend and get it running fast.

## Prerequisites

- Node.js and npm
- Python 3.10+ for the CV service

## Install dependencies

From the repo root, install Node dependencies:

```bash
npm install --prefix apps/client
npm install --prefix apps/core-backend
npm install --prefix apps/gateway
```

Set up the Python CV service (one-time setup):

```bash
npm run setup:cv-service
```

## Launch the app

### Option 1: Full stack with CV service (recommended)

Start all services including the CV pipeline in one command:

```bash
npm run start:dev:all:with-cv
```

This starts:

- Client UI on `https://localhost:5173`
- Gateway on `http://localhost:3000`
- Core backend on `http://localhost:3001`
- CV service on `http://localhost:8000` (Swagger UI at `/docs`)

### Option 2: Nest services only (without CV)

```bash
npm run start:dev:all
```

Starts Client, Gateway, and Core Backend. Useful if you don't need OCR/CV features.

### Option 3: CV service alone

```bash
npm run start:cv
```

Starts only the Python FastAPI CV service on port 8000.

### Test CV service

From the repo root, run the test suite:

```bash
cd apps/cv-service
source .venv/bin/activate
python -m pytest test_main.py test_structural_lines.py -v
cd ../..
```

Optional environment variables:

- `CV_SERVICE_URL` for gateway -> CV forwarding (default `http://localhost:8000`)
- `CORE_BACKEND_URL` for gateway -> route API forwarding (default `http://localhost:3001`)
- `POSITIONING_PROTO_PATH` to override the automatically resolved `proto/positioning.proto` path

## Open the app

Open the client in your browser:

- `https://localhost:5173`

For phone testing through a single public entry point:

```bash
ngrok http https://localhost:5173
```

Use the ngrok HTTPS URL on the phone. In dev mode, the frontend now proxies same-origin `/api/*` requests to the gateway on `http://localhost:3000`, so the phone only needs one public URL.

Select `Enable Gyro` for pitch-aware wall tracking. In Camera, select `Enable
Camera`, then turn on `Floor and wall analysis` if needed. Floor/wall and object
analysis are off by default; simply enabling the camera sends no CV frames.
Enabled floor analysis sends centered 640x480 JPEG frames at up to five frames per
second as base64 JSON to `POST /api/v1/cv/structural-lines`. Requests never overlap.
Photo Route pauses both optional CV modes while running. Pausing or completing
the route resumes only the modes you previously enabled.

Up to three connected floor-wall boundaries and wall outlines are drawn over the live video. The panel also shows boundary confidence, camera pitch and roll, candidate counts, CV processing time, and full round-trip time. Stable high-confidence roll estimates are used as a bounded correction for the Three.js camera orientation. When the camera points more than 30 degrees down, wall-pose estimation pauses while floor and roll tracking continue.

The first OCR request can take longer while EasyOCR initializes and downloads model files to its local cache. Live structural-line tracking does not initialize or run EasyOCR.

## Optional object analysis

The earlier scene-analysis experiment is also available, disabled by default.
If its runtime and model were already prepared on this machine, no installation
is necessary. Otherwise run this explicit preparation command from the repo root:

```bash
cd apps/cv-service
.venv/bin/python prepare_scene_model.py --install
cd ../..
```

Preparation needs network access and installs the optional Ultralytics runtime
and YOLOE model. It preserves the base CPU torch and headless OpenCV dependencies.
The optional runtime/model use AGPL-3.0. Camera requests never download weights.

Enable `Object analysis` in Camera or Photo Route; it runs only with an active
camera and while Photo Route is paused. Cyan contours show predicted objects.
`Read text` in Camera optionally adds Tesseract OCR in pink; it is off by default.
The confidence slider and separate object/OCR timings are in Camera. Disable the
object switch to stop further requests and clear overlays. An inference already
running on the server may finish. Detections are diagnostic, not navigation fixes.

## Optional notes

- New photo-route experiment: open `Photo Route` and follow [PHOTO_ROUTE_GUIDE.md](PHOTO_ROUTE_GUIDE.md).
  Points 1 through 4 need real photos; point 5 is disabled without deleting its files.
  Photo Route preserves the full portrait/landscape camera image. A finish dialog
  appears after the last enabled point is confirmed. The old wall-pose
  catalog is disabled for the new model; floor tracking remains available.

- The client loads the building model from `apps/client/public/Floor 1_Rotated_Points.glb`.
- If you only want to demo the web UI, `npm run start:dev:all` is usually enough.
- Route query API through gateway: `POST /api/v1/position/route` from the frontend, or `POST http://localhost:3000/api/v1/position/route` directly, with `{ "startNode": "N101", "targetNode": "N201" }`.
- Structural-line API through gateway: `POST /api/v1/cv/structural-lines` from the frontend, or `POST http://localhost:3000/api/v1/cv/structural-lines` directly.
- OCR recalibration API through gateway: `POST /api/v1/cv/scan` from the frontend, or `POST http://localhost:3000/api/v1/cv/scan` directly, with task payload contract fields (`session_id`, `timestamp`, `estimated_position`, `image_payload`).
