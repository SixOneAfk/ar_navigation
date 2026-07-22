import { Module } from '@nestjs/common';
import { TrilaterationService } from './trilateration.service';

console.log('[TrilaterationModule] Loading...');

@Module({
  providers: [TrilaterationService],
  exports: [TrilaterationService],
})
export class TrilaterationModule {
  constructor() {
    console.log('[TrilaterationModule] ✓ Initialized with TrilaterationService');
  }
}
