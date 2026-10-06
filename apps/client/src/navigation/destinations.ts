import type { NavigationPoint } from './navigationData';

export type NavigableDestination = {
  id: string;
  name: string;
};

// Manually curated: add a destination here by JSON point id to make it selectable.
// Intermediate routing points (e.g. internal branch nodes) must not be added.
export const NAVIGABLE_DESTINATIONS: NavigableDestination[] = [
  { id: 'Entrance', name: 'Entrance' },
  { id: 'Student_Dep', name: 'Student Department' },
];

export function getValidDestinations(points: NavigationPoint[]): NavigableDestination[] {
  const pointIds = new Set(points.map((point) => point.id));
  return NAVIGABLE_DESTINATIONS.filter((destination) => pointIds.has(destination.id));
}