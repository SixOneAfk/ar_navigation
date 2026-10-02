import { GraphService } from './graph.service';
import { DatabaseService } from '../database/database.service';
import { GraphEdge, GraphNode } from './graph.types';

const nodes: GraphNode[] = [
  { id: 'P0', x: 0, y: 0, row: 0, column: 0 },
  { id: 'P1', x: 1, y: 0, row: 0, column: 1 },
  { id: 'P2', x: 1, y: 1, row: 1, column: 1 },
];

const edges: GraphEdge[] = [
  { id: 'B0', from: 'P0', to: 'P1', distance: 3 },
  { id: 'B1', from: 'P1', to: 'P2', distance: 1 },
  { id: 'B2', from: 'P0', to: 'P2', distance: 10 },
];

describe('GraphService', () => {
  let service: GraphService;

  beforeEach(() => {
    const databaseService: Pick<DatabaseService, 'getGraphData'> = {
      getGraphData: jest.fn().mockResolvedValue({
        nodes,
        edges,
      }),
    };

    service = new GraphService(databaseService);
  });

  it('returns graph schemas for nodes and edges', () => {
    const schema = service.getGraphSchema();
    expect(schema.nodeSchema).toBeDefined();
    expect(schema.edgeSchema).toBeDefined();
  });

  it('uses the JSON branch distance when selecting a weighted path', async () => {
    const route = await service.computeRoute('P0', 'P2');
    expect(route.path).toEqual(['P0', 'P1', 'P2']);
    expect(route.totalDistance).toBe(4);
    expect(route.nodesDetail[0]?.id).toBe('P0');
    expect(route.nodesDetail[route.nodesDetail.length - 1]?.id).toBe('P2');
  });

  it('loads the Blender points and branch distances from the shared JSON asset', async () => {
    const graphData = await new DatabaseService().getGraphData();

    expect(graphData.nodes).toHaveLength(4650);
    expect(graphData.edges).toHaveLength(8362);
    expect(graphData.nodes[0]).toMatchObject({ id: 'P0', x: -36.2585, y: -39.4197 });
    expect(graphData.edges[0]).toEqual({ id: 'B0', from: 'P0', to: 'P1', distance: 1 });
  });

  it('throws when node does not exist', async () => {
    await expect(service.computeRoute('MISSING', 'P2')).rejects.toThrow(
      'Node MISSING not found in graph',
    );
  });
});
