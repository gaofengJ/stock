import { Global, Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MarketSyncService } from './market-sync.service';

@Global()
@Module({
  controllers: [MarketController],
  providers: [MarketService, MarketSyncService],
  exports: [MarketSyncService],
})
export class MarketModule {}
