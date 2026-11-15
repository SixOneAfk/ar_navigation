import type { NavigationPoint } from './navigationData';

export type NavigableDestination = {
  id: string;
  name: string;
};

function readableLocationName(name: string) {
  return name.replace(/_/g, ' ').replace(/\bDep\b/g, 'Department');
}

export function getValidDestinations(
  points: NavigationPoint[],
  namedLocations: Record<string, string> = {},
): NavigableDestination[] {
  const pointIds = new Set(points.map((point) => point.id));
  return Object.entries(namedLocations)
    .filter(([, pointId]) => pointIds.has(pointId))
    .map(([name, pointId]) => ({ id: pointId, name: readableLocationName(name) }));
}