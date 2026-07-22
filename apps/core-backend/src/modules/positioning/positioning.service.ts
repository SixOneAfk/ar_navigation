import { Injectable } from '@nestjs/common';

type BeaconRssi = {
  bssid: string;
  rssi: number;
};

type CvMarker = {
  markerId: string;
  confidence: number;
};

type EstimatePositionRequest = {
  deviceId: string;
  stepCount: number;
  headingDeg: number;
  wifi: BeaconRssi[];
  cvMarkers: CvMarker[];
  timestamp: string;
};

type EstimatePositionResponse = {
  x: number;
  y: number;
  z: number;
  confidence: number;
  source: string;
};

@Injectable()
export class PositioningService {
  constructor() {
    console.log('[CORE-BACKEND:PositioningService] Initialized');
  }

  fuseSensors() {
    console.log('[CORE-BACKEND:PositioningService] fuseSensors() called');
    // Placeholder for sensor fusion of PDR, Wi-Fi and CV inputs.
    return { status: 'todo', module: 'positioning' };
  }

  estimatePosition(payload: EstimatePositionRequest): EstimatePositionResponse {
    console.log('[CORE-BACKEND:PositioningService] estimatePosition() called with:', {
      deviceId: payload.deviceId,
      stepCount: payload.stepCount,
      headingDeg: payload.headingDeg,
      wifiBeaconsCount: payload.wifi?.length ?? 0,
      cvMarkersCount: payload.cvMarkers?.length ?? 0,
      timestamp: payload.timestamp,
    });

    try {
      // Validate input
      if (!payload.deviceId) {
        throw new Error('deviceId is required');
      }
      if (typeof payload.stepCount !== 'number') {
        throw new Error('stepCount must be a number');
      }
      if (typeof payload.headingDeg !== 'number') {
        throw new Error('headingDeg must be a number');
      }

      console.log('[CORE-BACKEND:PositioningService] Input validation passed');

      const headingRad = (payload.headingDeg * Math.PI) / 180;
      console.log('[CORE-BACKEND:PositioningService] Converted heading:', {
        headingDeg: payload.headingDeg,
        headingRad: headingRad,
      });

      const distance = Math.max(payload.stepCount, 0) * 0.7;
      console.log('[CORE-BACKEND:PositioningService] Calculated distance:', {
        stepCount: payload.stepCount,
        stepsToMeters: 0.7,
        totalDistance: distance,
      });

      const result = {
        x: Number((Math.cos(headingRad) * distance).toFixed(3)),
        y: 0,
        z: Number((Math.sin(headingRad) * distance).toFixed(3)),
        confidence: 0.45,
        source: 'core-backend.stub.positioning',
      };

      console.log('[CORE-BACKEND:PositioningService] ✓ Position estimate calculated:', {
        x: result.x,
        y: result.y,
        z: result.z,
        confidence: result.confidence,
        source: result.source,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('[CORE-BACKEND:PositioningService] ✗ CRITICAL: Error in estimatePosition:', {
        errorMessage: errorMsg,
        errorStack: errorStack,
        deviceId: payload.deviceId,
        timestamp: payload.timestamp,
        processedAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}
