import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ModelScene } from './components/ModelScene';
import { CameraPermissionPanel } from './components/CameraPermissionPanel';
import { GyroCamera } from './components/GyroCamera';
import { useGyroscope } from './hooks/useGyroscope';

export default function App() {
  const { state: gyroState, orientationRef, requestPermission } = useGyroscope();
  const gyroActive = gyroState === 'granted';

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
            {gyroState === 'unsupported' && 'DeviceOrientationEvent not supported on this device.'}
          </p>
        </div>
      )}

      {/* ── 3-D Scene ── */}
      <Canvas
        className="ar-canvas"
        gl={{ alpha: true }}
        camera={{ position: [0, 1.6, 0], fov: 60 }}
        shadows
      >
        <ambientLight intensity={0.6} />
        <directionalLight castShadow position={[8, 12, 8]} intensity={1.2} />

        <ModelScene modelPath="/model.glb" enableModel={true} position={[0, 0, -4]} />

        {/* Gyro rotation applied inside the Canvas each frame */}
        <GyroCamera orientationRef={orientationRef} active={gyroActive} />

        {/* OrbitControls only when gyro is off (mouse/touch drag on desktop) */}
        {!gyroActive && <OrbitControls target={[0, 1.2, 0]} />}
      </Canvas>
    </div>
  );
}
