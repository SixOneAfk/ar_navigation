import * as THREE from 'three';

export const NAVIGATION_POINT_RADIUS_M = 0.75;

export type NavigationPoint = {
  id: string;
  row: number;
  column: number;
  x: number;
  y: number;
};

export type BuildingNavigation = {
  building: string;
  grid: {
    cell_size: number;
    margin: number;
    wall_clearance: number;
    movement: { diagonal: boolean };
    coordinate_system: { x: string; y: string };
  };
  points: NavigationPoint[];
};

export type ModelSceneFrame = {
  center: { x: number; y: number; z: number };
  floorHeight: number;
  position: { x: number; y: number; z: number };
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
  if (typeof value.building !== 'string' || value.building.length === 0) {
    throw new Error('Navigation data is missing a building name.');
  }

  const grid = value.grid;
  if (!isRecord(grid)) throw new Error('Navigation data is missing grid configuration.');
  const cellSize = requireFiniteNumber(grid.cell_size, 'grid.cell_size');
  const margin = requireFiniteNumber(grid.margin, 'grid.margin');
  const wallClearance = requireFiniteNumber(grid.wall_clearance, 'grid.wall_clearance');
  if (cellSize <= 0 || margin < 0 || wallClearance < 0) {
    throw new Error('Grid configuration requires cell_size > 0 and non-negative margin and wall_clearance.');
  }

  const movement = grid.movement;
  const coordinateSystem = grid.coordinate_system;
  if (!isRecord(movement) || typeof movement.diagonal !== 'boolean') {
    throw new Error('grid.movement.diagonal must be a boolean.');
  }
  if (
    !isRecord(coordinateSystem) ||
    typeof coordinateSystem.x !== 'string' ||
    typeof coordinateSystem.y !== 'string'
  ) {
    throw new Error('grid.coordinate_system must provide string x and y descriptions.');
  }
  if (coordinateSystem.x !== 'Blender World X' || coordinateSystem.y !== 'Blender World Y') {
    throw new Error('Only Blender World X/Y navigation coordinates are supported by the current GLB transform.');
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

    const row = requireFiniteNumber(pointValue.row, `${label}.row`);
    const column = requireFiniteNumber(pointValue.column, `${label}.column`);
    if (!Number.isInteger(row) || !Number.isInteger(column)) {
      throw new Error(`${label}.row and ${label}.column must be integers.`);
    }

    return {
      id: pointValue.id,
      row,
      column,
      x: requireFiniteNumber(pointValue.x, `${label}.x`),
      y: requireFiniteNumber(pointValue.y, `${label}.y`),
    };
  });

  return {
    building: value.building,
    grid: {
      cell_size: cellSize,
      margin,
      wall_clearance: wallClearance,
      movement: { diagonal: movement.diagonal },
      coordinate_system: { x: coordinateSystem.x, y: coordinateSystem.y },
    },
    points,
  };
}

export function navigationPointToThreePosition(
  point: NavigationPoint,
  modelFrame: ModelSceneFrame,
  cameraHeight: number,
): THREE.Vector3 {
  // Blender's glTF export maps Blender X to Three X and Blender Y to negative Three Z.
  // ModelScene recenters X/Z, anchors the floor at Y=0, and applies its existing group position.
  return new THREE.Vector3(
    point.x - modelFrame.center.x + modelFrame.position.x,
    cameraHeight + modelFrame.position.y,
    -point.y - modelFrame.center.z + modelFrame.position.z,
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