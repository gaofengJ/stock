import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrendFactorEntity } from './trend.entity';
import { TrendService } from './trend.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([TrendFactorEntity])],
  providers: [TrendService],
  exports: [TrendService],
})
export class TrendModule {}
