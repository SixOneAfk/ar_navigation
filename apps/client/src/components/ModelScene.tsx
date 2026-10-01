import { Suspense, useEffect } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import type { GroupProps } from '@react-three/fiber';
import * as THREE from 'three';
import type { ModelSceneFrame } from '../navigation/navigationData';

type ModelSceneProps = {
  modelPath: string;
  enableModel?: boolean;
  onModelFrame?: (frame: ModelSceneFrame) => void;
} & GroupProps;

/**
 * CHANGE FROM INITIAL MAIN CLONE
 *
 * What changed:
 * - The original model loader normalized the GLB to an arbitrary scene size.
 * - The current loader measures bounds for diagnostics and centering only.
 *
 * Why:
 * - The building is the real-world reference for AR navigation.
 *
 * Previous behavior:
 * - Bounding-box size was used to calculate a fixed fit scale.
 *
 * Current behavior:
 * - The imported GLB scale is preserved: 1 Three.js unit equals 1 meter.
 * - Bounding-box logs verify the exported dimensions without changing them.
 *
 * Impact:
 * - Affects GLB scale, world anchors, camera placement, and movement calibration.
 * - Introduced by Scale is good (e72e704).
 */

/**
 * Loads the corridor GLTF model at the scale exported by Blender.
 * It is centered horizontally and anchored to its lowest modeled floor height.
 */
function CorridorModel({
  modelPath,
  onModelFrame,
  ...props
}: ModelSceneProps) {
  const gltf = useGLTF(modelPath);
  const scene = gltf.scene.clone();

  // Measure the imported bounds for diagnostics and centering only.
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const floorHeight = box.min.y;
  const modelPosition: [number, number, number] = [-center.x, -floorHeight, -center.z];
  const groupPosition = new THREE.Vector3();
  if (Array.isArray(props.position)) {
    groupPosition.fromArray(props.position as [number, number, number]);
  } else if (typeof props.position === 'number') {
    groupPosition.setScalar(props.position);
  } else if (props.position instanceof THREE.Vector3) {
    groupPosition.copy(props.position);
  }

  useEffect(() => {
    onModelFrame?.({
      center: { x: center.x, y: center.y, z: center.z },
      floorHeight,
      position: { x: groupPosition.x, y: groupPosition.y, z: groupPosition.z },
      bounds: {
        min: {
          x: box.min.x - center.x + groupPosition.x,
          y: box.min.y - floorHeight + groupPosition.y,
          z: box.min.z - center.z + groupPosition.z,
        },
        max: {
          x: box.max.x - center.x + groupPosition.x,
          y: box.max.y - floorHeight + groupPosition.y,
          z: box.max.z - center.z + groupPosition.z,
        },
      },
    });
  }, [
    box.max.x,
    box.max.y,
    box.max.z,
    box.min.x,
    box.min.y,
    box.min.z,
    center.x,
    center.y,
    center.z,
    floorHeight,
    groupPosition.x,
    groupPosition.y,
    groupPosition.z,
    onModelFrame,
  ]);

  if (import.meta.env?.DEV) {
    console.debug(
      `GLB size: ${size.x.toFixed(2)}m x ${size.y.toFixed(2)}m x ${size.z.toFixed(2)}m`,
      {
        min: box.min.toArray(),
        max: box.max.toArray(),
        scale: scene.scale.toArray(),
        position: modelPosition,
      },
    );
  }

  return (
    <>
      <group {...props}>
        <primitive object={scene} position={modelPosition} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.02, 0]}>
        <circleGeometry args={[10, 64]} />
        <meshStandardMaterial color="#dfe5ee" />
      </mesh>
    </>
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
