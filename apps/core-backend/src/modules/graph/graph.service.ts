import { Injectable } from '@nestjs/common';

type GraphNode = {
  id: string;
  x: number;
  y: number;
  floor: number;
  tag?: string;
};

type GraphEdge = {
  from: string;
  to: string;
  edgeType: 'corridor' | 'stairs' | 'elevator';
};

type PathNodeDetail = GraphNode;

type PathResponse = {
  path: string[];
  totalDistance: number;
  nodesDetail: PathNodeDetail[];
};

type Neighbor = {
  to: string;
  weight: number;
};

const FLOOR_HEIGHT_METERS = 4.0;
const FLOOR_CHANGE_PENALTY = 8.0;

const DEFAULT_NODES: GraphNode[] = [
  { id: 'N101', x: 0.0, y: 0.0, floor: 1, tag: 'ROOM_101' },
  { id: 'N102', x: 12.5, y: 0.0, floor: 1, tag: 'HALLWAY_CORNER_1' },
  { id: 'N103', x: 12.5, y: 15.0, floor: 1, tag: 'ROOM_102' },
  { id: 'N104', x: 12.5, y: 15.0, floor: 2, tag: 'STAIRWELL_FL2' },
  { id: 'N201', x: 0.0, y: 15.0, floor: 2, tag: 'ROOM_201' },
];

const DEFAULT_EDGES: GraphEdge[] = [
  { from: 'N101', to: 'N102', edgeType: 'corridor' },
  { from: 'N102', to: 'N103', edgeType: 'corridor' },
  { from: 'N103', to: 'N104', edgeType: 'stairs' },
  { from: 'N104', to: 'N201', edgeType: 'corridor' },
];

@Injectable()
export class GraphService {
  private readonly nodeIndex: Map<string, GraphNode>;
  private readonly adjacency: Map<string, Neighbor[]>;

  constructor() {
    console.log('[CORE-BACKEND:GraphService] Initialized');
    this.nodeIndex = this.createNodeIndex(DEFAULT_NODES);
    this.adjacency = this.createAdjacencyList(DEFAULT_EDGES);
  }

  getGraphSchema(): { nodeSchema: Record<string, unknown>; edgeSchema: Record<string, unknown> } {
    return {
      nodeSchema: {
        type: 'object',
        required: ['id', 'x', 'y', 'floor'],
        properties: {
          id: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          floor: { type: 'integer' },
          tag: { type: 'string' },
        },
      },
      edgeSchema: {
        type: 'object',
        required: ['from', 'to', 'edgeType'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          edgeType: { type: 'string', enum: ['corridor', 'stairs', 'elevator'] },
        },
      },
    };
  }

  computeRoute(startNode: string, targetNode: string): PathResponse {
    console.log('[CORE-BACKEND:GraphService] computeRoute() called with:', { startNode, targetNode });
    try {
      if (!this.nodeIndex.has(startNode) || !this.nodeIndex.has(targetNode)) {
        const missing = !this.nodeIndex.has(startNode) ? startNode : targetNode;
        throw new Error(`Node ${missing} not found in graph`);
      }

      const path = this.aStar(startNode, targetNode);
      const totalDistance = this.calculatePathWeight(path);
      const nodesDetail = path
        .map((id) => this.nodeIndex.get(id))
        .filter((node): node is GraphNode => node !== undefined);

      const result: PathResponse = {
        path,
        totalDistance: Number(totalDistance.toFixed(2)),
        nodesDetail,
      };

      console.log('[CORE-BACKEND:GraphService] ✓ Route computed:', {
        hopCount: path.length,
        totalDistance: result.totalDistance,
      });

      return result;
    } catch (error) {
      console.error('[CORE-BACKEND:GraphService] ✗ Error in computeRoute:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  private createNodeIndex(nodes: GraphNode[]): Map<string, GraphNode> {
    const index = new Map<string, GraphNode>();
    for (const node of nodes) {
      index.set(node.id, node);
    }
    return index;
  }

  private createAdjacencyList(edges: GraphEdge[]): Map<string, Neighbor[]> {
    const adjacency = new Map<string, Neighbor[]>();

    for (const nodeId of this.nodeIndex.keys()) {
      adjacency.set(nodeId, []);
    }

    for (const edge of edges) {
      const fromNode = this.nodeIndex.get(edge.from);
      const toNode = this.nodeIndex.get(edge.to);

      if (!fromNode || !toNode) {
        continue;
      }

      const weight = this.calculateEdgeWeight(fromNode, toNode, edge.edgeType);
      adjacency.get(edge.from)?.push({ to: edge.to, weight });
      adjacency.get(edge.to)?.push({ to: edge.from, weight });
    }

    return adjacency;
  }

  private calculateEdgeWeight(fromNode: GraphNode, toNode: GraphNode, edgeType: GraphEdge['edgeType']): number {
    const dx = fromNode.x - toNode.x;
    const dy = fromNode.y - toNode.y;
    const dz = (fromNode.floor - toNode.floor) * FLOOR_HEIGHT_METERS;
    let weight = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (fromNode.floor !== toNode.floor || edgeType !== 'corridor') {
      weight += FLOOR_CHANGE_PENALTY;
    }

    return weight;
  }

  private heuristic(nodeId: string, targetId: string): number {
    const node = this.nodeIndex.get(nodeId);
    const target = this.nodeIndex.get(targetId);

    if (!node || !target) {
      return Number.POSITIVE_INFINITY;
    }

    const dx = node.x - target.x;
    const dy = node.y - target.y;
    const dz = (node.floor - target.floor) * FLOOR_HEIGHT_METERS;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private aStar(startNode: string, targetNode: string): string[] {
    const openSet = new Set<string>([startNode]);
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    for (const nodeId of this.nodeIndex.keys()) {
      gScore.set(nodeId, Number.POSITIVE_INFINITY);
      fScore.set(nodeId, Number.POSITIVE_INFINITY);
    }

    gScore.set(startNode, 0);
    fScore.set(startNode, this.heuristic(startNode, targetNode));

    while (openSet.size > 0) {
      let current = '';
      let bestScore = Number.POSITIVE_INFINITY;

      for (const nodeId of openSet) {
        const score = fScore.get(nodeId) ?? Number.POSITIVE_INFINITY;
        if (score < bestScore) {
          bestScore = score;
          current = nodeId;
        }
      }

      if (!current) {
        break;
      }

      if (current === targetNode) {
        return this.reconstructPath(cameFrom, current);
      }

      openSet.delete(current);
      const neighbors = this.adjacency.get(current) ?? [];

      for (const neighbor of neighbors) {
        const tentativeG = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + neighbor.weight;

        if (tentativeG < (gScore.get(neighbor.to) ?? Number.POSITIVE_INFINITY)) {
          cameFrom.set(neighbor.to, current);
          gScore.set(neighbor.to, tentativeG);
          fScore.set(neighbor.to, tentativeG + this.heuristic(neighbor.to, targetNode));
          openSet.add(neighbor.to);
        }
      }
    }

    throw new Error(`No valid path exists between ${startNode} and ${targetNode}`);
  }

  private reconstructPath(cameFrom: Map<string, string>, current: string): string[] {
    const path = [current];
    let cursor = current;

    while (cameFrom.has(cursor)) {
      cursor = cameFrom.get(cursor) as string;
      path.push(cursor);
    }

    return path.reverse();
  }

  private calculatePathWeight(path: string[]): number {
    let total = 0;

    for (let index = 0; index < path.length - 1; index += 1) {
      const from = path[index] as string;
      const to = path[index + 1] as string;
      const weight = (this.adjacency.get(from) ?? []).find((n) => n.to === to)?.weight;

      if (weight === undefined) {
        throw new Error(`Broken edge in path between ${from} and ${to}`);
      }

      total += weight;
    }

    return total;
  }
}
