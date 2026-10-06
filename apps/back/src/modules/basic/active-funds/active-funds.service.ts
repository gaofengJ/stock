import { Injectable } from '@nestjs/common';
import { ActiveFundsService as SourceActiveFundsService } from '@/modules/source/active-funds/active-funds.service';
import { fundOrgs } from './fund-orgs';

@Injectable()
export class ActiveFundsService {
  constructor(private activeFundsService: SourceActiveFundsService) {}

  /**
   * 游资名录
   */
  async list() {
    const ret = await this.activeFundsService.list();
    return ret.map((i) => ({
      name: i.name,
      orgs: fundOrgs(i.orgs),
      desc: i.desc || '',
    }));
  }
}
