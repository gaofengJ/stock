import { Global, Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MarketSyncService } from './market-sync.service';
import { MarketBreadthService } from './market-breadth.service';
import { SectorService } from './sector.service';

@Global()
@Module({
  controllers: [MarketController],
  providers: [
    MarketService,
    MarketSyncService,
    MarketBreadthService,
    SectorService,
  ],
  exports: [MarketSyncService, MarketBreadthService, SectorService],
})
export class MarketModule {}
