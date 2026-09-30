import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { NavigationPath } from '../navigation/graph';
import type { WorldNavigationPoint } from '../navigation/navigationData';

type NavigationRouteLineProps = {
  route: NavigationPath | null;
  points: WorldNavigationPoint[];
};

export function NavigationRouteLine({ route, points }: NavigationRouteLineProps) {
  const geometry = useMemo(() => {
    if (!route) return null;
    const positions = route.points
      .map((id) => points.find((point) => point.id === id)?.position ?? null)
      .filter((point): point is THREE.Vector3 => point !== null)
      .map((point) => new THREE.Vector3(point.x, 0.08, point.z));
    if (positions.length < 2) return null;
    return new THREE.BufferGeometry().setFromPoints(positions);
  }, [points, route]);

  const line = useMemo(
    () => geometry ? new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#ef6c45', linewidth: 3 })) : null,
    [geometry],
  );

  useEffect(() => () => {
    geometry?.dispose();
    if (line?.material instanceof THREE.Material) line.material.dispose();
  }, [geometry, line]);

  return line ? <primitive object={line} /> : null;
}