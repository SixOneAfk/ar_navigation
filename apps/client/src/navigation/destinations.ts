import type { NavigationPoint } from './navigationData';

export type NavigableDestination = {
  id: string;
  name: string;
};

// Add named locations here. IDs must match points in building_navigation.json.
export const NAVIGABLE_DESTINATIONS: NavigableDestination[] = [
  { id: 'Entrance', name: 'Entrance' },
  { id: 'Student_apartment', name: 'Student apartment' },
];

export function getValidDestinations(points: NavigationPoint[]) {
  const pointIds = new Set(points.map((point) => point.id));
  return NAVIGABLE_DESTINATIONS.filter((destination) => pointIds.has(destination.id));
}