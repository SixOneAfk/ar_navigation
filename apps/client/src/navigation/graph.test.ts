import { describe, expect, it } from 'vitest';
import { buildNavigationGraph, findShortestPath, getNavigationGraphStats } from './graph';
import { parseBuildingNavigation, type BuildingNavigation } from './navigationData';
import navigationJson from '../../public/building_navigation.json?raw';

function fixture(
  points: BuildingNavigation['points'],
  diagonal = false,
  branches: BuildingNavigation['branches'] = [],
): BuildingNavigation {
  return {
    building: 'test',
    grid: {
      cell_size: 1,
      margin: 5,
      wall_clearance: 0.2,
      movement: { diagonal },
      coordinate_system: { x: 'Blender World X', y: 'Blender World Y' },
    },
    points,
    branches,
  };
}

const point = (id: string, row: number, column: number, x = column, y = row) => ({ id, row, column, x, y });
const branch = (from: string, to: string, distance = 1) => ({ from, to, distance });

describe('navigation graph', () => {
  it('returns a zero-length route when start equals destination', () => {
    const graph = buildNavigationGraph(fixture([point('A', 0, 0)]));
    expect(findShortestPath(graph, 'A', 'A')).toMatchObject({ points: ['A'], distanceMeters: 0, directions: [] });
  });

  it('uses the shortest weighted route instead of the first route found', () => {
    const graph = buildNavigationGraph(fixture([
      point('A', 0, 0), point('B', 0, 1), point('C', 1, 0), point('D', 1, 1), point('E', 2, 1),
    ], false, [branch('A', 'B'), branch('A', 'C', 5), branch('B', 'D'), branch('C', 'D'), branch('D', 'E')]));
    const route = findShortestPath(graph, 'A', 'E');
    expect(route.points).toEqual(['A', 'B', 'D', 'E']);
    expect(route.distanceMeters).toBe(3);
  });

  it('uses cardinal edges even when the JSON enables diagonal movement', () => {
    const graph = buildNavigationGraph(fixture([
      point('A', 0, 0), point('side-row', 0, 1), point('side-column', 1, 0), point('B', 1, 1),
    ], true, [branch('A', 'side-row'), branch('side-row', 'B'), branch('A', 'side-column'), branch('side-column', 'B')]));
    const route = findShortestPath(graph, 'A', 'B');
    expect(route.distanceMeters).toBe(2);
    expect(route.directions.every((direction) => ['FORWARD', 'BACKWARD', 'LEFT', 'RIGHT'].includes(direction.direction))).toBe(true);
  });

  it('does not connect across a missing grid point or cut a diagonal corner', () => {
    const graph = buildNavigationGraph(fixture([point('A', 0, 0), point('B', 1, 1)], true, [branch('A', 'B', Math.sqrt(2))]));
    expect(() => findShortestPath(graph, 'A', 'B')).toThrow('No route exists');
  });

  it('collapses consecutive segments with the same cardinal direction', () => {
    const graph = buildNavigationGraph(fixture([
      point('A', 0, 0), point('B', 0, 1), point('C', 0, 2), point('D', 0, 3),
    ], false, [branch('A', 'B'), branch('B', 'C'), branch('C', 'D')]));
    const route = findShortestPath(graph, 'A', 'D');
    expect(route.instructions).toEqual([{
      direction: 'RIGHT',
      distanceMeters: 3,
      from: 'A',
      to: 'D',
      pointIds: ['A', 'B', 'C', 'D'],
    }]);
  });

  it('creates separate grouped instructions for a turn', () => {
    const graph = buildNavigationGraph(fixture([
      point('A', 0, 0), point('B', 0, 1), point('C', 1, 1),
    ], false, [branch('A', 'B'), branch('B', 'C')]));
    const route = findShortestPath(graph, 'A', 'C');
    expect(route.instructions.map((instruction) => instruction.direction)).toEqual(['RIGHT', 'FORWARD']);
    expect(route.instructions.map((instruction) => instruction.distanceMeters)).toEqual([1, 1]);
  });

  it('rejects invalid points and disconnected destinations', () => {
    const graph = buildNavigationGraph(fixture([point('A', 0, 0), point('B', 3, 3)]));
    expect(() => findShortestPath(graph, 'missing', 'B')).toThrow('not found');
    expect(() => findShortestPath(graph, 'A', 'B')).toThrow('No route exists');
  });

  it('routes between real points from the shipped navigation asset', () => {
    const navigation = parseBuildingNavigation(navigationJson);
    const graph = buildNavigationGraph(navigation);
    const stats = getNavigationGraphStats(navigation);
    const route = findShortestPath(graph, 'P0', 'P2');

    expect(graph.size).toBe(3431);
    expect(stats.branches).toBe(11549);
    expect(stats.invalidBranches).toBe(0);
    expect(route.points).toEqual(['P0', 'P1', 'P2']);
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.directions.every((direction) => navigation.branches.some(
      (branch) => branch.from === direction.from && branch.to === direction.to,
    ))).toBe(true);
  });

  it('routes from Entrance to the configured named destination through valid branches', () => {
    const navigation = parseBuildingNavigation(navigationJson);
    const route = findShortestPath(buildNavigationGraph(navigation), 'Entrance', 'Student_apartment');

    expect(route.points[0]).toBe('Entrance');
    expect(route.points[route.points.length - 1]).toBe('Student_apartment');
    expect(route.points.some((pointId) => /^P\d+$/.test(pointId))).toBe(true);
    expect(route.directions.every((direction) => navigation.branches.some(
      (branch) => (branch.from === direction.from && branch.to === direction.to)
        || (branch.from === direction.to && branch.to === direction.from),
    ))).toBe(true);
  });
});