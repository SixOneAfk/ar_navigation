import { Module } from '@nestjs/common';
import { GraphModule } from './modules/graph/graph.module';
import { PositioningModule } from './modules/positioning/positioning.module';
import { TrilaterationModule } from './modules/trilateration/trilateration.module';
import { DatabaseModule } from './modules/database/database.module';

console.log('[CORE-BACKEND:AppModule] Loading AppModule...');

@Module({
  imports: [DatabaseModule, GraphModule, TrilaterationModule, PositioningModule],
  controllers: [],
  providers: [],
})
export class AppModule {
  constructor() {
    console.log('[CORE-BACKEND:AppModule] ✓ AppModule fully initialized with DatabaseModule, GraphModule, TrilaterationModule, PositioningModule');
  }
}
