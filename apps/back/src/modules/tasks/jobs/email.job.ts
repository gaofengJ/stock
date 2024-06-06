import { BadRequestException, Injectable } from '@nestjs/common';

import { LoggerService } from '@/shared/logger/logger.service';
import { Mission } from '../mission.decorator';

/**
 * Api接口请求类型任务
 */
@Injectable()
@Mission()
export class EmailJob {
  constructor(private readonly logger: LoggerService) {}

  async send(config: any): Promise<void> {
    if (config) {
      this.logger.log(EmailJob.name);
    } else {
      throw new BadRequestException('Email send job param is empty');
    }
  }
}
