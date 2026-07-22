import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  constructor() {
    console.log('[CORE-BACKEND:AppService] Initialized');
  }

  getHello(): string {
    console.log('[CORE-BACKEND:AppService] getHello() called');
    try {
      const message = 'Hello World!';
      console.log('[CORE-BACKEND:AppService] ✓ Returning:', message);
      return message;
    } catch (error) {
      console.error('[CORE-BACKEND:AppService] ✗ Error:', error);
      throw error;
    }
  }
}
