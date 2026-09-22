import { Module } from '@nestjs/common';
import { CvController } from './cv.controller';
import { PositionModule } from '../position/position.module';

console.log('[CvModule] Loading...');

@Module({
  imports: [PositionModule],
  controllers: [CvController],
})
export class CvModule {
  constructor() {
    console.log('[CvModule] ✓ Initialized with CvController');
  }
}
