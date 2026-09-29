import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import * as fs from 'fs';
import { resolve } from 'node:path';

async function bootstrap() {
  try {
    console.log('[CORE-BACKEND] Starting bootstrap...');
    const app = await NestFactory.create(AppModule);
    console.log('[CORE-BACKEND] AppModule created successfully');

    const protoPath =
      process.env.POSITIONING_PROTO_PATH ??
      resolve(__dirname, '../../../proto/positioning.proto');
    const grpcUrl = process.env.POSITIONING_GRPC_URL ?? '0.0.0.0:50051';

    console.log(`[CORE-BACKEND] Checking proto file at: ${protoPath}`);
    if (fs.existsSync(protoPath)) {
      console.log('[CORE-BACKEND] ✓ Proto file exists');
    } else {
      console.error(`[CORE-BACKEND] ✗ Proto file NOT FOUND: ${protoPath}`);
    }

    console.log(`[CORE-BACKEND] Connecting gRPC microservice on ${grpcUrl}`);
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: 'positioning',
        protoPath: protoPath,
        url: grpcUrl,
      },
    });
    console.log('[CORE-BACKEND] gRPC microservice connected');

    await app.startAllMicroservices();
    console.log('[CORE-BACKEND] ✓ All microservices started');

    const httpPort = process.env.PORT ?? 3001;
    await app.listen(httpPort);
    console.log(`[CORE-BACKEND] ✓ HTTP server is running on port ${httpPort}`);
  } catch (error) {
    console.error('[CORE-BACKEND] ✗ Bootstrap failed:', error);
    process.exit(1);
  }
}
void bootstrap();
