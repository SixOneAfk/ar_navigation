import { GraphService } from './graph.service';

describe('GraphService', () => {
  let service: GraphService;

  beforeEach(() => {
    service = new GraphService();
  });

  it('returns graph schemas for nodes and edges', () => {
    const schema = service.getGraphSchema();
    expect(schema.nodeSchema).toBeDefined();
    expect(schema.edgeSchema).toBeDefined();
  });

  it('computes a multi-floor route using A*', () => {
    const route = service.computeRoute('N101', 'N201');
    expect(route.path).toEqual(['N101', 'N102', 'N103', 'N104', 'N201']);
    expect(route.totalDistance).toBeGreaterThan(0);
    expect(route.nodesDetail[0]?.id).toBe('N101');
    expect(route.nodesDetail[route.nodesDetail.length - 1]?.id).toBe('N201');
  });

  it('throws when node does not exist', () => {
    expect(() => service.computeRoute('MISSING', 'N201')).toThrow('Node MISSING not found in graph');
  });
});