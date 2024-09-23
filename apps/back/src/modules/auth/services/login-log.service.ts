import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Like, Repository } from 'typeorm';
import UAParser from 'ua-parser-js';

import { paginateRaw } from '@/helper/paginate';
import { getIpAddress } from '@/utils/ip.util';

import { LoginLogQueryDto } from '../dto/log.dto';
import { LoginLogEntity } from '../entities/login-log.entity';
import { LoginLogModel } from '../models/log.model';

async function parseLoginLog(e: any, parser: UAParser): Promise<LoginLogModel> {
  const uaResult = parser.setUA(e.login_log_ua).getResult();

  return {
    id: e.login_log_id,
    ip: e.login_log_ip,
    address: e.login_log_address,
    os: `${`${uaResult.os.name ?? ''} `}${uaResult.os.version}`,
    browser: `${`${uaResult.browser.name ?? ''} `}${uaResult.browser.version}`,
    username: e.user_username,
    time: e.login_log_created_at,
  };
}

@Injectable()
export class LoginLogService {
  constructor(
    @InjectRepository(LoginLogEntity)
    private loginLogRepository: Repository<LoginLogEntity>,
  ) {}

  async create(uid: number, ip: string, ua: string): Promise<void> {
    try {
      const address = await getIpAddress(ip);

      await this.loginLogRepository.save({
        ip,
        ua,
        address,
        user: { id: uid },
      });
    } catch (e) {
      console.error(e);
    }
  }

  async list({ pageNum, pageSize, username, ip, address }: LoginLogQueryDto) {
    const queryBuilder = await this.loginLogRepository
      .createQueryBuilder('t_userlogin_log')
      .where({
        ...(ip && { ip: Like(`%${ip}%`) }),
        ...(address && { address: Like(`%${address}%`) }),
        ...(username && {
          user: {
            username: Like(`%${username}%`),
          },
        }),
      })
      .orderBy('t_user_login_log.created_at', 'DESC');

    const { items, ...rest } = await paginateRaw<LoginLogEntity>(queryBuilder, {
      pageNum,
      pageSize,
    });

    const parser = new UAParser();
    const loginLogInfos = await Promise.all(
      items.map((item) => parseLoginLog(item, parser)),
    );

    return {
      items: loginLogInfos,
      ...rest,
    };
  }

  async clearLog(): Promise<void> {
    await this.loginLogRepository.clear();
  }

  async clearLogBeforeTime(time: Date): Promise<void> {
    await this.loginLogRepository.delete({ createdAt: LessThan(time) });
  }
}
