export type BeaconRssi = {
  bssid: string;
  rssi: number;
};

export type CvMarker = {
  markerId: string;
  confidence: number;
  x?: number;
  y?: number;
  z?: number;
  floor?: number;
};

export type EstimatePositionRequest = {
  deviceId: string;
  stepCount: number;
  headingDeg: number;
  wifi: BeaconRssi[];
  cvMarkers: CvMarker[];
  timestamp: string;
  estimatedPose?: {
    x: number;
    y: number;
    z: number;
    floor?: number;
  };
  poseConfidence?: number;
  frameId?: string;
  sequenceNumber?: number;
  velocityHintMps?: number;
  devicePitchDeg?: number;
  deviceRollDeg?: number;
};

export type EstimatePositionResponse = {
  x: number;
  y: number;
  z: number;
  confidence: number;
  source: string;
  correctionMode?: string;
  correctionApplied?: boolean;
  decisionReason?: string;
  candidateDistanceM?: number;
};

export type PositioningGrpcService = {
  estimatePosition(data: EstimatePositionRequest): Promise<EstimatePositionResponse>;
};
