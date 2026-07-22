import { Body, Controller, Post } from '@nestjs/common';
import { CvScanDto } from './dto/cv-scan.dto';

@Controller('api/v1/cv')
export class CvController {
  constructor() {
    console.log('[GATEWAY:CvController] Initialized');
  }

  @Post('scan')
  scan(@Body() dto: CvScanDto) {
    console.log('[GATEWAY:CvController] POST /scan called with payload:', JSON.stringify(dto));
    try {
      const response = {
        status: 'accepted',
        source: 'cv',
        receivedAt: new Date().toISOString(),
        payload: dto,
      };
      console.log('[GATEWAY:CvController] ✓ Returning response:', JSON.stringify(response));
      return response;
    } catch (error) {
      console.error('[GATEWAY:CvController] ✗ Error in POST /scan:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
