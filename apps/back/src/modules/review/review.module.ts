import { Module } from '@nestjs/common';
import { BasicModule } from '@/modules/basic/basic.module';
import { StrategyModule } from '@/modules/strategy/strategy.module';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [BasicModule, StrategyModule],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
