import { describe, expect, it } from 'vitest';
import { buildNavigationGraph, directionRelativeToHeading, findShortestPath, getNavigationGraphStats } from './graph';
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
      coordinate_system: {
        type: 'building_local',
        reference_object: 'Plane',
        x: 'Building local X',
        y: 'Building local Y',
      },
    },
    points,
    branches,
  };
}

const point = (id: string, row: number, column: number, x = column, y = row) => ({ id, row, column, x, y });
let nextBranchId = 0;
const branch = (from: string, to: string, distance = 1) => ({ id: `B${nextBranchId++}`, from, to, distance });

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

  it('reports and rejects every diagonal JSON branch without creating replacement edges', () => {
    const diagonalBranch = branch('A', 'C', Math.sqrt(2));
    const navigation = fixture(
      [point('A', 0, 0, 0, 0), point('B', 0, 1, 1, 0), point('C', 1, 1, 1, 1)],
      true,
      [branch('A', 'B'), branch('B', 'C'), diagonalBranch],
    );
    const rejected: string[] = [];
    const stats = getNavigationGraphStats(navigation, (edge) => rejected.push(edge.id));
    const graph = buildNavigationGraph(navigation);
    const route = findShortestPath(graph, 'A', 'C');

    expect(rejected).toEqual([diagonalBranch.id]);
    expect(stats.diagonalBranchesExcluded).toBe(1);
    expect(stats.graphEdges).toBe(2);
    expect(route.points).toEqual(['A', 'B', 'C']);
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

  it('uses building-local compass bearings with north at zero and east at 90 degrees', () => {
    const origin = point('origin', 0, 0, 0, 0);
    expect(directionRelativeToHeading(origin, point('east', 0, 1, 1, 0), 0)).toBe('RIGHT');
    expect(directionRelativeToHeading(origin, point('west', 0, -1, -1, 0), 0)).toBe('LEFT');
    expect(directionRelativeToHeading(origin, point('north', 1, 0, 0, 1), 0)).toBe('FORWARD');
    expect(directionRelativeToHeading(origin, point('south', -1, 0, 0, -1), 0)).toBe('BACKWARD');
    expect(directionRelativeToHeading(origin, point('east', 0, 1, 1, 0), 90)).toBe('FORWARD');
  });

  it('routes between real points from the shipped navigation asset', () => {
    const navigation = parseBuildingNavigation(navigationJson);
    const graph = buildNavigationGraph(navigation);
    const stats = getNavigationGraphStats(navigation);
    const firstBranch = navigation.branches[0];
    const pointById = new Map(navigation.points.map((point) => [point.id, point]));
    const route = findShortestPath(graph, firstBranch.from, firstBranch.to);

    expect(graph.size).toBe(123426);
    expect(stats.branches).toBe(8362);
    expect(stats.invalidBranches).toBe(0);
    expect(stats.diagonalBranchesExcluded).toBe(0);
    expect(stats.graphEdges).toBe(8362);
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.directions.every((direction) => navigation.branches.some(
      (branch) => (branch.from === direction.from && branch.to === direction.to)
        || (branch.from === direction.to && branch.to === direction.from),
    ))).toBe(true);
    for (let index = 0; index < route.points.length - 1; index += 1) {
      const from = pointById.get(route.points[index]);
      const to = pointById.get(route.points[index + 1]);
      expect(from).toBeDefined();
      expect(to).toBeDefined();
      const changesX = Math.abs((to?.x ?? 0) - (from?.x ?? 0)) > 1e-5;
      const changesY = Math.abs((to?.y ?? 0) - (from?.y ?? 0)) > 1e-5;
      expect(changesX !== changesY).toBe(true);
    }
  });

  it('routes Entrance to Student_Dep and back using only branches[] connections', () => {
    const navigation = parseBuildingNavigation(navigationJson);
    expect(navigation.points.some((p) => p.id === 'Entrance')).toBe(true);
    expect(navigation.points.some((p) => p.id === 'Student_Dep')).toBe(true);

    const graph = buildNavigationGraph(navigation);
    const isValidBranchEdge = (from: string, to: string) => navigation.branches.some(
      (branch) => (branch.from === from && branch.to === to) || (branch.from === to && branch.to === from),
    );

    const toStudentDep = findShortestPath(graph, 'Entrance', 'Student_Dep');
    expect(toStudentDep.points[0]).toBe('Entrance');
    expect(toStudentDep.points[toStudentDep.points.length - 1]).toBe('Student_Dep');
    expect(toStudentDep.points.length).toBeGreaterThan(2);
    for (let index = 0; index < toStudentDep.points.length - 1; index += 1) {
      expect(isValidBranchEdge(toStudentDep.points[index], toStudentDep.points[index + 1])).toBe(true);
    }

    const toEntrance = findShortestPath(graph, 'Student_Dep', 'Entrance');
    expect(toEntrance.points[0]).toBe('Student_Dep');
    expect(toEntrance.points[toEntrance.points.length - 1]).toBe('Entrance');
    for (let index = 0; index < toEntrance.points.length - 1; index += 1) {
      expect(isValidBranchEdge(toEntrance.points[index], toEntrance.points[index + 1])).toBe(true);
    }
  });

});