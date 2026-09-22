# NAV_AR Implementation Plan
## Gyroscope Vertical Movement + CV-Based Position Verification Flow

Date: 2026-09-22
Branch baseline: main
Source context: progress_reports/PROGRESS_REPORT.md, progress_reports/PROGRESS_REPORT1.md, progress_reports/PROGRESS_REPORT2.md, progress_reports/PROGRESS_REPORT3.md

---

## 1. Objective of This Next Phase

This phase has two concrete goals:

1. Make movement controls realistic and complete for lab navigation testing.
- Keep heading control from gyroscope orientation.
- Add explicit up/down movement support for testing and controlled transitions.
- Remove unrealistic dependence on side-tilt for normal left/right translation where not needed.

2. Build an end-to-end functional flow where computer vision contributes to localization.
- Capture frame from client.
- Detect text/landmark in CV service.
- Map landmark to known graph node/location.
- Compare with current estimated position.
- Accept/reject correction and update confidence state.

This plan is implementation-ready but intentionally code-free.

---

## 2. Current State Summary (From Reports)

1. Architecture exists and services are integrated (client, gateway, core backend, CV service).
2. Camera/world scale and spawn consistency improved (metric world assumption).
3. Walk mode is present and step-based movement is in place.
4. Main interaction issue: gyro translation is still tied to tilt behavior and is not ergonomically realistic.
5. Vertical movement path is not active in runtime behavior.
6. CV OCR scan pipeline exists, but continuous correction flow with position validation policy is not complete.

---

## 3. Scope Definition

### In scope
1. Movement mode policy redesign and control semantics.
2. Up/down axis support for test/debug and controlled floor-transition experiments.
3. CV correction contract between client, gateway, and backend.
4. Position validation logic (distance gate, heading gate, confidence thresholds).
5. Telemetry and observability for correction decisions.
6. Validation scenarios and acceptance metrics.

### Out of scope for this phase
1. Full WiFi trilateration implementation.
2. Production authentication/authorization.
3. Advanced SLAM features.

---

## 4. Movement Control Redesign Plan

### 4.1 Movement mode semantics (target)

1. off
- No translation; optional orientation visualization only.

2. gyro
- Orientation-only mode.
- Uses alpha/beta/gamma only for camera heading/pitch behavior.
- No translational movement generated from tilt by default.

3. buttons
- Manual translation mode with explicit controls.
- Forward/backward, strafe left/right, and vertical up/down controls.
- Intended for operator testing and calibration.

4. walk
- Translation from step detections and stride calibration.
- Heading from orientation yaw.
- Optional lateral correction only from explicit input (not passive tilt).

### 4.2 Vertical movement policy

1. Introduce explicit vertical commands for debug/testing.
- Up/down movement uses fixed speed in m/s with frame delta.
- Clamp vertical range to configurable limits.

2. Keep product and debug behavior separate.
- Debug vertical movement can be enabled by a dedicated toggle.
- Product path for floor transitions should eventually be event-driven (stairs/elevator markers), not free-fly.

3. Add safety constraints.
- Prevent accidental vertical drift.
- Auto-reset vertical velocity to zero when control released.

### 4.3 Gyroscope ergonomics tuning

1. Deadzone and smoothing for orientation.
2. Reduced over-coupling between pitch/roll and translation.
3. Optional comfort modes:
- low sensitivity
- high sensitivity
- snap-to-forward heading baseline

### 4.4 Compass-assisted heading fusion

1. Keep compass and gyro as independent raw signals.
2. Gyroscope remains the control heading/orientation source for local camera behavior.
3. Compass remains a global north reference signal with quality/confidence telemetry.
4. Any future fusion must happen explicitly at estimator policy level, not by coupling raw controls.

### 4.5 Model tilt and horizon alignment (next milestone)

1. Use gyroscope tilt to align rendered horizon with scene/model attitude.
2. Apply smoothing and clamping to avoid high-frequency jitter.
3. Preserve static horizon calibration as user baseline offset.
4. Expose alignment confidence/debug values in frontend overlay.

### 4.6 Dynamic horizon correction from CV (future step)

1. Detect dominant floor-wall boundary candidate from camera frames.
2. Compare CV horizon angle against gyroscope horizon angle.
3. Use CV as bounded correction signal over time, not a hard override.
4. Reject updates when line confidence/consistency is low.

---

## 5. CV-to-Position Functional Flow Plan

## 5.1 Target data flow

1. Client captures frame + timestamp + current estimated position + heading.
2. Client sends payload to gateway CV endpoint.
3. Gateway forwards to CV service and receives OCR/landmark result.
4. Gateway sends normalized recalibration candidate to core positioning flow.
5. Core backend resolves landmark to node coordinates and computes correction candidate.
6. Validation engine compares candidate with current estimate.
7. If accepted, publish updated position and confidence.
8. If rejected, keep current estimate and log rejection reason.

## 5.2 Required payload contract extension

Existing payload should be extended with these optional fields:

1. pose_confidence
- Current client confidence score.

2. velocity_hint
- Optional speed estimate from PDR for plausibility checks.

3. device_pitch_roll
- For camera quality and perspective confidence weighting.

4. frame_id and sequence_number
- For deduplication and out-of-order protection.

5. ocr_candidates
- Returned by CV service with text, confidence, and bbox metadata.

## 5.3 Landmark resolution strategy

1. Primary mapping
- Exact match between OCR text and known signage IDs.

2. Fuzzy mapping
- Levenshtein-based candidate ranking with threshold.

3. Context-aware disambiguation
- Use floor, nearest graph region, and heading compatibility to pick best candidate among similar labels.

4. Failure handling
- If no candidate passes minimum confidence, return no-correction event.

---

## 6. Position Validation and Correction Policy

### 6.1 Acceptance gates

A correction candidate is accepted only if all critical gates pass:

1. OCR confidence gate
- Minimum OCR confidence threshold.

2. Spatial distance gate
- Candidate node must be within max correction radius from current estimate.

3. Heading compatibility gate
- Current heading should be plausible relative to corridor/node orientation when available.

4. Temporal stability gate
- Optional requirement for repeated observation over N frames before hard correction.

### 6.2 Correction modes

1. Hard snap
- Use when confidence is very high and spatial mismatch is moderate.

2. Soft blend
- Interpolate from current estimate to CV candidate over time window.

3. Reject
- Keep estimate unchanged, log reason (low confidence, too far, inconsistent heading, stale frame).

### 6.3 Confidence state update

1. Increase global confidence when accepted CV correction occurs.
2. Decay confidence over time without observations.
3. Expose confidence in API response for UI and telemetry.

---

## 7. Backend and Service Work Packages

### WP-A: Gateway normalization and orchestration
1. Normalize scan payload with frame metadata.
2. Preserve correlation IDs across service calls.
3. Emit structured response for accepted/rejected corrections.

### WP-B: CV output enrichment
1. Return top-k text candidates with confidence.
2. Include optional bbox geometry and preprocessing diagnostics.
3. Add failure reason enums for observability.

### WP-C: Core positioning validation engine
1. Add correction validator module.
2. Implement acceptance gates and correction modes.
3. Bind graph node lookup + distance computation.

### WP-D: Client state integration
1. Consume correction response and confidence value.
2. Reflect correction mode in UI/debug overlay.
3. Log movement + correction timeline for replay.

---

## 8. Testing and Validation Plan

### 8.1 Unit test targets
1. Movement mode semantics (gyro/buttons/walk) including vertical controls.
2. Correction gate logic (confidence, distance, heading).
3. Candidate ranking and disambiguation behavior.

### 8.2 Integration test targets
1. Client -> Gateway -> CV -> Core loop with mocked OCR outputs.
2. Accepted correction path and rejected correction path.
3. Out-of-order frame handling and deduplication.

### 8.3 Field validation scenarios

1. Scenario A: Straight corridor walk, no OCR
- Measure baseline PDR drift.

2. Scenario B: Corridor walk with periodic signage
- Measure drift reduction after accepted corrections.

3. Scenario C: Ambiguous signage candidates
- Validate rejection/disambiguation logic.

4. Scenario D: Floor transition checkpoint
- Confirm vertical/test mode behavior and floor-aware graph consistency.

### 8.4 Acceptance metrics

1. Median position error target after corrections (define corridor-specific threshold).
2. Correction acceptance precision (accepted corrections that are actually right).
3. False correction rate (wrong snaps).
4. Correction latency p95 from frame capture to decision.

---

## 9. Observability and Logging Requirements

1. Required event logs:
- frame_received
- cv_candidates_generated
- correction_candidate_generated
- correction_accepted / correction_rejected
- correction_applied

2. Required metadata per event:
- session_id
- timestamp
- frame_id
- estimated_position_before
- candidate_position
- decision_reason
- confidence_before/after

3. Debug dashboards (minimum):
- Drift over time
- Acceptance vs rejection count
- OCR confidence histogram
- Latency distribution

---

## 10. Risks and Mitigations

1. OCR ambiguity risk
- Mitigation: top-k candidates + spatial/heading gates + repeated-observation requirement.

2. Sensor jitter and heading noise
- Mitigation: smoothing, deadzone tuning, orientation calibration UX.

3. Over-aggressive snapping
- Mitigation: soft blend mode and strict distance gating.

4. Test reproducibility risk
- Mitigation: fixed walking routes, checkpoint markers, replay logs.

---

## 11. Execution Sequence (Recommended)

1. Finalize movement semantics and vertical control policy.
2. Keep compass and gyro signals independent for control/input layers.
3. Implement model tilt and horizon alignment from gyroscope values.
4. Define and lock CV correction payload contract.
5. Implement backend correction validator and decision engine.
6. Integrate correction consumption in client state.
7. Add CV-based dynamic horizon correction stage.
8. Add unit + integration tests around correction logic.
9. Run controlled field scenarios and collect metrics.
10. Publish validation report with evidence tables and logs.

---

## 12. Deliverables

1. Updated movement behavior spec (mode semantics + vertical controls).
2. CV correction contract spec with examples.
3. Correction validator design note and decision table.
4. Test matrix (unit, integration, field).
5. Evidence pack:
- sample logs
- latency stats
- correction acceptance stats
- drift reduction plots

---

## 13. Definition of Done for This Phase

1. Gyro movement behavior is realistic and reproducible on mobile.

---

## Execution Log

### 2026-09-22 - Batch 1 Completed (Movement semantics and vertical controls)

- [x] 4.1 Movement mode semantics: `gyro` mode is now orientation-only (no tilt-driven translation).
- [x] 4.2 Vertical movement policy (debug path): explicit up/down controls added under `buttons` mode.
- [x] 4.2 Safety constraints: vertical movement is clamped to a bounded height range.
- [x] 8.1 Unit tests (movement): added/updated tests for gyro no-translation and debug vertical movement.

Implementation notes:
- Files updated: `apps/client/src/components/GyroCamera.tsx`, `apps/client/src/App.tsx`, `apps/client/src/index.css`, `apps/client/src/components/GyroCamera.test.tsx`.
- Existing walk and joystick behavior was kept intact while changing gyro semantics.

### 2026-09-22 - Batch 2 Completed (CV correction contract and validator)

- [x] 5.2 Payload contract extension: frame/pose metadata added through client helper, gateway DTO, gRPC request types, and proto schema.
- [x] 6.1 Acceptance gates: implemented OCR confidence, heading sanity, and distance-gate checks in a dedicated correction validator.
- [x] 6.2 Correction modes: `hard_snap`, `soft_blend`, and `reject` decisions now returned as structured metadata.
- [x] 7.A Gateway normalization/orchestration: CV scan flow now forwards correlation metadata and emits `correctionDecision` in API response.
- [x] 7.C Core validation engine (initial): positioning service evaluates correction decisions before applying CV marker anchors.
- [x] 8.1 Unit tests (correction logic): added validator tests and updated gateway CV controller tests.

Validation notes:
- Core backend build: pass.
- Gateway build: pass.
- Client build: pass.
- Core validator tests: pass.
- Gateway CV controller tests: pass.

### 2026-09-22 - Audit Checkpoint (Done vs Pending)

Completed:
- [x] Movement redesign baseline (`gyro` orientation-only, explicit debug vertical controls, vertical clamping).
- [x] CV payload contract extension across client -> gateway -> proto -> core types.
- [x] Core correction validator with initial confidence/heading/distance gates.
- [x] Gateway structured `correctionDecision` output and frame metadata propagation.
- [x] Client camera panel now displays correction mode/decision/reason/distance.
- [x] Initial stale-frame rejection path in gateway CV controller (sequence guard).

Partially completed:
- [~] WP-B CV output enrichment: top OCR candidates + failure reason added in CV service, but full bbox diagnostics are not added yet.
- [~] 8.2 integration coverage: component-level tests are passing, but no full cross-service integration harness has been added.

Pending:
- [ ] 4.5 model tilt and horizon alignment in 3D scene from gyroscope values.
- [ ] 4.6 CV-based dynamic horizon correction stage (line detection + confidence gating).
- [ ] 5.3 context-aware landmark disambiguation (floor/heading/region-aware ranking beyond current fuzzy match).
- [ ] 6.3 confidence lifecycle policy (decay/recovery over time).
- [ ] 8.3 field validation scenarios A-D with measured error reports.
- [ ] 8.4 acceptance metrics reporting pack (precision/false-correction/latency p95).

Verification snapshot:
- Gateway build: pass.
- Gateway CV controller tests: pass.
- Core correction validator tests: pass.
- Client build: pass.
- CV Python unit tests: blocked in current environment (`cv2` module not installed in active runtime).

### 2026-09-22 - Batch 3 Completed (Compass + gyro heading fusion)

Completed:
- [x] 4.4 Compass-assisted heading fusion flow defined in plan.
- [x] Compass heading extraction implemented (`webkitCompassHeading` + absolute alpha fallback).
- [x] Stability-aware fused heading path added in sensor hook.
- [x] Gyro camera yaw now consumes fused heading with fallback to raw orientation alpha.

Implementation notes:
- Files updated: `apps/client/src/hooks/useGyroscope.ts`, `apps/client/src/components/GyroCamera.tsx`, `apps/client/src/App.tsx`.
- Compass is intentionally used as a drift-correction anchor for direction only; position remains PDR/CV-derived.

### 2026-09-22 - Batch 4 Completed (Frontend compass widget)

Completed:
- [x] Added live compass diagnostics widget in frontend overlay.
- [x] Widget renders fused heading, raw gyro heading, raw compass heading, and confidence.
- [x] Widget is wired to existing `headingRef` and updates in real time without changing navigation logic.

Implementation notes:
- Files updated: `apps/client/src/components/CompassWidget.tsx`, `apps/client/src/App.tsx`, `apps/client/src/index.css`.
- Client build validation: pass.

### 2026-09-22 - Batch 5 Completed (Horizon line + signed tilt scale)

Completed:
- [x] Added gyroscope-derived horizon line overlay in compass widget.
- [x] Added signed tilt readout where `0` is aligned, `+` is right tilt, `-` is left tilt.
- [x] Added confidence color states (`high`/`medium`/`low`) for compass trust visibility.

Implementation notes:
- Files updated: `apps/client/src/components/CompassWidget.tsx`, `apps/client/src/App.tsx`, `apps/client/src/index.css`.
- Horizon tilt uses `orientation.gamma` with clamped visual rotation for stable rendering.
- Client build validation: pass.

### 2026-09-22 - Batch 6 Completed (Static horizon calibration)

Completed:
- [x] Added static horizon calibration action (`Calibrate 0 deg`) to set current tilt as level.
- [x] Added reset action to clear horizon offset.
- [x] Applied horizon offset consistently to both tilt readout and horizon line rotation.

Implementation notes:
- Files updated: `apps/client/src/components/CompassWidget.tsx`, `apps/client/src/index.css`.
- Calibration is intentionally frontend-local/static for now (no CV coupling yet).
- Client build validation: pass.

Forward-looking note:
- Dynamic horizon alignment to floor-wall boundary is planned for a CV stage.
- OpenCV can detect straight lines reliably via edge detection + Hough transform, so using `cv2` for line candidates is feasible.

### 2026-09-22 - Batch 7 Completed (Gyro/compass signal independence)

Completed:
- [x] Removed compass influence from control heading logic.
- [x] Kept gyro heading as the control heading signal for camera/movement.
- [x] Kept compass as an independent signal with its own stability confidence.

Implementation notes:
- Files updated: `apps/client/src/hooks/useGyroscope.ts`, `apps/client/src/components/CompassWidget.tsx`.
- `fusedHeadingDeg` currently mirrors gyro heading intentionally to preserve API compatibility while fusion is disabled for control behavior.
- Client build validation: pass.

### 2026-09-22 - Scope Update (What is left next)

Prioritized next implementation target:
- [ ] Add model tilt from gyroscope values and align scene/model horizon to gyroscope horizon.

Axis responsibility model for upcoming localization iteration:
- Compass -> X/Z global orientation reference (north anchor).
- Gyroscope -> local orientation/tilt and Y-axis attitude behavior.
- Accelerometer + step detection -> translational progress.

Future fusion rule:
- Keep raw sensors independent and combine them intentionally in estimator logic.
2. Vertical movement path exists for debug/testing and is gated safely.
3. CV detection can produce a correction candidate tied to a graph location.
4. Position correction decisions are explainable and logged.
5. End-to-end flow demonstrates measurable drift reduction in at least one controlled route.
