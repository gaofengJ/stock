import { Injectable, Logger } from '@nestjs/common';

import { ActiveFundsService as SourceActiveFundsService } from '@/modules/source/active-funds/active-funds.service';

@Injectable()
export class ActiveFundsService {
  private logger = new Logger(ActiveFundsService.name);

  constructor(private activeFundsService: SourceActiveFundsService) {}

  /**
   * 游资名录
   */
  async list() {
    const ret = await this.activeFundsService.list();
    return ret.map((i) => ({
      name: i.name,
      orgs: JSON.parse(i.orgs) as string[],
      desc: i.desc,
    }));
  }
}
