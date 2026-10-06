import type { BuildingNavigation, NavigationPoint } from './navigationData';

export const ALLOW_DIAGONAL_NAVIGATION = false;
// The JSON stores each walkable connection once (no reciprocal branch records exist).
// Building walking routes are traversable in both directions, so each valid branch is mirrored here.
export const BRANCHES_ARE_BIDIRECTIONAL = true;

export type NavigationEdge = {
  from: string;
  to: string;
  distanceMeters: number;
};

export type NavigationDirection = NavigationEdge & {
  direction: CardinalDirection;
};

export type CardinalDirection = 'FORWARD' | 'BACKWARD' | 'LEFT' | 'RIGHT';

export type NavigationInstruction = {
  direction: CardinalDirection;
  distanceMeters: number;
  from: string;
  to: string;
  pointIds: string[];
};

export type NavigationPath = {
  start: string;
  destination: string;
  points: string[];
  distanceMeters: number;
  directions: NavigationDirection[];
  instructions: NavigationInstruction[];
};

type GraphNode = {
  point: NavigationPoint;
  edges: NavigationEdge[];
};

export type NavigationGraph = Map<string, GraphNode>;

export type NavigationGraphStats = {
  points: number;
  branches: number;
  validBranches: number;
  invalidBranches: number;
  diagonalBranchesExcluded: number;
  graphEdges: number;
};

export type DiagonalBranchHandler = (branch: BuildingNavigation['branches'][number]) => void;

class MinHeap<T> {
  private values: Array<{ priority: number; value: T }> = [];

  get size() {
    return this.values.length;
  }

  push(value: T, priority: number) {
    this.values.push({ value, priority });
    this.bubbleUp(this.values.length - 1);
  }

  pop(): T | undefined {
    if (this.values.length === 0) return undefined;
    const first = this.values[0];
    const last = this.values.pop();
    if (last && this.values.length > 0) {
      this.values[0] = last;
      this.sinkDown(0);
    }
    return first.value;
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].priority <= this.values[index].priority) break;
      [this.values[parent], this.values[index]] = [this.values[index], this.values[parent]];
      index = parent;
    }
  }

  private sinkDown(index: number) {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.values.length && this.values[left].priority < this.values[smallest].priority) smallest = left;
      if (right < this.values.length && this.values[right].priority < this.values[smallest].priority) smallest = right;
      if (smallest === index) break;
      [this.values[index], this.values[smallest]] = [this.values[smallest], this.values[index]];
      index = smallest;
    }
  }
}

function directionForEdge(from: NavigationPoint, to: NavigationPoint): CardinalDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const tolerance = 1e-5;
  if (Math.abs(dx) > tolerance && Math.abs(dy) > tolerance) {
    throw new Error(`Diagonal graph edge detected between ${from.id} and ${to.id}.`);
  }
  if (Math.abs(dx) > tolerance) return dx > 0 ? 'RIGHT' : 'LEFT';
  return dy >= 0 ? 'FORWARD' : 'BACKWARD';
}

function collapseDirections(directions: NavigationDirection[]): NavigationInstruction[] {
  const instructions: NavigationInstruction[] = [];
  for (const direction of directions) {
    const previous = instructions[instructions.length - 1];
    if (previous?.direction === direction.direction) {
      previous.distanceMeters += direction.distanceMeters;
      previous.to = direction.to;
      previous.pointIds.push(direction.to);
    } else {
      instructions.push({
        direction: direction.direction,
        distanceMeters: direction.distanceMeters,
        from: direction.from,
        to: direction.to,
        pointIds: [direction.from, direction.to],
      });
    }
  }
  return instructions;
}

export function buildNavigationGraph(
  navigation: BuildingNavigation,
  onDiagonalBranchRejected?: DiagonalBranchHandler,
): NavigationGraph {
  const graph: NavigationGraph = new Map();

  for (const point of navigation.points) {
    graph.set(point.id, { point, edges: [] });
  }

  for (const branch of navigation.branches) {
    const from = graph.get(branch.from);
    const to = graph.get(branch.to);
    if (!from || !to) continue;
    const dx = to.point.x - from.point.x;
    const dy = to.point.y - from.point.y;
    if (!ALLOW_DIAGONAL_NAVIGATION && Math.abs(dx) > 1e-5 && Math.abs(dy) > 1e-5) {
      onDiagonalBranchRejected?.(branch);
      continue;
    }

    from.edges.push({ from: branch.from, to: branch.to, distanceMeters: branch.distance });
    if (BRANCHES_ARE_BIDIRECTIONAL) {
      to.edges.push({ from: branch.to, to: branch.from, distanceMeters: branch.distance });
    }
  }

  return graph;
}

export function findShortestPath(graph: NavigationGraph, start: string, destination: string): NavigationPath {
  if (!graph.has(start)) throw new Error(`Navigation point not found: ${start}`);
  if (!graph.has(destination)) throw new Error(`Navigation point not found: ${destination}`);

  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const queue = new MinHeap<string>();
  queue.push(start, 0);

  while (queue.size > 0) {
    const current = queue.pop();
    if (!current) break;
    const currentDistance = distances.get(current);
    if (currentDistance === undefined) continue;
    if (current === destination) break;

    for (const edge of graph.get(current)?.edges ?? []) {
      const nextDistance = currentDistance + edge.distanceMeters;
      if (nextDistance >= (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) continue;
      distances.set(edge.to, nextDistance);
      previous.set(edge.to, current);
      queue.push(edge.to, nextDistance);
    }
  }

  const distanceMeters = distances.get(destination);
  if (distanceMeters === undefined) throw new Error(`No route exists between ${start} and ${destination}.`);

  const points = [destination];
  while (points[0] !== start) {
    const prior = previous.get(points[0]);
    if (!prior) throw new Error(`No route exists between ${start} and ${destination}.`);
    points.unshift(prior);
  }

  const directions: NavigationDirection[] = points.slice(0, -1).map((pointId, index) => {
    const from = graph.get(pointId)?.point;
    const to = graph.get(points[index + 1])?.point;
    const edge = graph.get(pointId)?.edges.find((candidate) => candidate.to === points[index + 1]);
    if (!from || !to || !edge) throw new Error('Route contains an unknown navigation edge.');
    return {
      from: from.id,
      to: to.id,
      distanceMeters: edge.distanceMeters,
      direction: directionForEdge(from, to),
    };
  });

  return { start, destination, points, distanceMeters, directions, instructions: collapseDirections(directions) };
}

export function getGraphEdgeCount(graph: NavigationGraph) {
  let total = 0;
  for (const node of graph.values()) total += node.edges.length;
  return total / 2;
}

export function directionRelativeToHeading(
  from: NavigationPoint,
  to: NavigationPoint,
  headingDegrees: number,
): CardinalDirection {
  // atan2(east, north) yields compass bearings: north 0, east 90, south 180, west 270.
  const angle = Math.atan2(to.x - from.x, to.y - from.y) * 180 / Math.PI;
  const relativeAngle = ((angle - headingDegrees + 540) % 360) - 180;
  if (relativeAngle >= -45 && relativeAngle < 45) return 'FORWARD';
  if (relativeAngle >= 45 && relativeAngle < 135) return 'RIGHT';
  if (relativeAngle >= -135 && relativeAngle < -45) return 'LEFT';
  return 'BACKWARD';
}

export function getNavigationGraphStats(
  navigation: BuildingNavigation,
  onDiagonalBranchRejected?: DiagonalBranchHandler,
): NavigationGraphStats {
  let diagonalBranchesExcluded = 0;
  const graph = buildNavigationGraph(navigation, (branch) => {
    diagonalBranchesExcluded += 1;
    onDiagonalBranchRejected?.(branch);
  });
  const validBranches = navigation.branches.length;
  return {
    points: navigation.points.length,
    branches: validBranches + (navigation.invalidBranches?.length ?? 0),
    validBranches,
    invalidBranches: navigation.invalidBranches?.length ?? 0,
    diagonalBranchesExcluded,
    graphEdges: getGraphEdgeCount(graph),
  };
}