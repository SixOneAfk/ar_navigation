export type BeaconRssi = {
  bssid: string;
  rssi: number;
};

export type CvMarker = {
  markerId: string;
  confidence: number;
};

export type EstimatePositionRequest = {
  deviceId: string;
  stepCount: number;
  headingDeg: number;
  wifi: BeaconRssi[];
  cvMarkers: CvMarker[];
  timestamp: string;
};

export type EstimatePositionResponse = {
  x: number;
  y: number;
  z: number;
  confidence: number;
  source: string;
};

export type PositioningGrpcService = {
  estimatePosition(data: EstimatePositionRequest): Promise<EstimatePositionResponse>;
};
