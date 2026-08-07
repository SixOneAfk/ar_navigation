import { Module } from '@nestjs/common';
import { GraphService } from './graph.service';
import { GraphController } from './graph.controller';

console.log('[GraphModule] Loading...');

@Module({
  controllers: [GraphController],
  providers: [GraphService],
  exports: [GraphService],
})
export class GraphModule {
  constructor() {
    console.log('[GraphModule] ✓ Initialized with GraphService');
  }
}
