import { Body, Controller, Post } from '@nestjs/common';
import { PositionTelemetryDto } from './dto/position-telemetry.dto';
import { PositioningGrpcClient } from './grpc/positioning-grpc.client';

type RouteRequestDto = {
  startNode: string;
  targetNode: string;
};

@Controller('api/v1/position')
export class PositionController {
  private readonly coreBackendBaseUrl = process.env.CORE_BACKEND_URL ?? 'http://localhost:3001';

  constructor(private readonly positioningGrpcClient: PositioningGrpcClient) {
    console.log('[GATEWAY:PositionController] Initialized with PositioningGrpcClient');
  }

  @Post('route')
  async getRoute(@Body() dto: RouteRequestDto) {
    console.log('[GATEWAY:PositionController] POST /route called with payload:', dto);

    if (!dto?.startNode || !dto?.targetNode) {
      throw new Error('startNode and targetNode are required');
    }

    const endpoint = `${this.coreBackendBaseUrl}/api/v1/route`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Core backend route request failed: HTTP ${response.status} ${bodyText}`);
    }

    const route = (await response.json()) as Record<string, unknown>;
    return {
      status: 'accepted',
      source: 'route-forwarder',
      receivedAt: new Date().toISOString(),
      route,
    };
  }

  @Post('telemetry')
  async ingestTelemetry(@Body() dto: PositionTelemetryDto) {
    console.log('[GATEWAY:PositionController] POST /telemetry called with payload:', {
      deviceId: dto.deviceId,
      stepCount: dto.stepCount,
      headingDeg: dto.headingDeg,
      wifiBeaconsCount: dto.wifi?.length ?? 0,
      cvMarkersCount: dto.cvMarkers?.length ?? 0,
      timestamp: dto.timestamp,
    });

    try {
      console.log('[GATEWAY:PositionController] Calling gRPC estimatePosition method...');
      const estimate = await this.positioningGrpcClient.estimatePosition({
        deviceId: dto.deviceId,
        stepCount: dto.stepCount,
        headingDeg: dto.headingDeg,
        wifi: dto.wifi ?? [],
        cvMarkers: dto.cvMarkers ?? [],
        timestamp: dto.timestamp,
      });

      console.log('[GATEWAY:PositionController] ✓ Got estimate from gRPC:', {
        x: estimate.x,
        y: estimate.y,
        z: estimate.z,
        confidence: estimate.confidence,
        source: estimate.source,
      });

      const response = {
        status: 'accepted',
        source: 'position',
        receivedAt: new Date().toISOString(),
        payload: dto,
        estimate,
      };

      console.log('[GATEWAY:PositionController] ✓ Returning complete response with estimate');
      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('[GATEWAY:PositionController] ✗ CRITICAL: Error processing telemetry:', {
        errorMessage: errorMsg,
        errorStack: errorStack,
        deviceId: dto.deviceId,
        endpoint: 'POST /api/v1/position/telemetry',
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
}
