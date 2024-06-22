import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { CommonDto } from '@/dto/common.dto';
import { TradeCalService } from '@/modules/source/trade-cal/trade-cal.service';
import { BusinessException } from '@/exceptions/business.exception';
import { EError } from '@/constants';
import { getLastFridayOfYear, mixinFieldAndItems } from '@/utils';
import { TushareService } from '@/shared/tushare/tushare.service';
import { TradeCalDto } from '@/modules/source/trade-cal/trade-cal.dto';

@Injectable()
export class DailyTaskService {
  private logger = new Logger(DailyTaskService.name);

  constructor(
    private tushareService: TushareService,
    private tradeCalService: TradeCalService,
  ) {}

  async import(date: CommonDto['date']) {
    const isOpen = await this.tradeCalService.isOpen(date);
    if (!isOpen) {
      this.logger.log(`${date}非交易日，请重新选择交易日期`);
      throw new BusinessException(EError.NON_TRADING_DAY);
    }
    await this.importTradeCal(date);
    await this.importStockBasic(date);
    await this.importDaily(date);
    await this.importLimitList(date);
    await this.importDailyMarketMood(date);
  }

  /**
   * @description 每年的最后一个交易日（最后一个周五）导入下一年的交易日历
   * @param date 日期
   * @returns
   */
  async importTradeCal(date: CommonDto['date']) {
    const curYear = dayjs().year(); // 获取当前年份
    const lastFridayOfYear = getLastFridayOfYear(curYear);
    if (date !== lastFridayOfYear) return;

    const { code, data } = await this.tushareService.getTradeCal(
      `${curYear + 1}`,
    );
    if (code) return;
    const fields = ['exchange', 'calDate', 'isOpen', 'preTradeDate']; // tushare接口返回字段对不上，所以写死了
    const { items } = data;
    const params: TradeCalDto[] = mixinFieldAndItems(fields, items);
    const count = await this.tradeCalService.bulkCreate(params);
    this.logger.log(`导入交易日历：成功导入${curYear}年${count}条数据`);
  }

  /**
   * 每周一导入股票基本信息（导入新增股票）
   * @param date 日期
   */
  importStockBasic(date: CommonDto['date']) {
    console.info('date', date);
  }

  /**
   * 每日数据统计
   * @param date 日期
   */
  importDaily(date: CommonDto['date']) {
    console.info('date', date);
  }

  /**
   * 每日涨跌停统计
   * @param date 日期
   */
  importLimitList(date: CommonDto['date']) {
    console.info('date', date);
  }

  /**
   * 每日短线情绪指标
   * @param date 日期
   */
  importDailyMarketMood(date: CommonDto['date']) {
    console.info('date', date);
  }

  /**
   * 手动删除当日数据
   * @param date 日期
   */
  async delete(date: CommonDto['date']) {
    console.info('date', date);
  }
}
