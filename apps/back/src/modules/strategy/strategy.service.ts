import { Injectable, Logger } from '@nestjs/common';
import { CommonDateDto } from '@/dto/common.dto';
import { BizException } from '@/exceptions/biz.exception';
import { ECustomError } from '@/types/common.enum';
import { TradeCalService } from '../source/trade-cal/trade-cal.service';
import { DailyService } from '../source/daily/daily.service';
import { StrategyListQueryDto } from './strategy.dto';
import { EStrategyType } from './strategy.enum';
import { DailyEntity } from '../source/daily/daily.entity';

@Injectable()
export class StrategyService {
  constructor(
    private tradeCalService: TradeCalService,
    private dailyService: DailyService,
  ) {}

  private logger = new Logger(StrategyService.name);

  /**
   * 向上跳空缺口后三连阳
   */
  async gapThreeUp(date: CommonDateDto['date']) {
    const isOpen = await this.tradeCalService.isOpen(date);
    if (!isOpen) {
      this.logger.log(`${date}非交易日，请重新选择交易日期`);
      throw new BizException(ECustomError.NON_TRADING_DAY);
    }
    // 获取过去的四个交易日
    const last4Days = await this.tradeCalService.getLastNDays({
      date,
      n: 4,
    });

    const [date4, date3, date2, date1] = last4Days.map((i) => i.calDate);

    // 获取过去4个交易日的数据
    const { items: dailyItems } = await this.dailyService.list({
      pageNum: 1,
      pageSize: 30000,
      startDate: date1,
      endDate: date4,
      fields: [
        'tsCode',
        'name',
        'tradeDate',
        'open',
        'close',
        'high',
        'low',
        'upLimit',
        'amount', // 成交额(千元)
        'turnoverRateF', // 换手率(自由流通股)(%)
        'volumeRatio', // 量比
        'peTtm', // 市盈率(TTM)
        'totalMv', // 总市值(万元)
        'circMv', // 流通市值(万元)
      ],
    });

    // 构建 map
    const map: Record<string, any> = {};
    for (let i = 0; i < dailyItems.length; i += 1) {
      const { tsCode, name, tradeDate, high, low, close, open, upLimit } =
        dailyItems[i];

      // 转换数据为数值类型
      const numericItem = {
        tsCode,
        name,
        tradeDate,
        high: +high,
        low: +low,
        close: +close,
        open: +open,
        upLimit: +upLimit,
      };

      // 如果 tsCode 不在 map 中，则初始化
      if (!map[tsCode]) {
        map[tsCode] = {};
      }

      // 将 item 添加到对应的 tsCode 和 tradeDate 下
      map[tsCode][tradeDate] = numericItem;
    }

    const tsCodeArr: string[] = [];
    const mapKeyArr = Object.keys(map);
    for (let i = 0; i < mapKeyArr.length; i += 1) {
      const tempTsCode = mapKeyArr[i];
      const dailyItem = map[tempTsCode];

      if (
        !dailyItem[date1] ||
        !dailyItem[date2] ||
        !dailyItem[date3] ||
        !dailyItem[date4]
      )
        // eslint-disable-next-line no-continue
        continue;

      if (
        !/ST|N|C/.test(dailyItem[date1].name) &&
        dailyItem[date1].high < dailyItem[date2].low &&
        dailyItem[date2].close > dailyItem[date2].open &&
        dailyItem[date2].upLimit !== dailyItem[date2].close &&
        dailyItem[date3].close > dailyItem[date3].open &&
        dailyItem[date4].close > dailyItem[date4].open
      ) {
        tsCodeArr.push(tempTsCode);
      }
    }

    return dailyItems.filter(
      (i) => i.tradeDate === date4 && tsCodeArr.includes(i.tsCode),
    );
  }

  /**
   * 策略名称列表
   */
  async navList() {
    const ret = [
      {
        label: '向上跳空缺口后三连阳',
        value: EStrategyType.gapThreeUp,
      },
    ];
    return ret;
  }

  /**
   * 策略选股结果列表
   */
  async list(dto: StrategyListQueryDto) {
    const { date, strategyType } = dto;
    let ret: DailyEntity[] = [];
    switch (strategyType) {
      case EStrategyType.gapThreeUp:
        ret = await this.gapThreeUp(date);
        break;
      default:
        ret = [];
        break;
    }
    return ret;
  }
}
