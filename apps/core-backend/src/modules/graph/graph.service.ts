import { Injectable } from '@nestjs/common';

@Injectable()
export class GraphService {
  constructor() {
    console.log('[CORE-BACKEND:GraphService] Initialized');
  }

  computeRoute() {
    console.log('[CORE-BACKEND:GraphService] computeRoute() called');
    try {
      const result = { status: 'todo', module: 'graph' };
      console.log('[CORE-BACKEND:GraphService] ✓ Result:', JSON.stringify(result));
      return result;
    } catch (error) {
      console.error('[CORE-BACKEND:GraphService] ✗ Error in computeRoute:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
