import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsightService } from '../../strategy/insight.service';
import {
  StockInsightEntity,
  ThsHotEntity,
} from '../../strategy/insight.entity';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MarketSyncService } from './market-sync.service';
import { MarketBreadthService } from './market-breadth.service';
import { SectorService } from './sector.service';
import { MarketResearchService } from './market-research.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([StockInsightEntity, ThsHotEntity])],
  controllers: [MarketController],
  providers: [
    MarketService,
    MarketSyncService,
    MarketBreadthService,
    SectorService,
    MarketResearchService,
    InsightService,
  ],
  exports: [
    MarketSyncService,
    MarketBreadthService,
    SectorService,
    InsightService,
  ],
})
export class MarketModule {}
