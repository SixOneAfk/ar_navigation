import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { CvScanDto } from './dto/cv-scan.dto';

type RecalibrationResult = {
  recalibrated: boolean;
  detected_text: string | null;
  confidence: number;
  matched_node_id: string | null;
  candidate_count: number;
};

@Controller('api/v1/cv')
export class CvController {
  private readonly cvServiceBaseUrl =
    process.env.CV_SERVICE_URL ?? 'http://localhost:8000';

  constructor() {
    console.log('[GATEWAY:CvController] Initialized');
  }

  @Post('scan')
  async scan(@Body() dto: CvScanDto) {
    const normalized = {
      session_id: dto.session_id ?? dto.deviceId ?? 'unknown-session',
      timestamp: dto.timestamp ?? Date.now(),
      estimated_position: dto.estimated_position ?? { x: 0, y: 0, floor: 1 },
      image_payload: dto.image_payload ?? dto.frameBase64,
      device_heading: dto.device_heading,
    };

    if (!normalized.image_payload) {
      throw new BadRequestException('image_payload or frameBase64 is required');
    }

    console.log(
      `[GATEWAY:CvController] Forwarding CV frame for session ${normalized.session_id} (${normalized.image_payload.length} base64 characters)`,
    );

    try {
      const endpoint = `${this.cvServiceBaseUrl}/api/v1/recalibrate`;
      const cvResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized),
      });

      if (!cvResponse.ok) {
        const responseText = await cvResponse.text();
        throw new BadGatewayException(
          `CV service returned HTTP ${cvResponse.status}: ${responseText.slice(0, 300)}`,
        );
      }

      const recalibration = (await cvResponse.json()) as RecalibrationResult;
      const result = {
        status: 'accepted',
        source: 'cv-forwarder',
        receivedAt: new Date().toISOString(),
        recalibration,
      };
      console.log(
        `[GATEWAY:CvController] CV frame processed for session ${normalized.session_id}; recalibrated=${recalibration.recalibrated}`,
      );
      return result;
    } catch (error) {
      console.error('[GATEWAY:CvController] ✗ Error in POST /scan:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException('CV service is unavailable');
    }
  }
}
