import { Module } from '@nestjs/common';
import { CvModule } from './modules/cv/cv.module';
import { PositionModule } from './modules/position/position.module';
import { WifiModule } from './modules/wifi/wifi.module';

console.log('[GATEWAY:AppModule] Loading AppModule...');

@Module({
  imports: [PositionModule, CvModule, WifiModule],
  controllers: [],
  providers: [],
})
export class AppModule {
  constructor() {
    console.log('[GATEWAY:AppModule] ✓ AppModule fully initialized with PositionModule, CvModule, WifiModule');
  }
}
