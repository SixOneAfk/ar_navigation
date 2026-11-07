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
- `apps/core-backend`: gRPC + HTTP backend services (positioning + route API)
- `apps/cv-service`: FastAPI OCR recalibration service (`/api/v1/recalibrate`)

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

The client loads the active building model from `apps/client/public/Floor 1__full_GRAPH_no_fence.glb`.

## Client Navigation

The client uses A* over the points and bidirectional cardinal branches in
`apps/client/public/building_navigation.json`. Branch distances determine route
costs; the Euclidean heuristic is scaled to remain admissible for those weights.
The player's nearest tracked graph point is the route start, including when the
player is between points. An Entrance, if configured, is used as the default
spawn but is not required for routing. Disconnected destinations report an error.
The standalone `backend/graph_router.py` route API uses the same weighted A*
and cardinal-branch rules.

Add a destination by mapping its name to an existing point ID in `namedLocations`.
The selector derives its labels and destinations from this mapping; underscores
in names are displayed as spaces.

## Main API Endpoints

- Gateway telemetry ingest: `POST /api/v1/position/telemetry`
- Gateway route request: `POST /api/v1/position/route`
- Gateway CV scan forwarding: `POST /api/v1/cv/scan`
- Core route API: `POST /api/v1/route`
- CV recalibration API: `POST /api/v1/recalibrate`

When camera access is enabled, the client sends a 640x480 JPEG frame through the Gateway about once per second. The FastAPI service performs OCR landmark matching and returns the matched graph node when known signage is detected.
