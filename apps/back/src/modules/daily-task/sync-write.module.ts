import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncDayPolicyEntity } from './sync-day-policy.entity';
import { SyncWriteService } from './sync-write.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SyncDayPolicyEntity])],
  providers: [SyncWriteService],
  exports: [SyncWriteService],
})
export class SyncWriteModule {}
