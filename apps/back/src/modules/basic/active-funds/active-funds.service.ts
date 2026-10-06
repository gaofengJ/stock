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
      // Imported descriptions can contain literal escape sequences instead of line breaks.
      desc: (i.desc || '')
        .replace(/\\r\\n|\\[rn]/g, '\n')
        .replace(/\r\n?/g, '\n')
        .trim(),
    }));
  }
}
