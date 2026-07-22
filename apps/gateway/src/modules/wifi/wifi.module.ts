import { Module } from '@nestjs/common';
import { WifiController } from './wifi.controller';

console.log('[WifiModule] Loading...');

@Module({
  controllers: [WifiController],
})
export class WifiModule {
  constructor() {
    console.log('[WifiModule] ✓ Initialized with WifiController');
  }
}
