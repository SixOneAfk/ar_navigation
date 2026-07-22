import { Suspense } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { GroupProps } from '@react-three/fiber';

type ModelSceneProps = {
  modelPath: string;
  enableModel?: boolean;
} & GroupProps;

function CorridorModel({ modelPath, ...props }: ModelSceneProps) {
  const gltf = useGLTF(modelPath);

  return <primitive object={gltf.scene} {...props} />;
}

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
