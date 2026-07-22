import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ModelScene } from './components/ModelScene';
import { CameraPermissionPanel } from './components/CameraPermissionPanel';
import { GyroCamera } from './components/GyroCamera';
import { useGyroscope } from './hooks/useGyroscope';
import { useAcceleration } from './hooks/useAcceleration';

const INITIAL_NAV_POSITION = { x: 0, y: 1.6, z: -3.5 };

export default function App() {
  const { state: gyroState, orientationRef, requestPermission } = useGyroscope();
  const {
    state: accelState,
    sample: accelSample,
    stepCount,
    requestPermission: requestAccelPermission,
    stop: stopAcceleration,
    reset: resetAcceleration,
  } = useAcceleration();
  const gyroActive = gyroState === 'granted';
  const accelActive = accelState === 'granted';

  const format = (value: number) => value.toFixed(3);

  return (
    <div className="app-shell">
      {/* ── Sensor permission panels ── */}
      <CameraPermissionPanel />

      {!gyroActive && (
        <div className="gyro-panel">
          <h2 className="gyro-panel__title">Gyroscope</h2>

          <div className="gyro-panel__actions">
            <button
              type="button"
              className="gyro-panel__btn"
              onClick={requestPermission}
              disabled={gyroState === 'requesting'}
            >
              {gyroState === 'requesting' ? 'Requesting…' : 'Enable Gyro'}
            </button>
          </div>

          <p className="gyro-panel__status" data-state={gyroState}>
            {gyroState === 'idle' && 'Gyroscope not active.'}
            {gyroState === 'requesting' && 'Waiting for permission…'}
            {gyroState === 'denied' && 'Permission denied. Allow motion sensors in browser settings.'}
            {gyroState === 'insecure' && 'Gyroscope requires HTTPS or localhost. Open the app from a secure origin.'}
            {gyroState === 'unsupported' && 'DeviceOrientationEvent not supported on this device.'}
          </p>
        </div>
      )}

      <div className="accel-panel">
        <h2 className="accel-panel__title">Acceleration Sensor</h2>

        <div className="accel-panel__actions">
          <button
            type="button"
            className="accel-panel__btn"
            onClick={requestAccelPermission}
            disabled={accelState === 'requesting' || accelState === 'granted'}
          >
            {accelState === 'requesting' ? 'Requesting…' : 'Enable Acceleration'}
          </button>

          <button
            type="button"
            className="accel-panel__btn accel-panel__btn--secondary"
            onClick={stopAcceleration}
            disabled={accelState !== 'granted'}
          >
            Stop
          </button>

          <button
            type="button"
            className="accel-panel__btn accel-panel__btn--secondary"
            onClick={resetAcceleration}
          >
            Reset XYZ
          </button>
        </div>

        <div className="accel-readout" aria-live="polite">
          <div className="accel-readout__row">
            <span>Raw m/s²</span>
            <span>X {format(accelSample.raw.x)}</span>
            <span>Y {format(accelSample.raw.y)}</span>
            <span>Z {format(accelSample.raw.z)}</span>
          </div>
          <div className="accel-readout__row">
            <span>Velocity</span>
            <span>X {format(accelSample.velocity.x)}</span>
            <span>Y {format(accelSample.velocity.y)}</span>
            <span>Z {format(accelSample.velocity.z)}</span>
          </div>
          <div className="accel-readout__row">
            <span>Position</span>
            <span>X {format(accelSample.position.x)}</span>
            <span>Y {format(accelSample.position.y)}</span>
            <span>Z {format(accelSample.position.z)}</span>
          </div>
          <div className="accel-readout__row">
            <span>PDR</span>
            <span>Vert {format(accelSample.verticalAcceleration)}</span>
            <span>Steps {stepCount}</span>
            <span>Debounce 350ms</span>
          </div>
        </div>

        <p className="accel-panel__status" data-state={accelState}>
          {accelState === 'idle' && 'Acceleration sensor is not active.'}
          {accelState === 'requesting' && 'Waiting for permission…'}
          {accelState === 'granted' && 'Sensor active. Logging devicemotion and updating XYZ coordinates.'}
          {accelState === 'denied' && 'Permission denied. Allow motion sensors in browser settings.'}
          {accelState === 'insecure' && 'Motion sensors require HTTPS or localhost.'}
          {accelState === 'unsupported' && 'DeviceMotionEvent not supported on this device.'}
        </p>
      </div>

      {/* ── 3-D Scene ── */}
      <Canvas
        className="ar-canvas"
        gl={{ alpha: true }}
        camera={{ position: [INITIAL_NAV_POSITION.x, INITIAL_NAV_POSITION.y, INITIAL_NAV_POSITION.z], fov: 60 }}
        shadows
      >
        <ambientLight intensity={0.6} />
        <directionalLight castShadow position={[8, 12, 8]} intensity={1.2} />

        <ModelScene modelPath="/model.glb" enableModel={true} position={[0, 0, -4]} />

        {/* Gyro rotation applied inside the Canvas each frame */}
        <GyroCamera
          orientationRef={orientationRef}
          active={gyroActive}
          stepCount={stepCount}
          movementEnabled={accelActive}
          stepStrideMeters={0.65}
          basePosition={INITIAL_NAV_POSITION}
        />

        {/* OrbitControls only when gyro is off (mouse/touch drag on desktop) */}
        {!gyroActive && !accelActive && <OrbitControls target={[0, 1.2, 0]} />}
      </Canvas>
    </div>
  );
}
