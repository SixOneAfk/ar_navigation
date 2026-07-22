import { Body, Controller, Post } from '@nestjs/common';
import { WifiRssiDto } from './dto/wifi-rssi.dto';

@Controller('api/v1/wifi')
export class WifiController {
  constructor() {
    console.log('[GATEWAY:WifiController] Initialized');
  }

  @Post('rssi')
  ingestRssi(@Body() dto: WifiRssiDto) {
    console.log('[GATEWAY:WifiController] POST /rssi called with payload:', JSON.stringify(dto));
    try {
      const response = {
        status: 'accepted',
        source: 'wifi',
        receivedAt: new Date().toISOString(),
        payload: dto,
      };
      console.log('[GATEWAY:WifiController] ✓ Returning response:', JSON.stringify(response));
      return response;
    } catch (error) {
      console.error('[GATEWAY:WifiController] ✗ Error in POST /rssi:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
