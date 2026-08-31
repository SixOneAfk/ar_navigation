import { Injectable } from '@nestjs/common';
import { DEFAULT_EDGES, DEFAULT_NODES, GraphEdge, GraphNode } from '../graph/graph.types';

@Injectable()
export class DatabaseService {
  async getGraphData(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    console.warn('[CORE-BACKEND:DatabaseService] Prisma disabled, using default graph data');
    return {
      nodes: DEFAULT_NODES,
      edges: DEFAULT_EDGES,
    };
  }
}
