import { DataSource } from 'typeorm';
import { Module } from '@nestjs/common';
import { BasicModule } from '@/modules/basic/basic.module';
import { StrategyModule } from '@/modules/strategy/strategy.module';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { NotebookController } from './notebook.controller';
import { NotebookService } from './notebook.service';

@Module({
  imports: [BasicModule, StrategyModule],
  controllers: [ReviewController, NotebookController],
  providers: [
    ReviewService,
    {
      provide: NotebookService,
      inject: [DataSource, ReviewService],
      useFactory: (db: DataSource, reviews: ReviewService) =>
        new NotebookService(db, reviews),
    },
  ],
})
export class ReviewModule {}
