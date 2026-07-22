import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  constructor() {
    console.log('[GATEWAY:AppService] Initialized');
  }

  getHello(): string {
    console.log('[GATEWAY:AppService] getHello() called');
    try {
      const message = 'Hello World!';
      console.log('[GATEWAY:AppService] ✓ Returning:', message);
      return message;
    } catch (error) {
      console.error('[GATEWAY:AppService] ✗ Error:', error);
      throw error;
    }
  }
}
