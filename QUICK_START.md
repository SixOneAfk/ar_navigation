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

- Client UI on `http://localhost:5173`
- Gateway on `http://localhost:3000`
- Core backend on `http://localhost:3001`

To run the Python CV service in another terminal:

```bash
cd apps/cv-service
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Open the app

Open the client in your browser:

- `http://localhost:5173`

## Optional notes

- The client expects a model at `apps/client/public/model.glb` if you want the 3D corridor model.
- If you only want to demo the web UI, `npm run start:dev:all` is usually enough.