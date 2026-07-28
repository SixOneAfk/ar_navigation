# AR Nav

AR Nav is a monorepo with a web client, a NestJS gateway, a NestJS core backend, and a Python CV service.

## Quick Start

If you just want to launch the app, follow [QUICK_START.md](QUICK_START.md).

### Default Ports

- Client UI: `http://localhost:5173`
- Gateway: `http://localhost:3000`
- Core backend: `http://localhost:3001`
- CV service: `http://localhost:8000`

## What Runs Where

- `apps/client`: Vite React frontend
- `apps/gateway`: HTTP API gateway
- `apps/core-backend`: gRPC and backend services
- `apps/cv-service`: FastAPI CV placeholder service

## Launch Commands

From the repo root:

```bash
npm run start:dev:all
```

If you also want the Python service:

```bash
cd apps/cv-service
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Model Asset

The client looks for a 3D corridor model at `apps/client/public/model.glb`.

## test branch