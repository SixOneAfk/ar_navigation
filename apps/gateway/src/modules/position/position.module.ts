import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { resolve } from 'node:path';
import { PositionController } from './position.controller';
import { PositioningGrpcClient } from './grpc/positioning-grpc.client';

console.log('[PositionModule] Loading...');

const positioningProtoPath =
  process.env.POSITIONING_PROTO_PATH ??
  resolve(__dirname, '../../../../../proto/positioning.proto');

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'POSITIONING_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'positioning',
          protoPath: positioningProtoPath,
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
