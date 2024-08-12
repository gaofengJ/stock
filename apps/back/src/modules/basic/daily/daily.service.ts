import { Injectable, Logger } from '@nestjs/common';
import { DailyService as SourceDailyService } from '@/modules/source/daily/daily.service';
import { DailyQueryDto } from '@/modules/source/daily/daily.dto';

@Injectable()
export class DailyService {
  private logger = new Logger(DailyService.name);

  constructor(private dailyService: SourceDailyService) {}

  /**
   * 每日数据
   * @param date
   */
  async daily(dto: DailyQueryDto) {
    const ret = await this.dailyService.list(dto);
    return ret;
  }
}
