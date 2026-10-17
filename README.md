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
The legacy `wall_references.json` belongs to the previous model and is no longer
loaded. Wall-based pose estimation is intentionally on hold. The old extractor
assumes one large mesh and cannot generate wall references for the current model;
it remains available for future work. Floor-line tracking is unaffected.

## Photo Route Experiment

Open `Photo Route` for an independent four-point reference-photo walk. Add real
images to `apps/cv-service/route_photos/point-01/` through `point-04/`, then reload
references in the panel. Multiple photos can describe each viewpoint. The matcher
uses cached multi-scale SIFT features and partial-overlap geometric verification, confirms consecutive frames,
and advances only to the next point. Scores are not probabilities and no navigation
coordinates are changed. See [PHOTO_ROUTE_GUIDE.md](PHOTO_ROUTE_GUIDE.md) for setup,
photo collection, thresholds, and testing.

Photo Route preserves the full camera image in portrait or landscape, without
cropping, at a maximum 640-pixel side and a 640x480-equivalent pixel budget.
Point 5 is temporarily disabled in `route.json`; its photos are preserved.
A finish dialog appears after stable confirmation of the last enabled point.

## Main API Endpoints

- Gateway telemetry ingest: `POST /api/v1/position/telemetry`
- Gateway route request: `POST /api/v1/position/route`
- Gateway CV scan forwarding: `POST /api/v1/cv/scan`
- Gateway structural-line forwarding: `POST /api/v1/cv/structural-lines`
- Core route API: `POST /api/v1/route`
- CV recalibration API: `POST /api/v1/recalibrate`
- CV structural-line API: `POST /api/v1/structural-lines`

Camera access alone does not start CV requests. `Floor and wall analysis` and
`Object analysis` are independent switches, both off by default, in Camera and
Photo Route. Enabling floor analysis sends centered 640x480 JPEG frames through
the Gateway at up to five frames per second. FastAPI detects connected floor-wall
boundaries and estimates camera roll without OCR. Only stable confidence-gated
roll corrections affect the Three.js camera. Photo Route temporarily pauses both
optional modes; pausing or finishing the route resumes only explicitly enabled modes.

Floor-boundary selection favors junctions where vertical wall edges end above a
repeated floor pattern. Overlapping parallel stripes without wall evidence are
rejected, including tile grids. Ambiguous textured views may produce no boundary.
The displayed confidence is a geometric score, not a calibrated probability that
the line is a wall-floor junction.

When gyroscope data is available, downward camera pitch shifts the floor search region upward. Above 30 degrees downward, complete wall-outline and pose estimation pauses while floor-boundary and roll detection continue.

The previous diagnostic position experiment is paused for the active model.
Its implementation selects the most likely visible
wall from the catalog using the current navigation pose. FastAPI detects up to
three wall outlines from the visible floor edges and solves the planar camera pose
against the most reliable outline.
The UI shows the CV position and its deviation from the navigation/PDR position,
but does not apply that position as a correction.

The camera horizontal FOV defaults to 60 degrees and can be adjusted under
`Structural diagnostics`. A calibrated device-specific FOV is required for
reliable metric distance estimates.

## Optional Object Analysis

The previous scene-exploration experiment is available through `Object analysis`.
It uses the existing optional YOLOE model for cyan contours and labels; `Read text`
adds Tesseract OCR in pink and is also off by default. Nothing is inferred or
downloaded while this mode is off. Disabling it aborts client requests and removes
overlays; an already running server inference may finish. It never changes
navigation coordinates. Model confidence is not verified correctness.

The endpoints are `POST /api/v1/cv/scene-analysis` through Gateway and
`POST /api/v1/scene-analysis` in Python. Missing optional dependencies or weights
are reported without disabling Photo Route or floor analysis. See
[QUICK_START.md](QUICK_START.md) for explicit preparation. The optional runtime
and model use AGPL-3.0; review its terms before production integration.
