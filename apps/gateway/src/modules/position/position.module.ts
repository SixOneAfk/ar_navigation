import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PositionController } from './position.controller';
import { PositioningGrpcClient } from './grpc/positioning-grpc.client';

console.log('[PositionModule] Loading...');

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'POSITIONING_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'positioning',
          protoPath: '/home/nik/Desktop/ar_nav/proto/positioning.proto',
          url: process.env.CORE_BACKEND_GRPC_URL ?? 'localhost:50051',
        },
      },
    ]),
  ],
  controllers: [PositionController],
  providers: [PositioningGrpcClient],
})
export class PositionModule {
  constructor() {
    console.log('[PositionModule] ✓ Initialized');
  }
}
