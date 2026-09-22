# NAV_AR Progress Report 3
**Date:** 2026-09-22
**Scope:** Continuation of `PROGRESS_REPORT.md`, `PROGRESS_REPORT1.md`, and `PROGRESS_REPORT2.md` with current repository state review

---

## Executive Update
This report continues the previous two progress reports and reflects the latest verified implementation state.

### Addendum (Latest State)
- Gyro mode is now orientation-only for movement control (tilt does not produce translation).
- Buttons mode now includes explicit debug up/down movement controls.
- Compass and gyroscope are implemented as **independent signals**:
  - Gyroscope drives control heading.
  - Compass provides a separate north reference + stability confidence.
- Compass diagnostics widget is now available in frontend overlay.
- Horizon line widget is now available with signed tilt scale:
  - `0 deg` means level.
  - `+` means right tilt.
  - `-` means left tilt.
- Static horizon calibration (`Calibrate 0 deg` / `Reset`) is implemented.

### What is now confirmed as solved
- Model scale is now preserved at real-world scale convention: **1 Three.js unit = 1 meter**.
- Initial camera spawn/model alignment issue (spawn appearing above the model) has been addressed by removing automatic fit-scaling and centering the GLB consistently.
- Walking displacement is now expressed in physical units (meters), not arbitrary frame-based constants.

### What remains blocked
- Model tilt is not yet synchronized from gyroscope horizon to the 3D model/camera rig.
- Dynamic horizon detection from floor-wall boundary is not implemented yet (planned CV stage).
- End-to-end field validation artifacts (error curves, acceptance metrics, repeatable route results) are still pending.

---

## 1. Logical Continuation from Previous Reports

### From Report 0 and Report 1 to current state
Previous reports identified these critical gaps:
- Movement pipeline incomplete or branch-diverged.
- Model/world scale inconsistency causing navigation drift/spawn mismatch.
- Missing end-to-end validation evidence.

Current code review confirms this progression:
1. Movement pipeline exists in active client app under `apps/client` (gyro + walk + joystick modes).
2. GLB handling was changed from normalization/fit-scale to dimension-preserving load and center-only placement.
3. Step-driven forward motion is implemented and tied to step count + stride.
4. Main unresolved issue is interaction realism for gyro movement modes and incomplete axis support.

---

## 2. What Exactly Changed (Code-Level)

### 2.1 Model scale and spawn alignment
**File:** `apps/client/src/components/ModelScene.tsx`
- Removed normalization-based fit scaling behavior.
- Current behavior computes bounding box for diagnostics and model centering only.
- Scale is no longer overridden, preserving exported GLB dimensions.

**Impact:**
- Camera movement and world anchors now operate in a stable metric space.
- Eliminates previous mismatch where camera pose and transformed model coordinates diverged.

### 2.2 Camera movement in physical units
**File:** `apps/client/src/components/GyroCamera.tsx`
- Introduced/kept constants for meter-based movement (`DEFAULT_MOVEMENT_SPEED_MPS`, stride-based walk speed).
- Frame displacement now uses `speed * delta`.
- Walk mode computes velocity from cadence + stride and drains distance remaining per frame.
- Camera height clamp remains active (`CAMERA_HEIGHT_METERS = 1.2`).

**Impact:**
- Movement speed is predictable and calibratable.
- Step-triggered walk movement is deterministic and less frame-rate dependent.

### 2.3 Sensor capture and calibration maturity
**File:** `apps/client/src/hooks/useGyroscope.ts`
- Orientation and motion permission flow are integrated.
- Both orientation (`alpha/beta/gamma`) and calibrated acceleration are tracked.
- Motion calibration sampling and offset subtraction are implemented.
- Listener lifecycle cleanup is implemented.

**Impact:**
- Improved stability for sensor-driven movement and diagnostics.
- Better control over drift/noise through calibration.

### 2.4 App-level movement wiring
**File:** `apps/client/src/App.tsx`
- Movement mode control exists: `off | gyro | buttons | walk`.
- Accelerometer threshold/debounce/deadband/stride tuning UI is present.
- Gyro and acceleration permissions are requested together from one user gesture.
- Walk mode is the current default (`moveMode = 'walk'`).

---

## 3. What Was Tested (Verified During This Review)

### 3.1 Successful verification
- **Client production build:** passed.
  - Command: `npm --prefix apps/client run build`
  - Result: TypeScript + Vite bundle completed successfully.

### 3.2 Attempted but blocked verification
- **Vitest execution from current workspace setup:** failed due config/module resolution mismatch.
  - `vitest.config.ts` at workspace root imports `vitest/config`.
  - Root package does not provide that dependency context, causing unresolved import during startup.

### 3.3 Existing automated tests found in repository
- `apps/client/src/components/GyroCamera.test.tsx`
  - Checks step-driven forward movement in walk mode.
  - Checks joystick-forward mapping.
- `apps/client/src/hooks/useGyroscope.test.tsx`
  - Checks granted/denied/unsupported permission states.
  - Checks orientation and motion value handling.
- `apps/client/src/components/VirtualJoystick.test.tsx`
  - Checks normalized joystick vector and release reset.
- `apps/client/src/utils/cvFrame.test.ts`
  - Checks frame crop/resize payload behavior and gateway request contract.

Note: These tests exist and are relevant, but were not re-executed successfully in this review session due the config issue above.

---

## 4. Gyroscope and Movement Review Findings

### 4.1 Realism issue: left/right movement coupled to tilt
**Observed in code:** `GyroCamera.tsx` gyro mode derives strafe/forward input from `gamma` and `beta` tilt.

**Practical consequence:**
- User must physically tilt phone to move left/right.
- This interaction is unnatural for corridor navigation and uncomfortable over longer sessions.

### 4.2 Up/down movement not enabled
**Observed in code:** vertical movement accumulator exists (`verticalAmount`) but remains `0` in runtime branches.

**Practical consequence:**
- No manual vertical camera movement for debugging or alternate control modes.
- Stair/elevation interaction is not represented in local movement controls.

### 4.3 Mode semantics are mixed
- `walk` mode advances forward using step count and orientation heading.
- `gyro` mode uses tilt as translation input rather than orientation-only heading control.
- This can create expectation mismatch for users.

---

## 5. Recommended Fix Direction (Next Iteration)

### Priority 1 (model-horizon alignment)
- Map gyroscope tilt to model/camera horizon alignment in the scene.
- Keep current static calibration offset as baseline.
- Ensure alignment logic is bounded/smoothed to prevent jitter in visual horizon.

### Priority 2 (axis roles for localization)
- Keep axis responsibilities explicit:
  - Compass: global heading anchor for X/Z world orientation reference.
  - Gyroscope: local orientation/tilt (including horizon and Y-axis attitude control).
  - Accelerometer + steps: translational progress estimate.
- Perform fusion at estimator/policy level, not by coupling raw control signals.

### Priority 3 (CV dynamic horizon)
- Add CV line extraction candidate pipeline for floor-wall seam detection.
- Use CV-derived line as dynamic correction for static gyro horizon baseline.
- Gate application by confidence and temporal stability to avoid oscillation.

---

## 6. TRL-4 Oriented Status Snapshot

### Ready/Improved
- Architecture baseline remains solid.
- Model scale and spawn alignment are significantly improved.
- Movement logic now uses physically meaningful units.

### Still required for robust validation
- Realistic movement interaction policy (remove tilt-to-strafe reliance).
- Clear handling of vertical/floor movement behavior.
- Repeatable test execution evidence from CI/local scripts.
- Mobile field test logs for heading stability and step-to-distance accuracy.

---

## Conclusion
The repository has progressed beyond branch-divergence and now includes independent compass/gyro diagnostics, horizon visualization, and static horizon calibration. The next major milestone is **model-horizon alignment**: applying gyroscope tilt to align scene horizon, then refining it with computer-vision line detection as dynamic correction.
