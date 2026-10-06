export type GraphNode = {
  id: string;
  x: number;
  y: number;
  row: number;
  column: number;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  distance: number;
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
