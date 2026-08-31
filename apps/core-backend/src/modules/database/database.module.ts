import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {
  constructor() {
    console.log('[CORE-BACKEND:DatabaseModule] Initialized in fallback mode (no Prisma)');
  }
}
