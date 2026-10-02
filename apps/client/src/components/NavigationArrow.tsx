import { Html, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { NavigationPath } from '../navigation/graph';
import type { WorldNavigationPoint } from '../navigation/navigationData';

const ARROW_MODEL_PATH = '/assets/Arrow1.glb';
const ARROW_SCALE = 0.5;
const ARROW_OPACITY = 0.48;
const ARROW_FORWARD_DISTANCE = 2.5;
const ARROW_HEIGHT = 1.55;
const ARROW_MODEL_ROTATION_Y = 0;

type NavigationArrowProps = {
  route: NavigationPath | null;
  currentPointId: string | null;
  points: WorldNavigationPoint[];
  headingDegrees: number;
  debugEnabled: boolean;
};

type ArrowReadout = {
  route: string;
  currentPoint: string;
  routeIndex: number;
  nextPoint: string;
  segmentDistance: number;
  targetPoint: string;
  targetDirection: number;
  playerHeading: number;
  sensorHeading: number;
  relativeAngle: number;
  remainingDistance: number;
};

const INITIAL_READOUT: ArrowReadout = {
  route: '',
  currentPoint: 'NONE',
  routeIndex: 0,
  nextPoint: 'NONE',
  segmentDistance: 0,
  targetPoint: 'NONE',
  targetDirection: 0,
  playerHeading: 0,
  sensorHeading: 0,
  relativeAngle: 0,
  remainingDistance: 0,
};

function normalizeAngle(degrees: number) {
  return ((degrees + 540) % 360) - 180;
}

function getRouteIndex(route: NavigationPath, currentPointId: string | null) {
  const index = currentPointId ? route.points.indexOf(currentPointId) : -1;
  return index >= 0 ? index : 0;
}

function getTargetPointId(route: NavigationPath, currentPointId: string | null) {
  const routeIndex = getRouteIndex(route, currentPointId);
  const instruction = route.instructions.find((candidate) =>
    candidate.pointIds.includes(currentPointId ?? route.start) && candidate.to !== currentPointId,
  );
  return instruction?.to ?? route.points[Math.min(routeIndex + 1, route.points.length - 1)] ?? route.destination;
}

export function getRouteProgress(
  route: NavigationPath,
  playerPosition: THREE.Vector3,
  pointPositions: ReadonlyMap<string, THREE.Vector3>,
) {
  // Find where the player actually is along the route by projecting the live position onto
  // every segment, instead of trusting currentPointId (the nearest of ALL navigation points,
  // which is frequently off-route and would otherwise freeze progress at route index 0).
  const cumulativeDistance: number[] = [0];
  for (const direction of route.directions) {
    cumulativeDistance.push(cumulativeDistance[cumulativeDistance.length - 1] + direction.distanceMeters);
  }

  let bestIndex = 0;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let bestProgress = 0;

  for (let index = 0; index < route.points.length - 1; index += 1) {
    const start = pointPositions.get(route.points[index]);
    const end = pointPositions.get(route.points[index + 1]);
    if (!start || !end) continue;

    const segmentX = end.x - start.x;
    const segmentZ = end.z - start.z;
    const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
    const progress = lengthSquared > 0
      ? THREE.MathUtils.clamp(
        ((playerPosition.x - start.x) * segmentX + (playerPosition.z - start.z) * segmentZ) / lengthSquared,
        0,
        1,
      )
      : 0;

    const projectedX = start.x + segmentX * progress;
    const projectedZ = start.z + segmentZ * progress;
    const deltaX = playerPosition.x - projectedX;
    const deltaZ = playerPosition.z - projectedZ;
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;

    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestIndex = index;
      bestProgress = progress;
    }
  }

  const nextPointId = route.points[bestIndex + 1] ?? route.destination;
  const segmentDistance = route.directions[bestIndex]?.distanceMeters ?? 0;
  const distanceToNext = segmentDistance * (1 - bestProgress);
  const traveledMeters = cumulativeDistance[bestIndex] + segmentDistance * bestProgress;
  const remainingDistance = Math.max(0, route.distanceMeters - traveledMeters);

  return {
    routeIndex: bestIndex,
    nextPointId,
    segmentDistance,
    distanceToNext,
    remainingDistance,
  };
}


export function NavigationArrow({
  route,
  currentPointId,
  points,
  headingDegrees,
  debugEnabled,
}: NavigationArrowProps) {
  const { camera } = useThree();
  const { scene } = useGLTF(ARROW_MODEL_PATH);
  const arrowModel = useMemo(() => {
    const clonedScene = scene.clone(true);
    clonedScene.rotation.y = THREE.MathUtils.degToRad(ARROW_MODEL_ROTATION_Y);
    const clonedMaterials: THREE.Material[] = [];

    clonedScene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const cloneMaterial = (source: THREE.Material) => {
        const material = source.clone();
        material.transparent = true;
        material.opacity *= ARROW_OPACITY;
        material.depthWrite = false;
        clonedMaterials.push(material);
        return material;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(cloneMaterial)
        : cloneMaterial(object.material);
    });

    return { scene: clonedScene, materials: clonedMaterials };
  }, [scene]);
  const rootRef = useRef<THREE.Group>(null);
  const hudAnchorRef = useRef<THREE.Group>(null);
  const arrowRef = useRef<THREE.Group>(null);
  const targetVectorRef = useRef(new THREE.Vector3());
  const localTargetRef = useRef(new THREE.Vector3());
  const inverseCameraQuaternionRef = useRef(new THREE.Quaternion());
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const baseEmissiveIntensityRef = useRef(0);
  const assetLoggedRef = useRef(false);
  const lastTargetRef = useRef<string | null>(null);
  const pulseTimeRef = useRef(0);
  const readoutElapsedRef = useRef(0);
  const [readout, setReadout] = useState(INITIAL_READOUT);
  const pointPositions = useMemo(
    () => new Map(points.map((point) => [point.id, point.position])),
    [points],
  );

  useEffect(() => {
    if (!assetLoggedRef.current) {
      const bounds = new THREE.Box3().setFromObject(scene);
      const dimensions = bounds.getSize(new THREE.Vector3());
      console.info('[NAVIGATION ARROW] Loaded Blender arrow: Arrow1.glb');
      console.info('[NAVIGATION ARROW] Blender arrow bounds:', {
        min: bounds.min.toArray(),
        max: bounds.max.toArray(),
        dimensions: dimensions.toArray(),
        localForward: '-Z (tip at minimum Z)',
        rotationOffsetDegrees: ARROW_MODEL_ROTATION_Y,
      });
      assetLoggedRef.current = true;
    }

    const emissiveMaterial = arrowModel.materials.find(
      (material): material is THREE.MeshStandardMaterial => material instanceof THREE.MeshStandardMaterial,
    );
    if (emissiveMaterial) {
      materialRef.current = emissiveMaterial;
      baseEmissiveIntensityRef.current = emissiveMaterial.emissiveIntensity;
    }
  }, [arrowModel, scene]);

  useEffect(() => {
    if (!route) lastTargetRef.current = null;
  }, [route]);

  useFrame((_, delta) => {
    if (!route || !rootRef.current || !arrowRef.current) return;

    const targetPointId = getTargetPointId(route, currentPointId);
    const targetPoint = points.find((point) => point.id === targetPointId);
    if (!targetPoint) return;

    if (targetPointId !== lastTargetRef.current) {
      if (debugEnabled && lastTargetRef.current) {
        console.info(`[NAV ARROW] Target changed: ${lastTargetRef.current} -> ${targetPointId}`);
      }
      lastTargetRef.current = targetPointId;
    }

    targetVectorRef.current.subVectors(targetPoint.position, camera.position);
    targetVectorRef.current.y = 0;
    if (targetVectorRef.current.lengthSq() === 0) return;

    inverseCameraQuaternionRef.current.copy(camera.quaternion).invert();
    localTargetRef.current.copy(targetVectorRef.current).applyQuaternion(inverseCameraQuaternionRef.current);
    const targetAngle = Math.atan2(localTargetRef.current.x, -localTargetRef.current.z);
    arrowRef.current.rotation.y = THREE.MathUtils.damp(arrowRef.current.rotation.y, targetAngle, 9, delta);

    rootRef.current.position.copy(camera.position);
    rootRef.current.quaternion.copy(camera.quaternion);
    hudAnchorRef.current?.position.set(0, ARROW_HEIGHT - camera.position.y, -ARROW_FORWARD_DISTANCE);
    pulseTimeRef.current += delta;
    readoutElapsedRef.current += delta;
    const pulse = 1 + Math.sin(pulseTimeRef.current * 4) * 0.035;
    arrowRef.current.scale.setScalar(ARROW_SCALE * pulse);
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = Math.max(
        0,
        baseEmissiveIntensityRef.current + Math.sin(pulseTimeRef.current * 4) * 0.05,
      );
    }

    if (readoutElapsedRef.current >= 0.15) {
      readoutElapsedRef.current = 0;
      const targetDirection = Math.atan2(targetVectorRef.current.x, -targetVectorRef.current.z) * 180 / Math.PI;
      const cameraForward = localTargetRef.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const playerHeading = Math.atan2(cameraForward.x, -cameraForward.z) * 180 / Math.PI;
      const routeProgress = getRouteProgress(route, camera.position, pointPositions);
      if (debugEnabled) {
        console.info(
          [
            '[NAVIGATION] LIVE DISTANCE',
            `  Player: X=${camera.position.x.toFixed(2)} Y=${camera.position.y.toFixed(2)} Z=${camera.position.z.toFixed(2)}`,
            `  Current Point: ${currentPointId ?? 'NONE'}`,
            `  Next Point: ${routeProgress.nextPointId}`,
            `  Distance To Next: ${routeProgress.distanceToNext.toFixed(1)}m`,
            `  Remaining Route: ${routeProgress.remainingDistance.toFixed(1)}m`,
          ].join('\n'),
        );
      }
      setReadout({
        route: route.points.join(' -> '),
        currentPoint: currentPointId ?? 'NONE',
        routeIndex: routeProgress.routeIndex,
        nextPoint: routeProgress.nextPointId,
        segmentDistance: routeProgress.segmentDistance,
        targetPoint: targetPointId,
        targetDirection: (targetDirection + 360) % 360,
        playerHeading: (playerHeading + 360) % 360,
        sensorHeading: headingDegrees,
        relativeAngle: normalizeAngle(targetDirection - playerHeading),
        remainingDistance: routeProgress.remainingDistance,
      });
    }
  });

  if (!route) return null;

  const displayDistance = Math.max(0, readout.remainingDistance);
  const distanceLabel = displayDistance < 1 ? '<1 m' : `${Math.round(displayDistance)} m`;
  return (
    <group ref={rootRef} renderOrder={20}>
      <group ref={hudAnchorRef} position={[0, ARROW_HEIGHT - camera.position.y, -ARROW_FORWARD_DISTANCE]}>
        <group ref={arrowRef}>
          <primitive object={arrowModel.scene} />
        </group>
      <Html position={[0, -0.72, 0]} center distanceFactor={5} style={{ pointerEvents: 'none' }}>
        <div className="navigation-arrow__distance">{distanceLabel}</div>
      </Html>
      {debugEnabled && (
        <Html position={[0, -1.04, 0]} center distanceFactor={5} style={{ pointerEvents: 'none' }}>
          <div className="navigation-arrow__debug">
            <div>[NAV ARROW]</div>
            <div>Destination: {route.destination}</div>
            <div>Full route: {readout.route || route.points.join(' -> ')}</div>
            <div>Current route index: {readout.routeIndex}</div>
            <div>Current point: {readout.currentPoint}</div>
            <div>Next point: {readout.nextPoint}</div>
            <div>Current segment: {readout.currentPoint} -&gt; {readout.nextPoint}</div>
            <div>Segment distance: {readout.segmentDistance.toFixed(1)} m</div>
            <div>Target point: {readout.targetPoint}</div>
            <div>Target direction: {readout.targetDirection.toFixed(0)}°</div>
            <div>Player heading: {readout.playerHeading.toFixed(0)}°</div>
            <div>Sensor heading: {readout.sensorHeading.toFixed(0)}°</div>
            <div>Relative angle: {readout.relativeAngle.toFixed(0)}°</div>
            <div>Remaining distance: {readout.remainingDistance.toFixed(1)} m</div>
          </div>
        </Html>
      )}
      </group>
    </group>
  );
}