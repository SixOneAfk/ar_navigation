import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {
    console.log('[GATEWAY:AppController] Initialized');
  }

  @Get()
  getHello(): string {
    try {
      console.log('[GATEWAY:AppController] GET / called');
      const result = this.appService.getHello();
      console.log('[GATEWAY:AppController] ✓ Response:', result);
      return result;
    } catch (error) {
      console.error('[GATEWAY:AppController] ✗ Error in GET /:', error);
      throw error;
    }
  }
}
