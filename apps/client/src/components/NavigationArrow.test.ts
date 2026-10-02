import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getRouteProgress } from './NavigationArrow';
import type { NavigationPath } from '../navigation/graph';
import type { WorldNavigationPoint } from '../navigation/navigationData';

const points: WorldNavigationPoint[] = [
  { id: 'Entrance', position: new THREE.Vector3(0, 1.6, 0) },
  { id: 'A', position: new THREE.Vector3(10, 1.6, 0) },
  { id: 'B', position: new THREE.Vector3(10, 1.6, -10) },
  { id: 'Student_Dep', position: new THREE.Vector3(20, 1.6, -10) },
];

const route: NavigationPath = {
  start: 'Entrance',
  destination: 'Student_Dep',
  points: ['Entrance', 'A', 'B', 'Student_Dep'],
  distanceMeters: 30,
  directions: [
    { from: 'Entrance', to: 'A', distanceMeters: 10, direction: 'RIGHT' },
    { from: 'A', to: 'B', distanceMeters: 10, direction: 'FORWARD' },
    { from: 'B', to: 'Student_Dep', distanceMeters: 10, direction: 'RIGHT' },
  ],
  instructions: [],
};

describe('NavigationArrow live remaining distance', () => {
  it('decreases from the player position along the active route, including after turns', () => {
    const nearEntrance = getRouteProgress(route, new THREE.Vector3(2, 1.6, 0), new Map(points.map((p) => [p.id, p.position])));
    const midwayFirstSegment = getRouteProgress(route, new THREE.Vector3(6, 1.6, 0), new Map(points.map((p) => [p.id, p.position])));
    const midwaySecondSegment = getRouteProgress(route, new THREE.Vector3(10, 1.6, -5), new Map(points.map((p) => [p.id, p.position])));
    const midwayFinalSegment = getRouteProgress(route, new THREE.Vector3(15, 1.6, -10), new Map(points.map((p) => [p.id, p.position])));

    expect(nearEntrance.remainingDistance).toBeCloseTo(28);
    expect(midwayFirstSegment.remainingDistance).toBeCloseTo(24);
    expect(midwaySecondSegment.remainingDistance).toBeCloseTo(15);
    expect(midwayFinalSegment.remainingDistance).toBeCloseTo(5);
    expect(midwayFirstSegment.remainingDistance).toBeLessThan(nearEntrance.remainingDistance);
    expect(midwaySecondSegment.remainingDistance).toBeLessThan(midwayFirstSegment.remainingDistance);
    expect(midwayFinalSegment.remainingDistance).toBeLessThan(midwaySecondSegment.remainingDistance);
    expect(nearEntrance.nextPointId).toBe('A');
    expect(midwaySecondSegment.nextPointId).toBe('B');
    expect(midwayFinalSegment.nextPointId).toBe('Student_Dep');
  });

  it('reports approximately zero at the destination without forcing an arrival state', () => {
    const atDestination = getRouteProgress(
      route,
      new THREE.Vector3(20, 1.6, -10),
      new Map(points.map((point) => [point.id, point.position])),
    );

    expect(atDestination.remainingDistance).toBeCloseTo(0);
  });
});