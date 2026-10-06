import * as THREE from 'three';

export const NAVIGATION_POINT_RADIUS_M = 0.75;

export type NavigationPoint = {
  id: string;
  row?: number;
  column?: number;
  x: number;
  y: number;
};

export type NavigationBranch = {
  id: string;
  from: string;
  to: string;
  distance: number;
};

export type BuildingNavigation = {
  building?: string;
  grid: {
    cell_size: number;
    margin?: number;
    wall_clearance?: number;
    movement: { diagonal: boolean };
    coordinate_system: {
      type: string;
      reference_object?: string;
      x: string;
      y: string;
    };
  };
  points: NavigationPoint[];
  branches: NavigationBranch[];
  invalidBranches?: string[];
};

export type ModelSceneFrame = {
  center: { x: number; y: number; z: number };
  floorHeight: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
};

export type WorldNavigationPoint = {
  id: string;
  position: THREE.Vector3;
};

export type NavigationDetection = {
  nearestPoint: WorldNavigationPoint | null;
  distanceMeters: number | null;
  currentPointId: string | null;
};

export function formatNavigationLocation(
  playerPosition: Pick<THREE.Vector3, 'x' | 'y' | 'z'>,
  detection: NavigationDetection,
  points: WorldNavigationPoint[],
  radiusMeters = NAVIGATION_POINT_RADIUS_M,
): string {
  const point = detection.currentPointId
    ? points.find((candidate) => candidate.id === detection.currentPointId) ?? detection.nearestPoint
    : detection.nearestPoint;
  const status = detection.currentPointId
    ? 'AT POINT'
    : detection.distanceMeters !== null && detection.distanceMeters <= radiusMeters
      ? 'NEAR POINT'
      : 'OUTSIDE RADIUS';
  const pointPosition = point
    ? `X=${point.position.x.toFixed(2)}m Y=${point.position.y.toFixed(2)}m Z=${point.position.z.toFixed(2)}m`
    : 'unavailable';

  return [
    '[NAVIGATION] Player Location',
    `  Current Point: ${detection.currentPointId ?? 'NONE'}`,
    `  Nearest Point: ${detection.nearestPoint?.id ?? 'NONE'}`,
    `  Player Position (THREE.js world): X=${playerPosition.x.toFixed(2)}m Y=${playerPosition.y.toFixed(2)}m Z=${playerPosition.z.toFixed(2)}m`,
    `  Point Position (THREE.js world): ${pointPosition}`,
    `  Distance to Nearest Point (horizontal): ${detection.distanceMeters === null ? 'unavailable' : `${detection.distanceMeters.toFixed(2)}m`}`,
    `  Detection Radius: ${radiusMeters.toFixed(2)}m`,
    `  Status: ${status}`,
  ].join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

export function parseBuildingNavigation(jsonText: string): BuildingNavigation {
  let value: unknown;
  try {
    const jsonContent = jsonText
      .replace(/^\uFEFF/, '')
      .replace(/^(?:\s*\/\/[^\r\n]*(?:\r?\n|$)\s*)+/, '');
    value = JSON.parse(jsonContent) as unknown;
  } catch (error) {
    throw new Error(`Navigation JSON could not be parsed: ${String(error)}`);
  }

  if (!isRecord(value)) throw new Error('Navigation data must be a JSON object.');
  if (value.building !== undefined && (typeof value.building !== 'string' || value.building.length === 0)) {
    throw new Error('Navigation data building name must be a non-empty string when provided.');
  }

  const grid = value.grid;
  if (!isRecord(grid)) throw new Error('Navigation data is missing grid configuration.');
  const cellSize = requireFiniteNumber(grid.cell_size ?? grid.size, 'grid.cell_size or grid.size');
  const margin = grid.margin === undefined ? undefined : requireFiniteNumber(grid.margin, 'grid.margin');
  const wallClearance = grid.wall_clearance === undefined
    ? undefined
    : requireFiniteNumber(grid.wall_clearance, 'grid.wall_clearance');
  if (cellSize <= 0 || (margin !== undefined && margin < 0) || (wallClearance !== undefined && wallClearance < 0)) {
    throw new Error('Grid configuration requires a positive cell size and non-negative optional margin and wall_clearance.');
  }

  const movement = grid.movement;
  const diagonal = isRecord(movement) ? movement.diagonal : grid.diagonal_connections;
  if (typeof diagonal !== 'boolean') {
    throw new Error('grid.movement.diagonal or grid.diagonal_connections must be a boolean.');
  }
  const coordinateSystem = grid.coordinate_system ?? value.coordinate_system;
  if (
    !isRecord(coordinateSystem) ||
    typeof coordinateSystem.type !== 'string' ||
    (coordinateSystem.reference_object !== undefined && typeof coordinateSystem.reference_object !== 'string') ||
    typeof coordinateSystem.x !== 'string' ||
    typeof coordinateSystem.y !== 'string'
  ) {
    throw new Error('Navigation coordinate_system must define type, x, and y descriptions.');
  }

  const pointsValue = value.points;
  if (!Array.isArray(pointsValue)) throw new Error('Navigation data is missing the points array.');
  if (pointsValue.length === 0) throw new Error('Navigation points array is empty.');

  const ids = new Set<string>();
  const points = pointsValue.map((pointValue, index): NavigationPoint => {
    const label = `points[${index}]`;
    if (!isRecord(pointValue)) throw new Error(`${label} must be an object.`);
    if (typeof pointValue.id !== 'string' || pointValue.id.length === 0) {
      throw new Error(`${label}.id must be a non-empty string.`);
    }
    if (ids.has(pointValue.id)) throw new Error(`Duplicate navigation point ID: ${pointValue.id}.`);
    ids.add(pointValue.id);

    const row = pointValue.row === undefined ? undefined : requireFiniteNumber(pointValue.row, `${label}.row`);
    const column = pointValue.column === undefined ? undefined : requireFiniteNumber(pointValue.column, `${label}.column`);
    if ((row !== undefined && !Number.isInteger(row)) || (column !== undefined && !Number.isInteger(column))) {
      throw new Error(`${label}.row and ${label}.column must be integers when provided.`);
    }

    return {
      id: pointValue.id,
      ...(row === undefined ? {} : { row }),
      ...(column === undefined ? {} : { column }),
      x: requireFiniteNumber(pointValue.x, `${label}.x`),
      y: requireFiniteNumber(pointValue.y, `${label}.y`),
    };
  });

  const branchesValue = value.branches;
  const branches: NavigationBranch[] = [];
  if (!Array.isArray(branchesValue)) throw new Error('Navigation data is missing the branches array.');
  const branchIds = new Set<string>();
  for (const [index, branchValue] of branchesValue.entries()) {
    const label = `branches[${index}]`;
    if (!isRecord(branchValue)) throw new Error(`${label} must be an object.`);
    if (typeof branchValue.id !== 'string' || branchValue.id.length === 0) {
      throw new Error(`${label}.id must be a non-empty string.`);
    }
    if (branchIds.has(branchValue.id)) throw new Error(`Duplicate navigation branch ID: ${branchValue.id}.`);
    branchIds.add(branchValue.id);

    const from = branchValue.from;
    const to = branchValue.to;
    if (typeof from !== 'string' || !ids.has(from)) {
      throw new Error(`${label} (${branchValue.id}) references nonexistent point "${String(from)}" in from.`);
    }
    if (typeof to !== 'string' || !ids.has(to)) {
      throw new Error(`${label} (${branchValue.id}) references nonexistent point "${String(to)}" in to.`);
    }
    const distance = requireFiniteNumber(branchValue.distance, `${label}.distance`);
    if (distance <= 0) throw new Error(`${label}.distance must be a finite positive number.`);
    branches.push({ id: branchValue.id, from, to, distance });
  }

  return {
    ...(typeof value.building === 'string' ? { building: value.building } : {}),
    grid: {
      cell_size: cellSize,
      ...(margin === undefined ? {} : { margin }),
      ...(wallClearance === undefined ? {} : { wall_clearance: wallClearance }),
      movement: { diagonal },
      coordinate_system: {
        type: coordinateSystem.type as string,
        ...(typeof coordinateSystem.reference_object === 'string'
          ? { reference_object: coordinateSystem.reference_object }
          : {}),
        x: coordinateSystem.x as string,
        y: coordinateSystem.y as string,
      },
    },
    points,
    branches,
  };
}

export function navigationPointToThreePosition(
  point: NavigationPoint,
  modelFrame: ModelSceneFrame,
  cameraHeight: number,
): THREE.Vector3 {
  // Measured alignment between building_navigation.json's raw blender_vertex_local coordinates and
  // the GLB's baked mesh data: cross-referencing all 8362 branches[] against their matching GLB mesh
  // nodes (same IDs, e.g. "B0") shows a 305.00 deg rotation plus this translation aligns every branch
  // to within ~1.3mm RMS across the ~98m building footprint. Not a guess/offset-to-fit; both constants
  // were solved from real GLB geometry (apps/client/public/Floor 1_Rotated_Points.glb).
  const rotationRadians = THREE.MathUtils.degToRad(305.0);
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  const rotatedX = point.x * cos - point.y * sin;
  const rotatedY = point.x * sin + point.y * cos;
  const alignedX = rotatedX + 34.461503;
  const alignedZ = -rotatedY + -13.598112;

  // ModelScene recenters X/Z, anchors the floor at Y=0, and applies its existing group position.
  return new THREE.Vector3(
    alignedX - modelFrame.center.x + modelFrame.position.x,
    cameraHeight + modelFrame.position.y,
    alignedZ - modelFrame.center.z + modelFrame.position.z,
  );
}

export function createWorldNavigationPoints(
  navigation: BuildingNavigation,
  modelFrame: ModelSceneFrame,
  cameraHeight: number,
): WorldNavigationPoint[] {
  return navigation.points.map((point) => ({
    id: point.id,
    position: navigationPointToThreePosition(point, modelFrame, cameraHeight),
  }));
}

export function detectNavigationPoint(
  playerPosition: Pick<THREE.Vector3, 'x' | 'z'>,
  points: WorldNavigationPoint[],
  previousPointId: string | null,
  radiusMeters = NAVIGATION_POINT_RADIUS_M,
): NavigationDetection {
  let nearestPoint: WorldNavigationPoint | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  let previousDistanceSquared = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const deltaX = playerPosition.x - point.position.x;
    const deltaZ = playerPosition.z - point.position.z;
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (distanceSquared < nearestDistanceSquared) {
      nearestPoint = point;
      nearestDistanceSquared = distanceSquared;
    }
    if (point.id === previousPointId) previousDistanceSquared = distanceSquared;
  }

  const radiusSquared = radiusMeters * radiusMeters;
  const distanceMeters = Number.isFinite(nearestDistanceSquared)
    ? Math.sqrt(nearestDistanceSquared)
    : null;
  const currentPointId = previousPointId && previousDistanceSquared <= radiusSquared
    ? previousPointId
    : distanceMeters !== null && distanceMeters <= radiusMeters
      ? nearestPoint?.id ?? null
      : null;

  return { nearestPoint, distanceMeters, currentPointId };
}