import { Injectable } from '@nestjs/common';
import { DailyService as SourceDailyService } from '@/modules/source/daily/daily.service';
import { DailyQueryDto } from '@/modules/source/daily/daily.dto';
import { AsyncTtlCache } from '@/modules/analysis/async-ttl-cache';

@Injectable()
export class DailyService {
  private readonly listCache = new AsyncTtlCache(10000);

  constructor(private dailyService: SourceDailyService) {}

  /**
   * 每日数据
   * @param date
   */
  async daily(dto: DailyQueryDto) {
    return this.listCache.getOrCreate(JSON.stringify(dto), () =>
      this.dailyService.list(dto),
    );
  }
}
