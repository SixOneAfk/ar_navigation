import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ModelScene } from './components/ModelScene';
import { CameraPermissionPanel } from './components/CameraPermissionPanel';
import { CompassWidget } from './components/CompassWidget';
import { GyroCamera } from './components/GyroCamera';
import { NavigationStatus } from './components/NavigationStatus';
import { NavigationTracker } from './components/NavigationTracker';
import { NavigationRouteLine } from './components/NavigationRouteLine';
import { NavigationArrow } from './components/NavigationArrow';
import { VirtualJoystick, type JoystickValue } from './components/VirtualJoystick';
import { useGyroscope } from './hooks/useGyroscope';
import { useAcceleration } from './hooks/useAcceleration';
import { useEffect, useMemo, useState } from 'react';
import { useNavigation } from './navigation/useNavigation';
import type { ModelSceneFrame } from './navigation/navigationData';

const INITIAL_NAV_POSITION = { x: 0, y: 1.6, z: 3.5 };
const MODEL_SCENE_POSITION: [number, number, number] = [0, 0, -4];
const MODEL_PATH = '/Floor%201_Rotated_Points.glb';
const DEFAULT_STEP_THRESHOLD = 1.15;
const DEFAULT_STEP_DEBOUNCE_MS = 350;
const DEFAULT_RAW_DEADBAND = 0.12;
const DEFAULT_STEP_STRIDE_METERS = 0.65;
const DEFAULT_VERTICAL_DEBUG_ENABLED = false;
type MoveMode = 'off' | 'gyro' | 'buttons' | 'walk';
type PanelId = 'camera' | 'gyro' | 'accel' | 'calibration' | 'compass' | 'navigation' | null;

/**
 * CHANGE FROM INITIAL MAIN CLONE
 *
 * What changed:
 * - The original App only enabled orientation permission and camera rotation.
 * - The current App owns movement modes, joystick state, motion permission, and step data.
 *
 * Why:
 * - The AR client needed walking and manual navigation in addition to gyro rotation.
 *
 * Previous behavior:
 * - Gyro permission controlled only camera orientation.
 *
 * Current behavior:
 * - Sensor permission feeds gyro rotation and accelerometer step detection.
 * - Movement remains camera-relative and the GLB is kept at world scale.
 *
 * Impact:
 * - Affects movement modes, joystick movement, walking calibration, and camera position.
 * - Introduced by the frontend movement work in 4a4507d and later client commits.
 */

export default function App() {
  const [openPanel, setOpenPanel] = useState<PanelId>('navigation');
  const [stepThreshold, setStepThreshold] = useState(DEFAULT_STEP_THRESHOLD);
  const [stepDebounceMs, setStepDebounceMs] = useState(DEFAULT_STEP_DEBOUNCE_MS);
  const [rawDeadband, setRawDeadband] = useState(DEFAULT_RAW_DEADBAND);
  const [stepStrideMeters, setStepStrideMeters] = useState(DEFAULT_STEP_STRIDE_METERS);
  const [moveMode, setMoveMode] = useState<MoveMode>('walk');
  const [joystick, setJoystick] = useState<JoystickValue>({ x: 0, y: 0 });
  const [verticalAxis, setVerticalAxis] = useState(0);
  const [debugVerticalEnabled, setDebugVerticalEnabled] = useState(DEFAULT_VERTICAL_DEBUG_ENABLED);
  const [headingDegrees, setHeadingDegrees] = useState(0);
  const [modelFrame, setModelFrame] = useState<ModelSceneFrame | null>(null);
  const navigation = useNavigation(modelFrame, INITIAL_NAV_POSITION.y);

  const accelConfig = useMemo(
    () => ({
      stepThreshold,
      stepDebounceMs,
      rawDeadband,
    }),
    [rawDeadband, stepDebounceMs, stepThreshold],
  );

  const { state: gyroState, orientationRef, headingRef, motionRef, requestPermission } = useGyroscope();
  const {
    state: accelState,
    sample: accelSample,
    stepCount,
    requestPermission: requestAccelPermission,
    stop: stopAcceleration,
    reset: resetAcceleration,
  } = useAcceleration(accelConfig);
  const gyroActive = gyroState === 'granted';
  const cameraActive = moveMode === 'buttons' || (gyroActive && moveMode !== 'off');

  const requestSensorPermission = async () => {
    // Both listeners are requested from the same user gesture for mobile browsers.
    await Promise.all([requestPermission(), requestAccelPermission()]);
  };

  useEffect(() => {
    const timer = window.setInterval(() => setHeadingDegrees(headingRef.current.fusedHeadingDeg), 250);
    return () => window.clearInterval(timer);
  }, [headingRef]);

  useEffect(() => {
    setJoystick({ x: 0, y: 0 });
    setVerticalAxis(0);
  }, [moveMode]);

  const format = (value: number) => value.toFixed(3);
  const togglePanel = (panel: Exclude<PanelId, null>) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };
  const navigationStatusProps = {
    buildingName: navigation.buildingName,
    currentPointId: navigation.currentPointId,
    debugSnapshot: navigation.debugSnapshot,
    debugEnabled: navigation.debugEnabled,
    loadError: navigation.loadError,
    alignmentWarning: navigation.alignmentWarning,
    navigationPoints: navigation.navigationPoints,
    availableDestinations: navigation.availableDestinations,
    destinationId: navigation.destinationId,
    activeRoute: navigation.activeRoute,
    routeMessage: navigation.routeMessage,
    onNavigate: navigation.navigateTo,
    onCancelNavigation: navigation.cancelNavigation,
    headingDegrees,
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
        <button
          type="button"
          className="control-dock__btn"
          data-active={openPanel === 'compass'}
          onClick={() => togglePanel('compass')}
        >
          Compass
        </button>
        <button
          type="button"
          className="control-dock__btn"
          data-active={openPanel === 'navigation'}
          onClick={() => togglePanel('navigation')}
        >
          Navigation
        </button>
      </div>

      <CompassWidget
        headingRef={headingRef}
        orientationRef={orientationRef}
        enabled={gyroActive}
        activeRoute={navigation.activeRoute}
        currentPointId={navigation.currentPointId}
        isOpen={openPanel === 'compass'}
        onToggle={() => togglePanel('compass')}
      />

      {openPanel !== 'gyro' && (
        <NavigationStatus
          {...navigationStatusProps}
          isOpen={openPanel === 'navigation'}
          onToggle={() => togglePanel('navigation')}
        />
      )}

      {openPanel === 'gyro' && (
        <div className="gyro-panel">
          <h2 className="gyro-panel__title">Gyroscope</h2>
          <NavigationStatus
            {...navigationStatusProps}
            className="navigation-status navigation-status--inline"
            isOpen
            collapsible={false}
          />
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
              onClick={requestSensorPermission}
              disabled={gyroState === 'requesting'}
            >
              {gyroState === 'requesting' ? 'Requesting…' : 'Enable Gyro'}
            </button>
          </div>

          <div className="gyro-panel__actions" aria-label="Movement mode">
            {(['off', 'gyro', 'walk', 'buttons'] as MoveMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className="gyro-panel__btn"
                data-active={moveMode === mode}
                onClick={() => setMoveMode(mode)}
              >
                {mode === 'off' ? 'Move Off' : mode === 'gyro' ? 'Gyro Move' : mode === 'walk' ? 'Walk Forward' : 'Buttons'}
              </button>
            ))}
          </div>

          {moveMode === 'buttons' && (
            <div className="gyro-panel__joystick-area">
              <VirtualJoystick
                value={joystick}
                onChange={setJoystick}
                onRelease={() => setJoystick({ x: 0, y: 0 })}
              />
              <span className="gyro-panel__joystick-readout">
                X {joystick.x.toFixed(2)} / Y {joystick.y.toFixed(2)}
              </span>

              <label className="gyro-panel__toggle" htmlFor="debug-vertical-toggle">
                <input
                  id="debug-vertical-toggle"
                  type="checkbox"
                  checked={debugVerticalEnabled}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setDebugVerticalEnabled(next);
                    if (!next) {
                      setVerticalAxis(0);
                    }
                  }}
                />
                Enable debug up/down
              </label>

              {debugVerticalEnabled && (
                <div className="gyro-panel__vertical-controls" aria-label="Vertical movement controls">
                  <button
                    type="button"
                    className="gyro-panel__btn gyro-panel__btn--secondary"
                    onPointerDown={() => setVerticalAxis(1)}
                    onPointerUp={() => setVerticalAxis(0)}
                    onPointerLeave={() => setVerticalAxis(0)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="gyro-panel__btn gyro-panel__btn--secondary"
                    onPointerDown={() => setVerticalAxis(-1)}
                    onPointerUp={() => setVerticalAxis(0)}
                    onPointerLeave={() => setVerticalAxis(0)}
                  >
                    Down
                  </button>
                </div>
              )}
            </div>
          )}

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

        <ModelScene
          modelPath={MODEL_PATH}
          enableModel
          position={MODEL_SCENE_POSITION}
          onModelFrame={setModelFrame}
        />

        <NavigationTracker
          initialPosition={navigation.initialPosition}
          points={navigation.worldPoints}
          onPlayerPosition={navigation.observePlayerPosition}
        />

        <NavigationRouteLine route={navigation.activeRoute} points={navigation.worldPoints} />

        <NavigationArrow
          route={navigation.activeRoute}
          currentPointId={navigation.currentPointId}
          points={navigation.worldPoints}
          headingDegrees={headingDegrees}
          debugEnabled={navigation.debugEnabled}
        />

        {/* Gyro rotation applied inside the Canvas each frame */}
        <GyroCamera
          orientationRef={orientationRef}
          headingRef={headingRef}
          motionRef={motionRef}
          active={cameraActive}
          moveMode={moveMode}
          joystick={joystick}
          stepCount={stepCount}
          stepStrideMeters={stepStrideMeters}
          verticalAxis={verticalAxis}
          debugVerticalEnabled={debugVerticalEnabled}
          sensitivity={1}
        />

        {/* OrbitControls only when gyro is off (mouse/touch drag on desktop) */}
        {!cameraActive && <OrbitControls target={[0, 1.2, 0]} />}
      </Canvas>
    </div>
  );
}
