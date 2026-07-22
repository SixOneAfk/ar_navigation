import { Module } from '@nestjs/common';
import { PositioningService } from './positioning.service';
import { PositioningGrpcController } from './positioning.grpc.controller';

console.log('[PositioningModule] Loading...');

@Module({
  controllers: [PositioningGrpcController],
  providers: [PositioningService],
  exports: [PositioningService],
})
export class PositioningModule {
  constructor() {
    console.log('[PositioningModule] ✓ Initialized');
  }
}
