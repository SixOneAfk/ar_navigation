import { Module } from '@nestjs/common';
import { GraphService } from './graph.service';

console.log('[GraphModule] Loading...');

@Module({
  providers: [GraphService],
  exports: [GraphService],
})
export class GraphModule {
  constructor() {
    console.log('[GraphModule] ✓ Initialized with GraphService');
  }
}
