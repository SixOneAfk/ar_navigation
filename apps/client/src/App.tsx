import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ModelScene } from './components/ModelScene';
import { CameraPermissionPanel } from './components/CameraPermissionPanel';
import { GyroCamera } from './components/GyroCamera';
import { useGyroscope } from './hooks/useGyroscope';
import { useAcceleration } from './hooks/useAcceleration';
import { useMemo, useState } from 'react';

const INITIAL_NAV_POSITION = { x: 0, y: 1.6, z: -3.5 };
const DEFAULT_STEP_THRESHOLD = 1.15;
const DEFAULT_STEP_DEBOUNCE_MS = 350;
const DEFAULT_RAW_DEADBAND = 0.12;
const DEFAULT_STEP_STRIDE_METERS = 0.65;
type PanelId = 'camera' | 'gyro' | 'accel' | 'calibration' | null;

export default function App() {
  const [openPanel, setOpenPanel] = useState<PanelId>(null);
  const [stepThreshold, setStepThreshold] = useState(DEFAULT_STEP_THRESHOLD);
  const [stepDebounceMs, setStepDebounceMs] = useState(DEFAULT_STEP_DEBOUNCE_MS);
  const [rawDeadband, setRawDeadband] = useState(DEFAULT_RAW_DEADBAND);
  const [stepStrideMeters, setStepStrideMeters] = useState(DEFAULT_STEP_STRIDE_METERS);

  const accelConfig = useMemo(
    () => ({
      stepThreshold,
      stepDebounceMs,
      rawDeadband,
    }),
    [rawDeadband, stepDebounceMs, stepThreshold],
  );

  const { state: gyroState, orientationRef, requestPermission } = useGyroscope();
  const {
    state: accelState,
    sample: accelSample,
    stepCount,
    requestPermission: requestAccelPermission,
    stop: stopAcceleration,
    reset: resetAcceleration,
  } = useAcceleration(accelConfig);
  const gyroActive = gyroState === 'granted';
  const accelActive = accelState === 'granted';

  const format = (value: number) => value.toFixed(3);
  const togglePanel = (panel: Exclude<PanelId, null>) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  return (
    <div className="app-shell">
      <CameraPermissionPanel isOpen={openPanel === 'camera'} onClose={() => setOpenPanel(null)} />

      <div className="control-dock">
        <button
          type="button"
          className="control-dock__btn"
          data-active={openPanel === 'camera'}
          onClick={() => togglePanel('camera')}
        >
          Camera
        </button>
        <button
          type="button"
          className="control-dock__btn"
          data-active={openPanel === 'gyro'}
          onClick={() => togglePanel('gyro')}
        >
          Gyro
        </button>
        <button
          type="button"
          className="control-dock__btn"
          data-active={openPanel === 'accel'}
          onClick={() => togglePanel('accel')}
        >
          Motion
        </button>
        <button
          type="button"
          className="control-dock__btn"
          data-active={openPanel === 'calibration'}
          onClick={() => togglePanel('calibration')}
        >
          Tune
        </button>
      </div>

      {openPanel === 'gyro' && (
        <div className="gyro-panel">
          <h2 className="gyro-panel__title">Gyroscope</h2>
          <button
            type="button"
            className="panel-close-btn"
            onClick={() => setOpenPanel(null)}
            aria-label="Close gyroscope panel"
          >
            Close
          </button>

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
            {gyroState === 'granted' && 'Gyroscope active.'}
            {gyroState === 'denied' && 'Permission denied. Allow motion sensors in browser settings.'}
            {gyroState === 'insecure' && 'Gyroscope requires HTTPS or localhost. Open the app from a secure origin.'}
            {gyroState === 'unsupported' && 'DeviceOrientationEvent not supported on this device.'}
          </p>
        </div>
      )}

      {openPanel === 'accel' && (
      <div className="accel-panel">
        <h2 className="accel-panel__title">Acceleration Sensor</h2>
        <button
          type="button"
          className="panel-close-btn"
          onClick={() => setOpenPanel(null)}
          aria-label="Close acceleration panel"
        >
          Close
        </button>

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
              <span>Debounce {stepDebounceMs}ms</span>
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
      )}

      {openPanel === 'calibration' && (
      <div className="calibration-panel">
        <h2 className="calibration-panel__title">Movement Calibration</h2>
        <button
          type="button"
          className="panel-close-btn"
          onClick={() => setOpenPanel(null)}
          aria-label="Close calibration panel"
        >
          Close
        </button>
        <p className="calibration-panel__text">
          Tune sensitivity while walking. Lower threshold means easier step detection.
        </p>

        <label className="calibration-control" htmlFor="step-threshold">
          <span>Step threshold: {stepThreshold.toFixed(2)}</span>
          <input
            id="step-threshold"
            type="range"
            min={0.2}
            max={2.5}
            step={0.01}
            value={stepThreshold}
            onChange={(event) => setStepThreshold(Number(event.target.value))}
          />
        </label>

        <label className="calibration-control" htmlFor="step-debounce">
          <span>Step debounce (ms): {stepDebounceMs}</span>
          <input
            id="step-debounce"
            type="range"
            min={120}
            max={800}
            step={10}
            value={stepDebounceMs}
            onChange={(event) => setStepDebounceMs(Number(event.target.value))}
          />
        </label>

        <label className="calibration-control" htmlFor="raw-deadband">
          <span>Raw deadband: {rawDeadband.toFixed(2)}</span>
          <input
            id="raw-deadband"
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={rawDeadband}
            onChange={(event) => setRawDeadband(Number(event.target.value))}
          />
        </label>

        <label className="calibration-control" htmlFor="step-stride">
          <span>Step stride (m): {stepStrideMeters.toFixed(2)}</span>
          <input
            id="step-stride"
            type="range"
            min={0.2}
            max={1.4}
            step={0.01}
            value={stepStrideMeters}
            onChange={(event) => setStepStrideMeters(Number(event.target.value))}
          />
        </label>

        <button
          type="button"
          className="calibration-panel__btn"
          onClick={() => {
            setStepThreshold(DEFAULT_STEP_THRESHOLD);
            setStepDebounceMs(DEFAULT_STEP_DEBOUNCE_MS);
            setRawDeadband(DEFAULT_RAW_DEADBAND);
            setStepStrideMeters(DEFAULT_STEP_STRIDE_METERS);
          }}
        >
          Reset Calibration
        </button>
      </div>
      )}

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
          stepStrideMeters={stepStrideMeters}
          basePosition={INITIAL_NAV_POSITION}
        />

        {/* OrbitControls only when gyro is off (mouse/touch drag on desktop) */}
        {!gyroActive && !accelActive && <OrbitControls target={[0, 1.2, 0]} />}
      </Canvas>
    </div>
  );
}
