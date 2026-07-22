import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PositioningService } from './positioning.service';

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

@Controller()
export class PositioningGrpcController {
  constructor(private readonly positioningService: PositioningService) {
    console.log('[CORE-BACKEND:PositioningGrpcController] Initialized with PositioningService');
  }

  // Matches proto: package positioning; service PositioningService; rpc EstimatePosition
  @GrpcMethod('PositioningService', 'EstimatePosition')
  estimatePosition(data: EstimatePositionRequest): EstimatePositionResponse {
    console.log('[CORE-BACKEND:PositioningGrpcController] gRPC EstimatePosition method called with:', {
      deviceId: data.deviceId,
      stepCount: data.stepCount,
      headingDeg: data.headingDeg,
      wifiBeaconsCount: data.wifi?.length ?? 0,
      cvMarkersCount: data.cvMarkers?.length ?? 0,
      timestamp: data.timestamp,
    });

    try {
      console.log('[CORE-BACKEND:PositioningGrpcController] Delegating to PositioningService...');
      const result = this.positioningService.estimatePosition(data);
      
      console.log('[CORE-BACKEND:PositioningGrpcController] ✓ gRPC method completed successfully, returning result');
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('[CORE-BACKEND:PositioningGrpcController] ✗ CRITICAL: gRPC EstimatePosition failed:', {
        errorMessage: errorMsg,
        errorStack: errorStack,
        deviceId: data?.deviceId,
        method: 'PositioningService.EstimatePosition',
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
}
