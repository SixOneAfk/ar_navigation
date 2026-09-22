import { Suspense, useEffect, useMemo } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { GroupProps } from '@react-three/fiber';
import * as THREE from 'three';

export type ModelNormalization = {
  center: {
    x: number;
    y: number;
    z: number;
  };
  scale: number;
};

type ModelSceneProps = {
  modelPath: string;
  enableModel?: boolean;
  realWorldSize?: {
    lengthMeters: number;
    widthMeters: number;
  };
  onNormalizationResolved?: (normalization: ModelNormalization) => void;
} & GroupProps;

/**
 * Loads and scales the corridor GLTF model so it fits neatly into the scene.
 * The model is centered and resized before being displayed.
 */
function CorridorModel({
  modelPath,
  realWorldSize,
  onNormalizationResolved,
  ...groupProps
}: ModelSceneProps) {
  const gltf = useGLTF(modelPath);
  const { scene, normalization } = useMemo(() => {
    const clonedScene = gltf.scene.clone();

    // Match the imported floor plan to its measured real-world dimensions.
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const modelFloorDiagonal = Math.hypot(size.x, size.z) || 1;
    const realFloorDiagonal = realWorldSize
      ? Math.hypot(realWorldSize.lengthMeters, realWorldSize.widthMeters)
      : modelFloorDiagonal;
    const fitScale = realFloorDiagonal / modelFloorDiagonal;

    // Center X/Z at the group position and place the model floor at world Y=0.
    const center = new THREE.Vector3();
    box.getCenter(center);
    clonedScene.scale.setScalar(fitScale);
    clonedScene.position.set(
      -center.x * fitScale,
      -box.min.y * fitScale,
      -center.z * fitScale,
    );

    return {
      scene: clonedScene,
      normalization: {
        center: {
          x: center.x,
          y: center.y,
          z: center.z,
        },
        scale: fitScale,
      },
    };
  }, [gltf.scene, realWorldSize]);

  useEffect(() => {
    onNormalizationResolved?.(normalization);
  }, [normalization, onNormalizationResolved]);

  return (
    <group>
      <group position={[0, 0, 0]} rotation={[0, 0, 0]}>
        <primitive object={scene} {...groupProps} />
      </group>
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
