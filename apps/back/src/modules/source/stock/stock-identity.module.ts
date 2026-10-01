import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockHistoryEntity } from './stock-history.entity';
import { StockIdentityService } from './stock-identity.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([StockHistoryEntity])],
  providers: [StockIdentityService],
  exports: [StockIdentityService],
})
export class StockIdentityModule {}
