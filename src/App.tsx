import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ModelScene } from './components/ModelScene';
import { CameraPermissionPanel } from './components/CameraPermissionPanel';
import { GyroCamera } from './components/GyroCamera';
import { DebugOverlay } from './components/DebugOverlay';
import { Sidebar } from './components/Sidebar';
import { useGyroscope } from './hooks/useGyroscope';

const CALIBRATION_REFERENCE_DISTANCE = 0.5;
const CALIBRATION_SAMPLE_COUNT = 5;

export default function App() {
  const {
    state: gyroState,
    orientationRef,
    motionRef,
    calibration,
    motionCalibration,
    motionCalibrating,
    calibrate,
    calibrateMotion,
    requestPermission,
    resetMotionCalibration,
  } = useGyroscope();
  const gyroActive = gyroState === 'granted';
  const [tracking, setTracking] = useState({ x: 0, y: 1.6, z: 0 });
  const [debugOpen, setDebugOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [debugWindowOpen, setDebugWindowOpen] = useState(false);
  const [moveMode, setMoveMode] = useState<'off' | 'gyro' | 'buttons' | 'walk'>('off');
  const [buttonState, setButtonState] = useState({ forward: false, backward: false, left: false, right: false, up: false, down: false });
  const [joystick, setJoystick] = useState({ x: 0, y: 0, active: false });
  const [sensitivity, setSensitivity] = useState(0.6);
  const [walkSpeed, setWalkSpeed] = useState(1.0);
  const [calibrationAxis, setCalibrationAxis] = useState<'z' | null>(null);
  const [calibrationStart, setCalibrationStart] = useState<{ x: number; y: number; z: number } | null>(null);
  const [calibrationStartedAt, setCalibrationStartedAt] = useState<number | null>(null);
  const [measuredCalibrationDistance, setMeasuredCalibrationDistance] = useState(0);
  const [calibrationSamples, setCalibrationSamples] = useState<number[]>([]);
  const calibrationPreviousRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const calibrationTravelRef = useRef(0);
  const [sensorSnapshot, setSensorSnapshot] = useState({ alpha: 0, beta: 0, gamma: 0, x: 0, y: 0, z: 0 });
  const worldAnchor: [number, number, number] = [0, 0, -2];
  const cameraActive = (gyroActive && (moveMode === 'gyro' || moveMode === 'walk')) || moveMode === 'buttons';

  const relativeToModel = {
    x: tracking.x - worldAnchor[0],
    y: tracking.y - worldAnchor[1],
    z: tracking.z - worldAnchor[2],
  };

  const updateJoystickState = (x: number, y: number, active: boolean) => {
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));

    setJoystick({ x: clampedX, y: clampedY, active });
    setButtonState({
      forward: clampedY < -0.2,
      backward: clampedY > 0.2,
      left: clampedX < -0.2,
      right: clampedX > 0.2,
      up: false,
      down: false,
    });
  };

  const handleJoystickPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const magnitude = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (rect.width / 2 - 8));
    const normalizedX = magnitude === 0 ? 0 : (dx / (rect.width / 2 - 8));
    const normalizedY = magnitude === 0 ? 0 : (dy / (rect.height / 2 - 8));
    updateJoystickState(normalizedX, normalizedY, true);
  };

  const handleJoystickPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const magnitude = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (rect.width / 2 - 8));
    const normalizedX = magnitude === 0 ? 0 : (dx / (rect.width / 2 - 8));
    const normalizedY = magnitude === 0 ? 0 : (dy / (rect.height / 2 - 8));
    updateJoystickState(normalizedX, normalizedY, true);
  };

  const handleJoystickRelease = () => {
    updateJoystickState(0, 0, false);
  };

  const distanceToModel = Math.sqrt(
    relativeToModel.x ** 2 + relativeToModel.y ** 2 + relativeToModel.z ** 2,
  );

  const calibrationDistance = measuredCalibrationDistance;

  const finishCalibration = () => {
    if (!calibrationAxis || !calibrationStart || calibrationStartedAt === null) {
      return;
    }

    const measuredDistance = Math.max(calibrationTravelRef.current, 0.05);
    const nextCalibrationSamples = [...calibrationSamples, measuredDistance];
    const averageDistance = nextCalibrationSamples.reduce((sum, value) => sum + value, 0) / nextCalibrationSamples.length;
    const averageDistanceClamped = Math.max(averageDistance, 0.05);

    setCalibrationSamples(nextCalibrationSamples);
    setMeasuredCalibrationDistance(averageDistanceClamped);

    if (nextCalibrationSamples.length >= CALIBRATION_SAMPLE_COUNT) {
      const autoWalkSpeed = Math.max(0.2, Math.min(100, CALIBRATION_REFERENCE_DISTANCE / averageDistanceClamped));
      setWalkSpeed(autoWalkSpeed);
    }

    setCalibrationAxis(null);
    setCalibrationStart(null);
    setCalibrationStartedAt(null);
    calibrationPreviousRef.current = null;
  };

  const beginCalibration = () => {
    if (calibrationAxis === 'z') {
      finishCalibration();
      return;
    }

    setCalibrationAxis('z');
    setCalibrationStart({ ...tracking });
    calibrationPreviousRef.current = { ...tracking };
    calibrationTravelRef.current = 0;
    setMeasuredCalibrationDistance(0);
    setCalibrationStartedAt(performance.now());
    setMoveMode('walk');
  };

  const handlePoseChange = (position: { x: number; y: number; z: number }) => {
    setTracking(position);

    if (!calibrationAxis || !calibrationPreviousRef.current || !orientationRef.current) {
      return;
    }

    const previous = calibrationPreviousRef.current;
    const deltaVector = new THREE.Vector3(
      position.x - previous.x,
      position.y - previous.y,
      position.z - previous.z,
    );

    const forwardVector = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(0, THREE.MathUtils.degToRad(orientationRef.current.alpha), 0, 'YXZ'),
    );

    const forwardDistance = Math.max(0, deltaVector.dot(forwardVector));
    calibrationTravelRef.current += forwardDistance;
    calibrationPreviousRef.current = { ...position };
    setMeasuredCalibrationDistance(calibrationTravelRef.current);
  };

  return (
    <div className="app-shell">
      {/* ── Sensor permission panels ── */}
      <CameraPermissionPanel />

      <Sidebar
        isMenuOpen={isMenuOpen}
        onToggleMenu={() => setIsMenuOpen((value) => !value)}
        gyroState={gyroState}
        gyroActive={gyroActive}
        requestPermission={requestPermission}
        worldAnchor={worldAnchor}
        tracking={tracking}
        relativeToModel={relativeToModel}
        distanceToModel={distanceToModel}
        sensitivity={sensitivity}
        walkSpeed={walkSpeed}
        calibrationAxis={calibrationAxis}
        calibrationDistance={calibrationDistance}
        calibrationSamples={calibrationSamples}
        calibrationSampleCount={CALIBRATION_SAMPLE_COUNT}
        calibrationReferenceDistance={CALIBRATION_REFERENCE_DISTANCE}
        motionCalibration={motionCalibration}
        motionCalibrating={motionCalibrating}
        moveMode={moveMode}
        joystick={joystick}
        buttonState={buttonState}
        setMoveMode={setMoveMode}
        setSensitivity={setSensitivity}
        setWalkSpeed={setWalkSpeed}
        setDebugOpen={setDebugOpen}
        setDebugWindowOpen={setDebugWindowOpen}
        onJoystickPointerDown={handleJoystickPointerDown}
        onJoystickPointerMove={handleJoystickPointerMove}
        onJoystickRelease={handleJoystickRelease}
        setButtonState={setButtonState}
        beginCalibration={beginCalibration}
        resetCalibration={() => {
          setCalibrationAxis(null);
          setCalibrationStart(null);
          setCalibrationStartedAt(null);
          setMeasuredCalibrationDistance(0);
          setCalibrationSamples([]);
          calibrationTravelRef.current = 0;
          calibrationPreviousRef.current = null;
        }}
        calibrate={calibrate}
        calibrateMotion={calibrateMotion}
        resetMotionCalibration={resetMotionCalibration}
      />

      {debugOpen && (
        <div
          style={{
            position: 'absolute',
            left: '1rem',
            bottom: '1rem',
            zIndex: 25,
            width: 'min(360px, calc(100vw - 2rem))',
            padding: '0.75rem 0.9rem',
            borderRadius: '12px',
            background: 'rgba(2, 6, 23, 0.9)',
            color: '#e2e8f0',
            fontSize: '0.8rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Debug View</strong>
          <div>Alpha: {sensorSnapshot.alpha.toFixed(1)} | Beta: {sensorSnapshot.beta.toFixed(1)} | Gamma: {sensorSnapshot.gamma.toFixed(1)}</div>
          <div>Motion x: {sensorSnapshot.x.toFixed(2)} y: {sensorSnapshot.y.toFixed(2)} z: {sensorSnapshot.z.toFixed(2)}</div>
          <div>Mode: {moveMode} | Sensitivity: {sensitivity.toFixed(1)}</div>
          <div>Calibration: alpha {calibration.alphaOffset.toFixed(1)} beta {calibration.betaOffset.toFixed(1)} gamma {calibration.gammaOffset.toFixed(1)}</div>
        </div>
      )}

      {debugWindowOpen && (
        <div
          style={{
            position: 'absolute',
            inset: '0',
            zIndex: 35,
            background: 'rgba(2, 6, 23, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div style={{ width: 'min(980px, 100%)', background: '#020617', borderRadius: '18px', padding: '1rem', boxShadow: '0 20px 40px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ color: '#f8fafc' }}>Third-person debug view</strong>
              <button type="button" onClick={() => setDebugWindowOpen(false)}>Close</button>
            </div>
            <DebugOverlay
              tracking={tracking}
              sensorSnapshot={sensorSnapshot}
              moveMode={moveMode}
              sensitivity={sensitivity}
              calibration={calibration}
            />
          </div>
        </div>
      )}

      {/* ── 3-D Scene ── */}
      <Canvas
        className="ar-canvas"
        gl={{ alpha: true }}
        camera={{ position: [0, 1.6, 3], fov: 60 }}
        shadows
      >
        <ambientLight intensity={0.6} />
        <directionalLight castShadow position={[8, 12, 8]} intensity={1.2} />

        <ModelScene modelPath="/model.glb" enableModel={true} position={worldAnchor} />

        {/* Gyro rotation applied inside the Canvas each frame */}
        <GyroCamera
          orientationRef={orientationRef}
          motionRef={motionRef}
          active={cameraActive}
          moveMode={moveMode}
          buttonState={buttonState}
          sensitivity={sensitivity}
          walkSpeed={walkSpeed}
          onPoseChange={handlePoseChange}
          onSensorChange={(snapshot) => setSensorSnapshot(snapshot)}
        />

        {/* OrbitControls only when gyro is off (mouse/touch drag on desktop) */}
        {!gyroActive && <OrbitControls target={[0, 1.2, 0]} />}
      </Canvas>
    </div>
  );
}
