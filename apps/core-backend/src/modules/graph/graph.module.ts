import { Module } from '@nestjs/common';
import { GraphService } from './graph.service';
import { GraphController } from './graph.controller';
import { DatabaseModule } from '../database/database.module';

console.log('[GraphModule] Loading...');

@Module({
  imports: [DatabaseModule],
  controllers: [GraphController],
  providers: [GraphService],
  exports: [GraphService],
})
export class GraphModule {
  constructor() {
    console.log('[GraphModule] ✓ Initialized with GraphService');
  }
}
