import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type DebugOverlayProps = {
  tracking: { x: number; y: number; z: number };
  sensorSnapshot: { alpha: number; beta: number; gamma: number; x: number; y: number; z: number };
  moveMode: 'off' | 'gyro' | 'buttons' | 'walk';
  sensitivity: number;
  calibration: { alphaOffset: number; betaOffset: number; gammaOffset: number };
};

function DebugCameraRig({ tracking }: { tracking: { x: number; y: number; z: number } }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(tracking.x - 3.5, tracking.y + 1.4, tracking.z + 4.5);
    groupRef.current.lookAt(tracking.x, tracking.y, tracking.z);
  });

  return (
    <group ref={groupRef}>
      <perspectiveCamera fov={45} />
    </group>
  );
}

export function DebugOverlay({ tracking, sensorSnapshot, moveMode, sensitivity, calibration }: DebugOverlayProps) {
  const info = useMemo(() => [
    `Alpha: ${sensorSnapshot.alpha.toFixed(1)}`,
    `Beta: ${sensorSnapshot.beta.toFixed(1)}`,
    `Gamma: ${sensorSnapshot.gamma.toFixed(1)}`,
    `Motion: ${sensorSnapshot.x.toFixed(2)}, ${sensorSnapshot.y.toFixed(2)}, ${sensorSnapshot.z.toFixed(2)}`,
    `Mode: ${moveMode}`,
    `Sensitivity: ${sensitivity.toFixed(1)}`,
    `Cal: ${calibration.alphaOffset.toFixed(1)}, ${calibration.betaOffset.toFixed(1)}, ${calibration.gammaOffset.toFixed(1)}`,
  ], [calibration, moveMode, sensitivity, sensorSnapshot]);

  return (
    <div style={{ width: '100%', height: '260px', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)', background: '#0f172a' }}>
      <Canvas camera={{ position: [0, 2, 6], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[6, 8, 6]} intensity={1.2} />

        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#38bdf8" />
        </mesh>

        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 1.8, 18]} />
          <meshStandardMaterial color="#fb923c" />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <circleGeometry args={[4, 48]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>

        <DebugCameraRig tracking={tracking} />

        <group>
          <mesh position={[tracking.x, tracking.y, tracking.z]}>
            <sphereGeometry args={[0.12, 24, 24]} />
            <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.4} />
          </mesh>
        </group>
      </Canvas>

      <div style={{ position: 'absolute', left: '0.75rem', bottom: '0.75rem', background: 'rgba(2,6,23,0.85)', color: '#e2e8f0', padding: '0.5rem 0.7rem', borderRadius: '8px', fontSize: '0.8rem', lineHeight: 1.4 }}>
        {info.map((line) => <div key={line}>{line}</div>)}
      </div>
    </div>
  );
}
