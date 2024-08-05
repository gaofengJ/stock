import { Injectable, Logger } from '@nestjs/common';
import { allOptions } from '@/configs/options';

@Injectable()
export class CommonService {
  private logger = new Logger(CommonService.name);

  /**
   * 获取所有选项
   */
  allOptions() {
    return allOptions;
  }
}
