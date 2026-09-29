import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldNavigationPoint } from '../navigation/navigationData';
import { createDebugLogger } from '../utils/debugLogger';

type NavigationTrackerProps = {
  initialPosition: THREE.Vector3 | null;
  points: WorldNavigationPoint[];
  onPlayerPosition: (position: THREE.Vector3) => void;
};

const POSITION_SAMPLE_INTERVAL_SECONDS = 0.1;

export function NavigationTracker({
  initialPosition,
  points,
  onPlayerPosition,
}: NavigationTrackerProps) {
  const { camera } = useThree();
  const initializedRef = useRef(false);
  const sampleElapsedRef = useRef(0);
  const logger = useRef(createDebugLogger({ enabled: true }));

  useEffect(() => {
    if (initializedRef.current || !initialPosition) return;
    camera.position.copy(initialPosition);
    initializedRef.current = true;
    logger.current.info(
      'NavigationTracker',
      [
        '[NAVIGATION] Initial player position',
        `  THREE.js world: X=${camera.position.x.toFixed(3)}m Y=${camera.position.y.toFixed(3)}m Z=${camera.position.z.toFixed(3)}m`,
      ].join('\n'),
    );
  }, [camera, initialPosition]);

  useFrame((_, delta) => {
    if (points.length === 0) return;
    sampleElapsedRef.current += delta;
    if (sampleElapsedRef.current < POSITION_SAMPLE_INTERVAL_SECONDS) return;
    sampleElapsedRef.current %= POSITION_SAMPLE_INTERVAL_SECONDS;
    onPlayerPosition(camera.position);
  });

  return null;
}