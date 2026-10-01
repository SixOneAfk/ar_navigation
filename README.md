# AR Nav

AR Nav is a monorepo with a web client, a NestJS gateway, a NestJS core backend, and a Python CV service.

## Quick Start

If you just want to launch the app, follow [QUICK_START.md](QUICK_START.md).

### Default Ports

- Client UI: `https://localhost:5173`
- Gateway: `http://localhost:3000`
- Core backend: `http://localhost:3001`
- CV service: `http://localhost:8000`

## What Runs Where

- `apps/client`: Vite React frontend
- `apps/gateway`: HTTP API gateway
- `apps/core-backend`: gRPC + HTTP backend services (positioning + route API)
- `apps/cv-service`: FastAPI structural-line tracking and OCR recalibration service

## Launch Commands

From the repo root:

```bash
npm run start:dev:all:with-cv
```

To run the client and NestJS services without the Python CV service:

```bash
npm run start:dev:all
```

## Model Asset

The client looks for a 3D corridor model at `apps/client/public/model.glb`.

## Main API Endpoints

- Gateway telemetry ingest: `POST /api/v1/position/telemetry`
- Gateway route request: `POST /api/v1/position/route`
- Gateway CV scan forwarding: `POST /api/v1/cv/scan`
- Gateway structural-line forwarding: `POST /api/v1/cv/structural-lines`
- Core route API: `POST /api/v1/route`
- CV recalibration API: `POST /api/v1/recalibrate`
- CV structural-line API: `POST /api/v1/structural-lines`

When camera access is enabled, the client sends centered 640x480 JPEG frames through the Gateway at up to five frames per second. The FastAPI service detects the floor-wall boundary and estimates camera roll without running OCR. The client draws the detected boundary over the live video and applies only stable, confidence-gated roll corrections to the Three.js camera.

Uploaded and built-in demo images still use the OCR recalibration endpoint for landmark matching.
