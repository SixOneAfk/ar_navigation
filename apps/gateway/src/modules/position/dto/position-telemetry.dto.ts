export class PositionTelemetryDto {
  deviceId!: string;
  stepCount!: number;
  headingDeg!: number;
  estimatedPose?: { x: number; y: number; z: number; floor?: number };
  poseConfidence?: number;
  frameId?: string;
  sequenceNumber?: number;
  velocityHintMps?: number;
  devicePitchDeg?: number;
  deviceRollDeg?: number;
  accelerationMagnitude?: number;
  wifi?: { bssid: string; rssi: number }[];
  cvMarkers?: { markerId: string; confidence: number }[];
  timestamp!: string;
}
