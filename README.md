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

## Model Assets

The active building model is `apps/client/public/Floor 1_Rotated_Points.glb`.
The matching wall catalog is `apps/client/public/wall_references.json`.

Regenerate the catalog after replacing the GLB:

```bash
cd apps/cv-service
.venv/bin/python extract_wall_references.py \
  ../client/public/Floor\ 1_Rotated_Points.glb \
  ../client/public/wall_references.json
```
## Main API Endpoints

- Gateway telemetry ingest: `POST /api/v1/position/telemetry`
- Gateway route request: `POST /api/v1/position/route`
- Gateway CV scan forwarding: `POST /api/v1/cv/scan`
- Gateway structural-line forwarding: `POST /api/v1/cv/structural-lines`
- Core route API: `POST /api/v1/route`
- CV recalibration API: `POST /api/v1/recalibrate`
- CV structural-line API: `POST /api/v1/structural-lines`

When camera access is enabled, the client sends centered 640x480 JPEG frames through the Gateway at up to five frames per second. The FastAPI service detects up to three connected floor-wall boundaries and estimates camera roll without running OCR. The client draws the detected boundaries over the live video and applies only stable, confidence-gated roll corrections to the Three.js camera.

Floor-boundary selection favors junctions where vertical wall edges end above a
repeated floor pattern. Overlapping parallel stripes without wall evidence are
rejected, including tile grids. Ambiguous textured views may produce no boundary.
The displayed confidence is a geometric score, not a calibrated probability that
the line is a wall-floor junction.

When gyroscope data is available, downward camera pitch shifts the floor search region upward. Above 30 degrees downward, complete wall-outline and pose estimation pauses while floor-boundary and roll detection continue.

For diagnostic position estimation, the client selects the most likely visible
wall from the catalog using the current navigation pose. FastAPI detects up to
three wall outlines from the visible floor edges and solves the planar camera pose
against the most reliable outline.
The UI shows the CV position and its deviation from the navigation/PDR position,
but does not apply that position as a correction.

The camera horizontal FOV defaults to 60 degrees and can be adjusted under
`Structural diagnostics`. A calibrated device-specific FOV is required for
reliable metric distance estimates.
