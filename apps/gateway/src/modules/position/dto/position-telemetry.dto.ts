export class PositionTelemetryDto {
  deviceId!: string;
  stepCount!: number;
  headingDeg!: number;
  accelerationMagnitude?: number;
  wifi?: { bssid: string; rssi: number }[];
  cvMarkers?: { markerId: string; confidence: number }[];
  timestamp!: string;
}
