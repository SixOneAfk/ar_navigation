import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    console.log('[GATEWAY] Starting bootstrap...');
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false,
    });
    console.log('[GATEWAY] AppModule created successfully');

    app.useBodyParser('json', { limit: '2mb' });

    app.enableCors({
      origin: ['http://localhost:5173'],
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      credentials: true,
    });
    console.log('[GATEWAY] CORS enabled');

    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`[GATEWAY] ✓ Server is running on port ${port}`);
  } catch (error) {
    console.error('[GATEWAY] ✗ Bootstrap failed:', error);
    process.exit(1);
  }
}
void bootstrap();
