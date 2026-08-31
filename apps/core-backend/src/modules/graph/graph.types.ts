export type GraphNode = {
  id: string;
  x: number;
  y: number;
  floor: number;
  tag?: string;
};

export type GraphEdge = {
  from: string;
  to: string;
  edgeType: 'corridor' | 'stairs' | 'elevator';
};

export type PathNodeDetail = GraphNode;

export type PathResponse = {
  path: string[];
  totalDistance: number;
  nodesDetail: PathNodeDetail[];
};

export type Neighbor = {
  to: string;
  weight: number;
};

export const FLOOR_HEIGHT_METERS = 4.0;
export const FLOOR_CHANGE_PENALTY = 8.0;

export const DEFAULT_NODES: GraphNode[] = [
  { id: 'N101', x: 0.0, y: 0.0, floor: 1, tag: 'ROOM_101' },
  { id: 'N102', x: 12.5, y: 0.0, floor: 1, tag: 'HALLWAY_CORNER_1' },
  { id: 'N103', x: 12.5, y: 15.0, floor: 1, tag: 'ROOM_102' },
  { id: 'N104', x: 12.5, y: 15.0, floor: 2, tag: 'STAIRWELL_FL2' },
  { id: 'N201', x: 0.0, y: 15.0, floor: 2, tag: 'ROOM_201' },
];

export const DEFAULT_EDGES: GraphEdge[] = [
  { from: 'N101', to: 'N102', edgeType: 'corridor' },
  { from: 'N102', to: 'N103', edgeType: 'corridor' },
  { from: 'N103', to: 'N104', edgeType: 'stairs' },
  { from: 'N104', to: 'N201', edgeType: 'corridor' },
];
