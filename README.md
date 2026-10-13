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
- Gateway experimental scene analysis: `POST /api/v1/cv/scene-analysis`
- CV experimental scene analysis: `POST /api/v1/scene-analysis`

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

## Experimental Scene Exploration

The Camera panel has an opt-in `Experimental scene analysis` switch. The normal
structural-line pipeline remains separate and never runs the object detector.
Scene exploration combines a cached YOLOE-26n prompt-free segmentation model
(4,585 category names) with Tesseract sparse-text OCR. It does not apply navigation
corrections or establish correspondence with the building model.

Object contours are cyan, OCR bounds are pink, and labels include the predicted
name and confidence score. A mask contour is used when available, otherwise a
bounding box is shown. These are model scores, not calibrated correctness
probabilities; objects, surfaces, tile patterns, and small lights may be missed
or mislabeled even at high confidence. No heuristic rectangle is called a door
without a model prediction. Floor and wall line tracking keeps its own colors.

The experiment sends a fresh centered 640x480 JPEG over the existing Gateway,
waits for completion, then waits another second before capturing again. Requests
never overlap per client; the Python analyzer also rejects concurrent work as
`busy` instead of queuing frames. CPU inference uses a 416-pixel model input and
defaults to two Torch threads. OCR has a 1.5-second limit and can be disabled.
Contours expire three seconds after capture, not after receiving the result.
There is no object tracking between frames: hold the phone steady for evaluation.

Prepare the optional runtime and weights once; see [QUICK_START.md](QUICK_START.md).
Weights and settings stay in the ignored `apps/cv-service/models/` directory.
No camera frames are saved or sent to an external recognition API. Model downloads
only happen in the explicit preparation command, never in an HTTP request.
The optional Ultralytics runtime and weights use AGPL-3.0; review its terms before
distribution or production integration. Sources: [YOLOE documentation](https://docs.ultralytics.com/models/yoloe/),
[ICCV 2025 paper](https://openaccess.thecvf.com/content/ICCV2025/papers/Wang_YOLOE_Real-Time_Seeing_Anything_ICCV_2025_paper.pdf).
