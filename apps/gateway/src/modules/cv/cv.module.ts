import { Module } from '@nestjs/common';
import { CvController } from './cv.controller';

console.log('[CvModule] Loading...');

@Module({
  controllers: [CvController],
})
export class CvModule {
  constructor() {
    console.log('[CvModule] ✓ Initialized with CvController');
  }
}
