import { Suspense } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { GroupProps } from '@react-three/fiber';
import * as THREE from 'three';

type ModelSceneProps = {
  modelPath: string;
  enableModel?: boolean;
} & GroupProps;

/**
 * Loads and scales the corridor GLTF model so it fits neatly into the scene.
 * The model is centered and resized before being displayed.
 */
function CorridorModel({ modelPath, ...props }: ModelSceneProps) {
  const gltf = useGLTF(modelPath);
  const scene = gltf.scene.clone();

  // Measure the model bounds so we can normalize its size.
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  const fitScale = 2.2 / maxDimension;

  // Reposition the model so its origin sits at the center of the scene.
  const center = new THREE.Vector3();
  box.getCenter(center);
  scene.position.set(-center.x, -center.y, -center.z);
  scene.scale.setScalar(fitScale);

  return (
    <group>
      <group position={[0, 0, 0]} rotation={[0, 0, 0]}>
        <primitive object={scene} {...props} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.02, 0]}>
        <circleGeometry args={[10, 64]} />
        <meshStandardMaterial color="#dfe5ee" />
      </mesh>
    </group>
  );
}

/**
 * Renders a placeholder floor and a helpful message when the model is not available.
 * This keeps the scene visually stable while the user adds a GLTF file.
 */
function FloorFallback() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#dfe6f2" />
      </mesh>
      <Html position={[0, 1.2, 0]} center>
        <div
          style={{
            padding: '0.6rem 0.9rem',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.9)',
            fontSize: '0.85rem',
            border: '1px solid #d0d8e5',
            color: '#1f2a3d',
          }}
        >
          Add public/model.glb to see your corridor model.
        </div>
      </Html>
    </group>
  );
}

/**
 * Main scene wrapper.
 * It switches between the real model and the fallback floor based on the enableModel flag.
 */
export function ModelScene({ modelPath, enableModel = false, ...props }: ModelSceneProps) {
  if (!enableModel) {
    return <FloorFallback />;
  }

  return (
    <Suspense fallback={<FloorFallback />}>
      <CorridorModel modelPath={modelPath} {...props} />
    </Suspense>
  );
}
