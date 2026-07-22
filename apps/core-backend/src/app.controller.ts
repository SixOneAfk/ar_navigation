import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {
    console.log('[CORE-BACKEND:AppController] Initialized');
  }

  @Get()
  getHello(): string {
    try {
      console.log('[CORE-BACKEND:AppController] GET / called');
      const result = this.appService.getHello();
      console.log('[CORE-BACKEND:AppController] ✓ Response:', result);
      return result;
    } catch (error) {
      console.error('[CORE-BACKEND:AppController] ✗ Error in GET /:', error);
      throw error;
    }
  }
}
