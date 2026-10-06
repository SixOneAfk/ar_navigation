import type { ModelSceneFrame } from '../navigation/navigationData';

export type Vector3Value = {
  x: number;
  y: number;
  z: number;
};

export type CameraPoseSnapshot = {
  position: Vector3Value;
  forward: Vector3Value;
  right: Vector3Value;
};

export type WallReference = {
  id: string;
  axis: 'x' | 'z';
  coordinate: number;
  bounds: {
    min: Vector3Value;
    max: Vector3Value;
  };
  width: number;
  height: number;
  surface_area: number;
};

export type WallReferenceCatalog = {
  source_model: string;
  coordinate_system: 'gltf_scene_y_up';
  wall_count: number;
  walls: WallReference[];
};

export type SelectedWallReference = {
  id: string;
  corners: [
    Vector3Value,
    Vector3Value,
    Vector3Value,
    Vector3Value,
  ];
  confidence: number;
  distanceMeters: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function parsePoint(value: unknown, label: string): Vector3Value {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return {
    x: finiteNumber(value.x, `${label}.x`),
    y: finiteNumber(value.y, `${label}.y`),
    z: finiteNumber(value.z, `${label}.z`),
  };
}

export function parseWallReferenceCatalog(
  value: unknown,
): WallReferenceCatalog {
  if (!isRecord(value)) {
    throw new Error('Wall reference catalog must be an object.');
  }
  if (
    typeof value.source_model !== 'string'
    || value.coordinate_system !== 'gltf_scene_y_up'
    || !Array.isArray(value.walls)
  ) {
    throw new Error('Wall reference catalog metadata is invalid.');
  }

  const walls = value.walls.map((candidate, index): WallReference => {
    const label = `walls[${index}]`;
    if (!isRecord(candidate) || !isRecord(candidate.bounds)) {
      throw new Error(`${label} is invalid.`);
    }
    if (
      typeof candidate.id !== 'string'
      || (candidate.axis !== 'x' && candidate.axis !== 'z')
    ) {
      throw new Error(`${label} requires an id and supported axis.`);
    }

    return {
      id: candidate.id,
      axis: candidate.axis,
      coordinate: finiteNumber(
        candidate.coordinate,
        `${label}.coordinate`,
      ),
      bounds: {
        min: parsePoint(candidate.bounds.min, `${label}.bounds.min`),
        max: parsePoint(candidate.bounds.max, `${label}.bounds.max`),
      },
      width: finiteNumber(candidate.width, `${label}.width`),
      height: finiteNumber(candidate.height, `${label}.height`),
      surface_area: finiteNumber(
        candidate.surface_area,
        `${label}.surface_area`,
      ),
    };
  });

  if (walls.length === 0) {
    throw new Error('Wall reference catalog is empty.');
  }
  if (
    typeof value.wall_count !== 'number'
    || value.wall_count !== walls.length
  ) {
    throw new Error('Wall reference count does not match the catalog.');
  }

  return {
    source_model: value.source_model,
    coordinate_system: value.coordinate_system,
    wall_count: walls.length,
    walls,
  };
}

function normalizeHorizontal(vector: Vector3Value): Vector3Value | null {
  const length = Math.hypot(vector.x, vector.z);
  if (length < 1e-6) return null;
  return {
    x: vector.x / length,
    y: 0,
    z: vector.z / length,
  };
}

function transformPoint(
  point: Vector3Value,
  frame: ModelSceneFrame,
): Vector3Value {
  return {
    x: point.x - frame.center.x + frame.position.x,
    y: point.y - frame.floorHeight + frame.position.y,
    z: point.z - frame.center.z + frame.position.z,
  };
}

function wallEndpoints(
  wall: WallReference,
  frame: ModelSceneFrame,
): {
  firstBottom: Vector3Value;
  secondBottom: Vector3Value;
  firstTop: Vector3Value;
  secondTop: Vector3Value;
  center: Vector3Value;
  normal: Vector3Value;
} {
  const minimum = wall.bounds.min;
  const maximum = wall.bounds.max;
  const firstRaw = wall.axis === 'x'
    ? { x: wall.coordinate, y: minimum.y, z: minimum.z }
    : { x: minimum.x, y: minimum.y, z: wall.coordinate };
  const secondRaw = wall.axis === 'x'
    ? { x: wall.coordinate, y: minimum.y, z: maximum.z }
    : { x: maximum.x, y: minimum.y, z: wall.coordinate };
  const firstTopRaw = { ...firstRaw, y: maximum.y };
  const secondTopRaw = { ...secondRaw, y: maximum.y };
  const firstBottom = transformPoint(firstRaw, frame);
  const secondBottom = transformPoint(secondRaw, frame);
  const firstTop = transformPoint(firstTopRaw, frame);
  const secondTop = transformPoint(secondTopRaw, frame);

  return {
    firstBottom,
    secondBottom,
    firstTop,
    secondTop,
    center: {
      x: (firstBottom.x + secondBottom.x) / 2,
      y: (firstBottom.y + firstTop.y) / 2,
      z: (firstBottom.z + secondBottom.z) / 2,
    },
    normal: wall.axis === 'x'
      ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 0, z: 1 },
  };
}

export function selectWallReference(
  walls: WallReference[],
  frame: ModelSceneFrame,
  pose: CameraPoseSnapshot,
): SelectedWallReference | null {
  const forward = normalizeHorizontal(pose.forward);
  const right = normalizeHorizontal(pose.right);
  if (!forward || !right) return null;

  let best:
    | {
      wall: WallReference;
      endpoints: ReturnType<typeof wallEndpoints>;
      score: number;
      distanceMeters: number;
    }
    | null = null;

  for (const wall of walls) {
    const endpoints = wallEndpoints(wall, frame);
    const toCenter = {
      x: endpoints.center.x - pose.position.x,
      y: 0,
      z: endpoints.center.z - pose.position.z,
    };
    const direction = normalizeHorizontal(toCenter);
    if (!direction) continue;

    const distanceMeters = Math.hypot(toCenter.x, toCenter.z);
    if (distanceMeters < 0.45 || distanceMeters > 18) continue;

    const viewAlignment =
      (direction.x * forward.x) + (direction.z * forward.z);
    if (viewAlignment < 0.2) continue;

    const facing = Math.abs(
      (direction.x * endpoints.normal.x)
      + (direction.z * endpoints.normal.z),
    );
    if (facing < 0.22) continue;

    const angularSize = Math.min(
      (wall.width * facing) / Math.max(distanceMeters, 0.5),
      1,
    );
    const distanceScore = 1 - Math.min(distanceMeters / 18, 1);
    const score =
      (0.48 * viewAlignment)
      + (0.24 * facing)
      + (0.18 * angularSize)
      + (0.10 * distanceScore);

    if (!best || score > best.score) {
      best = {
        wall,
        endpoints,
        score,
        distanceMeters,
      };
    }
  }

  if (!best) return null;

  const {
    firstBottom,
    secondBottom,
    firstTop,
    secondTop,
  } = best.endpoints;
  const sideDirection = {
    x: secondBottom.x - firstBottom.x,
    y: 0,
    z: secondBottom.z - firstBottom.z,
  };
  const secondIsRight = (
    (sideDirection.x * right.x) + (sideDirection.z * right.z)
  ) > 0;
  const topLeft = secondIsRight ? firstTop : secondTop;
  const topRight = secondIsRight ? secondTop : firstTop;
  const bottomRight = secondIsRight ? secondBottom : firstBottom;
  const bottomLeft = secondIsRight ? firstBottom : secondBottom;
  const confidence = Math.max(
    0,
    Math.min(1, (best.score - 0.3) / 0.65),
  );

  return {
    id: best.wall.id,
    corners: [topLeft, topRight, bottomRight, bottomLeft],
    confidence,
    distanceMeters: best.distanceMeters,
  };
}
