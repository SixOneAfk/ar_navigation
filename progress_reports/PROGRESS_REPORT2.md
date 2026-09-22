# NAV_AR Progress Report 2

Date: 2026-08-31  
Branch baseline: main

## Executive Summary

The project has a working microservice architecture on main: frontend PWA, gateway, core backend graph routing, and CV OCR recalibration service. Compared to the previous reports, movement and camera flow are now present on main, and frontend plus CV tests now exist. The biggest remaining gap is not implementation-only, but validation quality: field testing and end-to-end fusion evidence for TRL 4 are still missing.

## Verification Against Architecture Plan

Reference plan: plans/NAV_AR_ARCH_PLAN.md

### 1) 3D Graph Router
Planned:
- A* routing with floor-aware weighting
- Graph node interfaces and route response contract

Verified in code:
- Core routing service and tests are present and exercised.
- Multi-floor route test exists and passes logically by design assertions.
- Route API path is implemented in core backend and proxied by gateway.

Status:
- Implemented: Yes
- Tested: Yes (unit/service level)
- Field-tested in real building: No

### 2) OCR Recalibration Service
Planned:
- OpenCV preprocessing
- OCR + fuzzy matching
- Cached reader for performance

Verified in code:
- CV service implements decode, preprocessing, OCR candidates, and matching.
- Unit tests exist for decode, fuzzy score, matching behavior, and reader cache behavior.
- Gateway CV controller has tests for payload forwarding and error handling.

Status:
- Implemented: Yes
- Tested: Yes (unit/controller level)
- Field-tested with real signage dataset: Not sufficiently demonstrated

### 3) PWA PDR Engine
Planned:
- Device orientation handling
- Step detection using accelerometer peaks and thresholding
- Drift correction interface

Verified in code:
- Gyroscope hook exists with permission workflow and tests.
- Gyro camera component exists on main and has tests for orientation and movement reaction to step count.
- Acceleration hook includes filtering, threshold + debounce step counting, and velocity/position integration.
- Calibration controls for threshold/debounce/deadband/stride are exposed in app UI.

Status:
- Implemented: Mostly yes
- Tested: Partly yes (gyro and movement component behavior)
- Algorithmically validated on real mobile walk sessions: No

### 4) Integration Flow
Planned:
- PWA to gateway to core and CV
- JSON payload schema consistency

Verified in code:
- Gateway controllers exist for position, CV, and WiFi endpoints.
- CV path is tested for canonical payload forwarding.
- Core positioning receives telemetry via gRPC controller.

Status:
- Implemented: Yes
- Tested: Partly (controller and service tests)
- End-to-end mobile run with logged accuracy metrics: No

## What We Already Have

1. Working monorepo architecture with client, gateway, core backend, and CV service.
2. A* route computation with multi-floor path test coverage.
3. Frontend sensor pipeline with permission handling and motion visualization controls.
4. Gyro camera and camera panel integrated on main.
5. CV OCR recalibration API and gateway forwarding path.
6. Initial database/prisma scaffolding in core backend.
7. Start-all development script and updated quick-start documentation.
8. Cross-service payload contract reflected in app and gateway code paths.

## Implemented But Not Fully Tested or Validated

1. PDR accuracy under real walking conditions:
- Step thresholds are tunable, but no formal benchmark dataset or repeatable error envelope is documented.

2. End-to-end PDR + OCR fusion in motion:
- Components exist, but there is no evidence report of continuous walk with periodic OCR correction and final position error stats.

3. Telemetry persistence and replay workflows:
- Positioning gRPC ingest exists, but long-session analysis and replay tooling are not presented as validated outputs.

4. WiFi trilateration:
- Service method remains a placeholder and WiFi endpoint is not fused into final position pipeline.

5. Multi-floor real transition sensing:
- Graph supports floor edges, but device-side floor transition detection/validation remains unproven.

6. Production-grade mobile/browser matrix:
- Permission flows are implemented, but compatibility and stability are not yet backed by structured field test logs.

## Current Test Coverage Snapshot (Project-Owned Tests)

- Frontend:
  - apps/client/src/components/CameraPermissionPanel.test.tsx
  - apps/client/src/components/GyroCamera.test.tsx
  - apps/client/src/hooks/useGyroscope.test.tsx
  - apps/client/src/utils/cvFrame.test.ts

- Core backend:
  - apps/core-backend/src/app.controller.spec.ts
  - apps/core-backend/src/modules/graph/graph.service.spec.ts

- Gateway:
  - apps/gateway/src/app.controller.spec.ts
  - apps/gateway/src/modules/cv/cv.controller.spec.ts

- CV service:
  - apps/cv-service/test_main.py

## Corrections vs Older Reports

1. Movement and camera integration are now on main (older statements that they are branch-only are outdated).
2. Frontend tests do exist (older statements of no frontend tests are outdated).
3. CV service tests now exist (older statements of no CV tests are outdated).

## Recommended Next Steps (TRL 4 Focus)

1. Establish measurable acceptance criteria:
- Example: median position error <= 2m over 50m path with 2-3 OCR recalibrations.

2. Run controlled field scenarios and log outcomes:
- Baseline PDR-only walk.
- PDR + OCR recalibration walk.
- Multi-floor transition walk.

3. Persist telemetry and annotate events:
- Save timestamped IMU, heading, OCR detections, matched node, and ground-truth checkpoints.

4. Produce validation artifacts:
- Confusion matrix/accuracy for signage matching.
- Drift curves over time/distance.
- Before/after recalibration error reductions.

5. Decide WiFi scope:
- Either defer trilateration explicitly for grant milestone, or implement a minimal RSSI-distance prototype and document limitations.

## Overall Readiness Assessment

- Architecture completeness: High
- Component implementation completeness: Medium to high
- Test coverage maturity: Medium
- TRL 4 evidence readiness: Medium-low (blocked mostly by field validation evidence, not missing core architecture)
