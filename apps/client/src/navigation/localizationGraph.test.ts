import { describe, expect, it } from 'vitest';
import { graphPointsWithinDistance, type NavigationGraph } from './graph';

describe('graphPointsWithinDistance', () => {
  it('uses branch distances, excluding disconnected and distant points even when nearby in space', () => {
    const graph: NavigationGraph = new Map([
      ['a', { point: { id: 'a', x: 0, y: 0 }, edges: [
        { from: 'a', to: 'b', distanceMeters: 3 },
      ] }],
      ['b', { point: { id: 'b', x: 2, y: 0 }, edges: [
        { from: 'b', to: 'a', distanceMeters: 3 }, { from: 'b', to: 'c', distanceMeters: 5 },
      ] }],
      ['c', { point: { id: 'c', x: 0, y: 1 }, edges: [] }],
      ['wall', { point: { id: 'wall', x: 0, y: 0.1 }, edges: [] }],
    ]);
    expect([...graphPointsWithinDistance(graph, 'a', 3)]).toEqual(['a', 'b']);
    expect([...graphPointsWithinDistance(graph, 'a', 8)]).toEqual(['a', 'b', 'c']);
    expect(graphPointsWithinDistance(graph, 'missing', 5).size).toBe(0);
  });
});
