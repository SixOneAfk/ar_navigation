import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  EstimatePositionRequest,
  EstimatePositionResponse,
  PositioningGrpcService,
} from './positioning-grpc.types';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PositioningGrpcClient implements OnModuleInit {
  private svc!: PositioningGrpcService;

  constructor(@Inject('POSITIONING_PACKAGE') private readonly client: ClientGrpc) {
    console.log('[PositioningGrpcClient] Constructor called - gRPC client injected');
  }

  onModuleInit() {
    try {
      console.log('[PositioningGrpcClient] onModuleInit starting - resolving PositioningService from gRPC package...');
      this.svc = this.client.getService<PositioningGrpcService>('PositioningService');
      console.log('[PositioningGrpcClient] ✓ PositioningService successfully obtained from gRPC package');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('[PositioningGrpcClient] ✗ CRITICAL: Failed to get PositioningService from gRPC package:', {
        errorMessage: errorMsg,
        errorStack: errorStack,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async estimatePosition(data: EstimatePositionRequest): Promise<EstimatePositionResponse> {
    console.log('[PositioningGrpcClient] estimatePosition() called with:', {
      deviceId: data.deviceId,
      stepCount: data.stepCount,
      headingDeg: data.headingDeg,
      wifiCount: data.wifi?.length ?? 0,
      cvMarkersCount: data.cvMarkers?.length ?? 0,
      timestamp: data.timestamp,
    });

    try {
      if (!this.svc) {
        const error = new Error('PositioningService not initialized - gRPC connection may have failed');
        console.error('[PositioningGrpcClient] ✗ ERROR: Service not initialized:', error.message);
        throw error;
      }

      console.log('[PositioningGrpcClient] Calling gRPC estimatePosition method...');
      const response$ = this.svc.estimatePosition(data);
      const result = await firstValueFrom(response$ as unknown as import('rxjs').Observable<EstimatePositionResponse>);
      
      console.log('[PositioningGrpcClient] ✓ gRPC response received successfully:', {
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
      console.error('[PositioningGrpcClient] ✗ CRITICAL: gRPC estimatePosition failed:', {
        errorMessage: errorMsg,
        errorStack: errorStack,
        deviceId: data.deviceId,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
}
