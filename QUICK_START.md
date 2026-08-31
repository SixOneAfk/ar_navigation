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
python -m pytest test_main.py -v
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

Open the Camera panel and select `Enable Camera`. The client captures a centered 640x480 JPEG about once per second and sends it as base64 JSON to `POST /api/v1/cv/scan`. The panel shows the latest matched navigation node and confidence. Requests never overlap, so a slower OCR inference does not create a frame queue.

If the computer or virtual machine has no camera device, select `Upload Image` or `Use Demo Image` in the same panel. Uploaded images are converted in the browser to the same 640x480 JPEG payload and pass through the full Gateway and CV-service flow.

The first EasyOCR request can take longer while the reader initializes and model files are downloaded to the local EasyOCR cache. Later requests reuse the cached reader.

## Optional notes

- The client expects a model at `apps/client/public/model.glb` if you want the 3D corridor model.
- If you only want to demo the web UI, `npm run start:dev:all` is usually enough.
- Route query API through gateway: `POST /api/v1/position/route` from the frontend, or `POST http://localhost:3000/api/v1/position/route` directly, with `{ "startNode": "N101", "targetNode": "N201" }`.
- OCR recalibration API through gateway: `POST /api/v1/cv/scan` from the frontend, or `POST http://localhost:3000/api/v1/cv/scan` directly, with task payload contract fields (`session_id`, `timestamp`, `estimated_position`, `image_payload`).
