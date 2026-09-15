# Changes From Initial Main Clone

## Baseline

The initial clone baseline is `c8a6bd8` (`first commit`, 2026-05-06). The reflog records the `Edgars` branch being created from `main` at this commit on 2026-07-21. The exact original clone timestamp is not recorded, but this is the earliest verified clone point available in Git history.

The baseline contained orientation-only gyro camera rotation. It did not contain the later `apps/client` movement tree, accelerometer walking pipeline, joystick, or expanded calibration UI.

## Movement

- `4a4507d` introduced the later frontend movement/UI tree and movement modes.
- Camera movement now supports `off`, `gyro`, `buttons`, and `walk` modes.
- Movement direction is derived from the camera's horizontal forward/right vectors, so heading changes do not alter the configured movement speed.
- Joystick and gyro movement use meters-per-second multiplied by frame delta instead of unexplained per-frame displacement constants.
- The current default movement speed is `1.5 m/s`; the active App uses neutral sensitivity `1.0`.
- Walking uses the existing accelerometer step detector and calibrated stride. Detected step cadence produces a walking velocity in `m/s`, and camera displacement is `velocity * delta` in meters.
- Camera height is clamped at `1.2` meters.
- Walking regression coverage was updated in `3e32350`.

## Sensors

- `e6aef5c` introduced the working gyro/accelerometer prototype.
- `useGyroscope` evolved from orientation-only capture to orientation and motion permission handling, calibrated orientation, motion bias offsets, listener cleanup, and sensor diagnostics.
- Orientation uses calibrated `alpha`, `beta`, and `gamma`; `GyroCamera` converts the relative alpha heading into a smoothed Three.js quaternion.
- Motion reads `DeviceMotionEvent.acceleration` when available and falls back to `accelerationIncludingGravity`; the selected sample is stored after calibration offsets are removed.
- The separate `useAcceleration` hook performs step detection from motion samples and owns step-count configuration.

## GLB Scale

- `e72e704` replaced the active model asset and removed automatic model normalization.
- `ModelScene` now uses `Box3` dimensions for diagnostics and centering only; it does not calculate a fit scale.
- Intended convention: `1 Three.js world unit = 1 real-world meter`.
- The active prototype GLB was measured from its exported geometry at approximately `41.48 m x 4.00 m x 39.27 m`. This differs from the intended Blender description of approximately `35 m x 27 m`; the export dimensions should be verified in Blender rather than corrected by scaling the scene.

## Joystick

- `eba1e30` replaced the active manual directional-button path with `VirtualJoystick`.
- Joystick values are normalized to `x` and `y` in `-1..1`.
- `x` controls camera-relative left/right strafe; `y` controls camera-relative forward/backward movement.
- An `0.08` deadzone removes small pointer drift, and radial normalization prevents diagonal input from exceeding unit magnitude.
- Pointer Events provide touch and mouse support, pointer capture keeps dragging continuous, and release/cancel resets input to the center.

## Calibration And Debugging

- Orientation calibration stores alpha/beta/gamma offsets before camera calculations.
- Motion calibration collects stationary samples and stores x/y/z bias offsets for `motionRef`.
- Debug logging was added to diagnose sensor permission, orientation, motion, joystick, walking velocity, camera position, GLB dimensions, delta time, and distance per frame.
- Movement logs are throttled; high-frequency diagnostics are not intentionally enabled in production unless the sensor debug flag is enabled.

## Confirmed Versus Assumed

Confirmed from Git:

- `c8a6bd8` is the initial verified clone baseline.
- Orientation-only gyro behavior existed in that baseline.
- `e6aef5c`, `4a4507d`, `e72e704`, `eba1e30`, and `3e32350` introduced the documented feature groups.

Not confirmed from Git:

- The original reason for every historical tuning value could not be determined from commit messages alone.
- The intended `35 m x 27 m` Blender dimensions could not be confirmed from the active GLB; the measured exported bounds are documented above.
