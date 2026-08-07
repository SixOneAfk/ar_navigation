# AR Nav Quick Start

Use this if you want to hand the app to a friend and get it running fast.

## Prerequisites

- Node.js and npm
- Python 3.10+ for the CV service

## Install dependencies

From the repo root, install each app separately:

```bash
npm install --prefix apps/client
npm install --prefix apps/core-backend
npm install --prefix apps/gateway
```

For the Python service:

```bash
cd apps/cv-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Launch the app

The fastest way to start the web app and Nest services is from the repo root:

```bash
npm run start:dev:all
```

That starts:

- Client UI on `https://localhost:5173`
- Gateway on `http://localhost:3000`
- Core backend on `http://localhost:3001`

To run the Python CV service in another terminal:

```bash
cd apps/cv-service
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Optional environment variables:

- `CV_SERVICE_URL` for gateway -> CV forwarding (default `http://localhost:8000`)
- `CORE_BACKEND_URL` for gateway -> route API forwarding (default `http://localhost:3001`)

## Open the app

Open the client in your browser:

- `https://localhost:5173`

For phone testing through a single public entry point:

```bash
ngrok http https://localhost:5173
```

Use the ngrok HTTPS URL on the phone. In dev mode, the frontend now proxies same-origin `/api/*` requests to the gateway on `http://localhost:3000`, so the phone only needs one public URL.

## Optional notes

- The client expects a model at `apps/client/public/model.glb` if you want the 3D corridor model.
- If you only want to demo the web UI, `npm run start:dev:all` is usually enough.
- Route query API through gateway: `POST /api/v1/position/route` from the frontend, or `POST http://localhost:3000/api/v1/position/route` directly, with `{ "startNode": "N101", "targetNode": "N201" }`.
- OCR recalibration API through gateway: `POST /api/v1/cv/scan` from the frontend, or `POST http://localhost:3000/api/v1/cv/scan` directly, with task payload contract fields (`session_id`, `timestamp`, `estimated_position`, `image_payload`).