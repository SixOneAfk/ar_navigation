import { Body, Controller, Post } from '@nestjs/common';
import { CvScanDto } from './dto/cv-scan.dto';

@Controller('api/v1/cv')
export class CvController {
  private readonly cvServiceBaseUrl = process.env.CV_SERVICE_URL ?? 'http://localhost:8000';

  constructor() {
    console.log('[GATEWAY:CvController] Initialized');
  }

  @Post('scan')
  async scan(@Body() dto: CvScanDto) {
    console.log('[GATEWAY:CvController] POST /scan called with payload:', JSON.stringify(dto));

    const normalized = {
      session_id: dto.session_id ?? dto.deviceId ?? 'unknown-session',
      timestamp: dto.timestamp ?? Date.now(),
      estimated_position: dto.estimated_position ?? { x: 0, y: 0, floor: 1 },
      image_payload: dto.image_payload ?? dto.frameBase64,
      device_heading: dto.device_heading,
    };

    if (!normalized.image_payload) {
      throw new Error('image_payload or frameBase64 is required');
    }

    try {
      const endpoint = `${this.cvServiceBaseUrl}/api/v1/recalibrate`;
      const cvResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized),
      });

      if (!cvResponse.ok) {
        const responseText = await cvResponse.text();
        throw new Error(`CV service request failed: HTTP ${cvResponse.status} ${responseText}`);
      }

      const recalibration = (await cvResponse.json()) as Record<string, unknown>;
      const result = {
        status: 'accepted',
        source: 'cv-forwarder',
        receivedAt: new Date().toISOString(),
        payload: normalized,
        recalibration,
      };
      console.log('[GATEWAY:CvController] ✓ Returning response:', JSON.stringify(result));
      return result;
    } catch (error) {
      console.error('[GATEWAY:CvController] ✗ Error in POST /scan:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
