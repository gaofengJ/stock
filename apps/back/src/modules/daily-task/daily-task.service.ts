import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { camelCase, keyBy } from 'lodash';
import { CommonDto } from '@/dto/common.dto';
import { TradeCalService } from '@/modules/source/trade-cal/trade-cal.service';
import { BizException } from '@/exceptions/biz.exception';
import { EError } from '@/constants';
import {
  getLastFridayOfYear,
  mixinDailyParams,
  mixinFieldAndItems,
} from '@/utils';
import { TushareService } from '@/shared/tushare/tushare.service';
import { TradeCalDto } from '@/modules/source/trade-cal/trade-cal.dto';
import { StockService } from '@/modules/source/stock/stock.service';
import { StockDto } from '@/modules/source/stock/stock.dto';
import { DailyService } from '@/modules/source/daily/daily.service';
import { DailyDto } from '@/modules/source/daily/daily.dto';
import { LimitDto } from '../source/limit/limit.dto';
import { LimitService } from '../source/limit/limit.service';
import { ELimit } from '../source/limit/limit.enum';
import { SentiService } from '../processed/senti/senti.service';

@Injectable()
export class DailyTaskService {
  private logger = new Logger(DailyTaskService.name);

  constructor(
    private tushareService: TushareService,
    private tradeCalService: TradeCalService,
    private stockService: StockService,
    private dailyService: DailyService,
    private limitService: LimitService,
    private sentiService: SentiService,
  ) {}

  async import(date: CommonDto['date']) {
    const isOpen = await this.tradeCalService.isOpen(date);
    if (!isOpen) {
      this.logger.log(`${date}非交易日，请重新选择交易日期`);
      throw new BizException(EError.NON_TRADING_DAY);
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
    try {
      const curYear = dayjs().year(); // 获取当前年份
      const lastFridayOfYear = getLastFridayOfYear(curYear); // 获取每年最后一个周五
      if (date !== lastFridayOfYear) return;

      const { code, data } = await this.tushareService.getTradeCal(
        `${curYear + 1}`,
      );
      if (code) return;
      // tushare接口返回字段preTradeDate对不上，所以写死了
      const fields = ['exchange', 'calDate', 'isOpen', 'preTradeDate'];
      const { items } = data!;
      const params: TradeCalDto[] = mixinFieldAndItems(fields, items);
      const count = await this.tradeCalService.bulkCreate(params);
      this.logger.log(`导入交易日历：成功导入${curYear}年${count}条数据`);
    } catch (error) {
      this.logger.error(`导入交易日历失败：${error.message}`);
      throw new BizException(EError.IMPORT_TRADE_CAL_FAILED);
    }
  }

  /**
   * 每周一导入股票基本信息（导入新增股票）
   * @param date 日期
   */
  async importStockBasic(date: CommonDto['date']) {
    try {
      const day = dayjs(date).day(); // 获取周几
      if (day !== 1) return;
      await this.stockService.clear();
      this.logger.log(`清空股票基本信息表`);
      const { code, data } = await this.tushareService.getStockBasic();
      if (code) return;
      const { fields, items } = data!;
      const formatedFields = fields.map((i) => camelCase(i)); // 将下划线转为驼峰
      const params: StockDto[] = mixinFieldAndItems(formatedFields, items);
      const count = await this.stockService.bulkCreate(params);
      this.logger.log(`导入股票基本信息：成功导入${count}条数据`);
    } catch (error) {
      this.logger.error(`导入股票基本信息失败：${error.message}`);
      throw new BizException(EError.IMPORT_STOCK_FAILED);
    }
  }

  /**
   * 每日数据统计
   * @param date 日期
   */
  async importDaily(date: CommonDto['date']) {
    try {
      const formatedDate = dayjs(date).format('YYYYMMDD');
      const { code: dailyCode, data: dailyData } =
        await this.tushareService.getDaily(formatedDate);
      const { code: limitCode, data: limitData } =
        await this.tushareService.getDailyLimit(formatedDate);
      const { code: basicCode, data: basicData } =
        await this.tushareService.getDailyBasic(formatedDate);
      if (dailyCode || limitCode || basicCode) return;

      const { fields: dailyFields, items: dailyItems } = dailyData!;
      const { fields: limitFields, items: limitItems } = limitData!;
      const { fields: basicFields, items: basicItems } = basicData!;

      const formatedDailyFields = dailyFields.map((i) => camelCase(i)); // 将下划线转为驼峰
      const formatedLimitFields = limitFields.map((i) => camelCase(i)); // 将下划线转为驼峰
      const formatedBasicFields = basicFields.map((i) => camelCase(i)); // 将下划线转为驼峰

      const dailyParams: DailyDto[] = mixinFieldAndItems(
        formatedDailyFields,
        dailyItems,
      );
      const limitParams: DailyDto[] = mixinFieldAndItems(
        formatedLimitFields,
        limitItems,
      );
      const basicParams: DailyDto[] = mixinFieldAndItems(
        formatedBasicFields,
        basicItems,
      );

      let params: DailyDto[] = mixinDailyParams(
        dailyParams,
        limitParams,
        basicParams,
      );

      const { items: stockData } = await this.stockService.list({
        pageNum: 1,
        pageSize: 10000,
      }); // 查询所有股票信息

      const stockDataObj = keyBy(stockData, (item) => item.tsCode);

      params = params.map((i) => ({
        ...i,
        name: stockDataObj[i.tsCode].name,
      }));

      const count = await this.dailyService.bulkCreate(params);
      this.logger.log(`导入每日数据：成功导入${count}条数据`);
    } catch (error) {
      this.logger.error(`导入每日数据失败：${error.message}`);
      throw new BizException(EError.IMPORT_DAILY_FAILED);
    }
  }

  /**
   * 每日涨跌停统计
   * @param date 日期
   */
  async importLimitList(date: CommonDto['date']) {
    try {
      const formatedDate = dayjs(date).format('YYYYMMDD');
      const { code, data } = await this.tushareService.getLimitList(
        formatedDate,
      );
      if (code) return;
      const { fields, items } = data!;
      const formatedFields = fields.map((i) => camelCase(i)); // 将下划线转为驼峰
      const params: LimitDto[] = mixinFieldAndItems(formatedFields, items);
      const count = await this.limitService.bulkCreate(params);
      this.logger.log(`导入涨跌停数据：成功导入${count}条数据`);
    } catch (error) {
      this.logger.error(`导入涨跌停数据失败：${error.message}`);
      throw new BizException(EError.IMPORT_LIMIT_FAILED);
    }
  }

  /**
   * 每日短线情绪指标
   * @param date 日期
   */
  async importDailyMarketMood(date: CommonDto['date']) {
    const preTradeDate = await this.tradeCalService.getPreDate(date); // 查询上一个交易日
    // 短线情绪指标，以2022年01月05日为例
    const senti = {
      a: 0, // 2022年01月05日涨停，非一字涨停，非ST
      b: 0, // 2022年01月04日涨停，非一字涨停，非ST
      c: 0, // 2022年01月04日涨停，非一字涨停，非ST，2022年01月05日高开
      d: 0, // 2022年01月04日涨停，非一字涨停，非ST，2022年01月05日上涨
      e: 0, // 2022年01月05日曾涨停，非ST
      sentiA: 0, // 非一字涨停 sentiA = a
      sentiB: 0, // 打板高开率 sentiB = c / b
      sentiC: 0, // 打板成功率 sentiC = d / b
      sentiD: 0, // 打板被砸率 sentiD = e / (a + e)
    };

    const { items: curLimitData } = await this.limitService.list({
      pageNum: 1,
      pageSize: 10000,
      tradeDate: date,
      limit: ELimit.U,
    }); // 获取当日涨停数据
    const { items: preLimitData } = await this.limitService.list({
      pageNum: 1,
      pageSize: 10000,
      tradeDate: preTradeDate,
      limit: ELimit.U,
    }); // 查询上一日涨停数据
    const { items: curLimitDataZ } = await this.limitService.list({
      pageNum: 1,
      pageSize: 10000,
      tradeDate: date,
      limit: ELimit.Z,
    }); // 获取当日炸板数据
    const { items: curDailyData } = await this.dailyService.list({
      pageNum: 1,
      pageSize: 10000,
      tradeDate: date,
    }); // 查询当日数据
    const { items: preDailyData } = await this.dailyService.list({
      pageNum: 1,
      pageSize: 10000,
      tradeDate: preTradeDate,
    }); // 查询上一日数据

    // 空间换时间，减少时间复杂度
    const curLimitDataObj = keyBy(curLimitData, (item) => item.tsCode);
    const preLimitDataObj = keyBy(preLimitData, (item) => item.tsCode);

    const curDailyLimitData = curDailyData.filter(
      (i) =>
        curLimitDataObj[i.tsCode] && !/ST|N|C/.test(i.name) && i.high !== i.low,
    );
    senti.a = curDailyLimitData?.length;

    const preDailyLimitData = preDailyData.filter(
      (i) =>
        preLimitDataObj[i.tsCode] && !/ST|N|C/.test(i.name) && i.high !== i.low,
    );
    senti.b = preDailyLimitData?.length;

    senti.c = preDailyLimitData.filter((i) => {
      const tempCurDailyData = curDailyData.find((j) => i.tsCode === j.tsCode);
      if (!tempCurDailyData) return false;
      return tempCurDailyData.open > tempCurDailyData.preClose;
    })?.length;

    senti.c = preDailyLimitData.filter((i) => {
      const tempCurDailyData = curDailyData.find((j) => i.tsCode === j.tsCode);
      if (!tempCurDailyData) return false;
      return tempCurDailyData.close > tempCurDailyData.preClose;
    })?.length;

    senti.e = curLimitDataZ.filter((i) => !/ST|N|C/.test(i.name))?.length;

    senti.sentiA = senti.a;
    senti.sentiB = Math.floor(senti.c / senti.b / 0.01);
    senti.sentiC = Math.floor(senti.d / senti.b / 0.01);
    senti.sentiD = Math.floor(senti.e / (senti.a + senti.e) / 0.01);
    await this.sentiService.create({
      tradeDate: date!,
      a: senti.a,
      b: senti.b,
      c: senti.c,
      d: senti.d,
      e: senti.e,
      sentiA: `${senti.sentiA}`,
      sentiB: `${senti.sentiB}`,
      sentiC: `${senti.sentiC}`,
      sentiD: `${senti.sentiD}`,
    });
  }

  /**
   * 手动删除当日数据
   * @param date 日期
   */
  async delete(date: CommonDto['date']) {
    console.info('date', date);
  }
}
