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

Select `Enable Gyro` before enabling the camera so pitch-aware wall tracking is available. Then open the Camera panel and select `Enable Camera`. The client captures centered 640x480 JPEG frames at up to five frames per second and sends them as base64 JSON to `POST /api/v1/cv/structural-lines`. Requests never overlap, so slower processing cannot create a frame queue.

Up to three connected floor-wall boundaries and wall outlines are drawn over the live video. The panel also shows boundary confidence, camera pitch and roll, candidate counts, CV processing time, and full round-trip time. Stable high-confidence roll estimates are used as a bounded correction for the Three.js camera orientation. When the camera points more than 30 degrees down, wall-pose estimation pauses while floor and roll tracking continue.

The first legacy OCR request can take longer while EasyOCR initializes and downloads model files to its local cache. Live structural-line tracking does not initialize or run EasyOCR.

## Optional experimental scene analysis

From the repo root, prepare the optional YOLOE runtime and official model weights:

```bash
cd apps/cv-service
.venv/bin/python prepare_scene_model.py --install
cd ../..
```

The command needs internet access once. It preserves the existing CPU torch and
headless OpenCV packages, installs the optional runtime, downloads about 16 MB of
model weights, and checks a prediction. Ultralytics and the model use AGPL-3.0.
Tesseract must be available on the server (`tesseract --version`); install it with
`sudo apt install tesseract-ocr tesseract-ocr-eng` on Ubuntu if necessary.
Then launch the app with the normal command above; no extra server is required.

In Camera, select `Enable Camera` and turn on `Experimental scene analysis`.
Use `Hide Model` for an unobstructed view. Objects are cyan and text is pink.
Adjust `Minimum confidence` to trade fewer false positives for fewer detections;
turn off `Read text` to reduce CPU work. The panel shows separate object/OCR
timings, full scene round-trip time, model readiness, vocabulary size, and a
collapsible list of detected items. Turning the switch off aborts the client
request, stops further scene frames, and clears its overlays without stopping
normal floor and wall tracking. A server inference already running can finish.

This is diagnostic only: no detected item changes your coordinates. Hold the
phone steady; these are sampled-frame detections, not continuous tracking.
Names and scores can be wrong, including doors, lights, and tile patterns.
Old contours disappear after three seconds from capture. A missing model or
Tesseract is reported in the panel; it does not disable structural-line tracking.

Optional CV-service environment variables:

- `CV_SCENE_THREADS=2`: Torch CPU thread limit (1 through 4).
- `CV_SCENE_OCR_LANG=eng`: installed Tesseract language(s), for example `eng+lav`.
  Additional language packs must be installed separately on the server.
- `CV_SCENE_MODEL_PATH=models/yoloe-26n-seg-pf.pt`: local prompt-free YOLOE checkpoint.
  Relative paths resolve against `apps/cv-service`. Only use trusted checkpoints.
  Set it before both preparation and server startup to use a different scale,
  such as `models/yoloe-26s-seg-pf.pt`; larger models trade speed for accuracy.

Run all CV tests with `.venv/bin/python -m unittest discover -p 'test_*.py'` from
`apps/cv-service`. Unit tests do not download or require the optional model.

## Optional notes

- The client loads the building model from `apps/client/public/Floor 1_Rotated_Points.glb`.
- If you only want to demo the web UI, `npm run start:dev:all` is usually enough.
- Route query API through gateway: `POST /api/v1/position/route` from the frontend, or `POST http://localhost:3000/api/v1/position/route` directly, with `{ "startNode": "N101", "targetNode": "N201" }`.
- Structural-line API through gateway: `POST /api/v1/cv/structural-lines` from the frontend, or `POST http://localhost:3000/api/v1/cv/structural-lines` directly.
- OCR recalibration API through gateway: `POST /api/v1/cv/scan` from the frontend, or `POST http://localhost:3000/api/v1/cv/scan` directly, with task payload contract fields (`session_id`, `timestamp`, `estimated_position`, `image_payload`).
