import { Injectable } from '@nestjs/common';
import * as dayjs from 'dayjs';
import { camelCase, keyBy } from 'lodash';
import { TushareService, ITushareData } from '@/shared/tushare/tushare.service';
import { mixinDailyParams } from '@/utils';
import { DailyEntity } from '../source/daily/daily.entity';
import { LimitEntity } from '../source/limit/limit.entity';
import { StockEntity } from '../source/stock/stock.entity';
import { TradeCalEntity } from '../source/trade-cal/trade-cal.entity';
import { ActiveFundsEntity } from '../source/active-funds/active-funds.entity';
import { normalizeDate } from './sync.utils';

export function marketCoverage(
  codes: string[],
  stocks: Pick<StockEntity, 'tsCode' | 'listDate'>[],
  date: string,
) {
  return ['.SH', '.SZ', '.BJ'].every(
    (exchange) =>
      stocks.filter((s) => s.tsCode.endsWith(exchange) && s.listDate <= date)
        .length < 20 || codes.some((code) => code.endsWith(exchange)),
  );
}

// 接口字段变化、空快照与错误码必须在任何删除操作之前被发现。
export function readSnapshot(
  response: IBaseRes<ITushareData>,
  required: string[],
  allowEmpty = false,
): Record<string, any>[] {
  const { code, data } = response;
  if (
    code !== 0 ||
    !data ||
    !Array.isArray(data.fields) ||
    !Array.isArray(data.items)
  ) {
    throw new Error(`数据源响应失败: ${response.message || code}`);
  }
  if (required.some((field) => !data.fields.includes(field)))
    throw new Error('数据源缺少必需字段');
  if (!allowEmpty && !data.items.length) throw new Error('数据源返回空快照');
  return data.items.map((values) => {
    if (!Array.isArray(values) || values.length !== data.fields.length)
      throw new Error('数据源行结构异常');
    const row = Object.fromEntries(
      data.fields.map((field, index) => [camelCase(field), values[index]]),
    );
    if (
      required.some(
        (field) =>
          row[camelCase(field)] == null || row[camelCase(field)] === '',
      )
    )
      throw new Error('数据源必需字段为空');
    return row;
  });
}

function uniqueRows(
  rows: Record<string, any>[],
  key: (row: Record<string, any>) => string,
) {
  if (new Set(rows.map(key)).size !== rows.length)
    throw new Error('数据源包含重复业务键');
}

function normalizeSourceDate(value: string): string {
  const input = String(value);
  return normalizeDate(
    /^\d{8}$/.test(input)
      ? `${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6, 8)}`
      : input,
  );
}

function dateRows(rows: Record<string, any>[], date: string) {
  rows.forEach((row) => {
    // eslint-disable-next-line no-param-reassign
    row.tradeDate = normalizeSourceDate(row.tradeDate);
    if (row.tradeDate !== date) throw new Error('数据源交易日期不匹配');
  });
}

@Injectable()
export class SyncSourceService {
  constructor(private readonly tushare: TushareService) {}

  async calendar(year: number): Promise<TradeCalEntity[]> {
    const rows = readSnapshot(await this.tushare.getTradeCal(`${year + 1}`), [
      'cal_date',
      'is_open',
      'pretrade_date',
    ]);
    const normalized = rows.map((row) => ({
      calDate: normalizeSourceDate(row.calDate),
      isOpen: Number(row.isOpen),
      preTradeDate: normalizeSourceDate(row.pretradeDate),
    }));
    uniqueRows(normalized, (row) => row.calDate);
    if (normalized.some((row) => ![0, 1].includes(row.isOpen)))
      throw new Error('交易日历状态异常');
    // 校验整个日历连续，避免分页/截断数据替换原表。
    const sorted = normalized.sort((a, b) =>
      a.calDate.localeCompare(b.calDate),
    );
    if (
      sorted[0]?.calDate !== '2020-01-01' ||
      sorted[sorted.length - 1]?.calDate < `${year}-12-31` ||
      sorted.some(
        (row, index) =>
          index > 0 &&
          dayjs(sorted[index - 1].calDate)
            .add(1, 'day')
            .format('YYYY-MM-DD') !== row.calDate,
      )
    ) {
      throw new Error('交易日历不完整');
    }
    return normalized as TradeCalEntity[];
  }

  async stocks(): Promise<StockEntity[]> {
    const rows = readSnapshot(await this.tushare.getStockBasic(), [
      'ts_code',
      'symbol',
      'name',
      'list_date',
    ]);
    uniqueRows(rows, (row) => row.tsCode);
    return rows.map((row) => ({
      ...row,
      area: row.area || '',
      industry: row.industry || '',
      cnspell: row.cnspell || '',
      market: row.market || '',
      listDate: normalizeSourceDate(row.listDate),
      delistDate: row.delistDate ? normalizeSourceDate(row.delistDate) : null,
    })) as StockEntity[];
  }

  async activeFunds(): Promise<ActiveFundsEntity[]> {
    const rows = readSnapshot(await this.tushare.getActiveFunds(), ['name']);
    uniqueRows(rows, (row) => row.name);
    return rows as ActiveFundsEntity[];
  }

  async daily(date: string, stocks: StockEntity[]): Promise<DailyEntity[]> {
    const apiDate = date.replace(/-/g, '');
    const daily = readSnapshot(await this.tushare.getDaily(apiDate), [
      'ts_code',
      'trade_date',
      'open',
      'high',
      'low',
      'close',
      'pre_close',
      'change',
      'pct_chg',
      'vol',
      'amount',
    ]);
    const limits = readSnapshot(await this.tushare.getDailyLimit(apiDate), [
      'ts_code',
      'trade_date',
      'up_limit',
      'down_limit',
    ]);
    const basic = readSnapshot(await this.tushare.getDailyBasic(apiDate), [
      'ts_code',
      'trade_date',
    ]);
    [daily, limits, basic].forEach((rows) => {
      dateRows(rows, date);
      uniqueRows(rows, (row) => row.tsCode);
    });
    const stockByCode = keyBy(stocks, 'tsCode');
    if (
      !marketCoverage(
        daily.map((r) => r.tsCode),
        stocks,
        date,
      )
    )
      throw new Error('沪深京交易所覆盖不完整，等待补齐');
    const rows = mixinDailyParams(daily, limits, basic);
    if (!rows.length) throw new Error('合并后的日线数据为空');
    const basicCodes = new Set(basic.map((row) => row.tsCode));
    const limitCodes = new Set(limits.map((row) => row.tsCode));
    if (
      daily.some(
        (row) => !basicCodes.has(row.tsCode) || !limitCodes.has(row.tsCode),
      )
    )
      throw new Error('日线关联接口数据不完整');
    const optionalNumericFields = [
      'turnoverRate',
      'turnoverRateF',
      'volumeRatio',
      'pe',
      'peTtm',
      'pb',
      'ps',
      'psTtm',
      'dvRatio',
      'dvTtm',
      'totalShare',
      'floatShare',
      'freeShare',
      'totalMv',
      'circMv',
    ];
    const requiredNumericFields = [
      'open',
      'high',
      'low',
      'close',
      'preClose',
      'change',
      'pctChg',
      'vol',
      'amount',
    ];
    return rows.map((row) => {
      const normalized = { ...row, name: stockByCode[row.tsCode]?.name || '' };
      optionalNumericFields.forEach((field) => {
        normalized[field] =
          row[field] == null || row[field] === '' ? null : row[field];
      });
      // Limit/basic snapshots also contain suspended stocks without a daily row.
      requiredNumericFields.forEach((field) => {
        normalized[field] = row[field] ?? 0;
      });
      if (
        ['upLimit', 'downLimit', ...requiredNumericFields].some(
          (field) => !Number.isFinite(Number(normalized[field])),
        ) ||
        optionalNumericFields.some(
          (field) =>
            normalized[field] !== null &&
            !Number.isFinite(Number(normalized[field])),
        )
      )
        throw new Error('日线包含无效数值');
      return normalized;
    }) as DailyEntity[];
  }

  async limits(date: string): Promise<LimitEntity[]> {
    const rows = readSnapshot(
      await this.tushare.getLimitList(date.replace(/-/g, '')),
      ['ts_code', 'trade_date', 'name', 'limit'],
      true,
    );
    dateRows(rows, date);
    uniqueRows(rows, (row) => `${row.tsCode}:${row.limit}`);
    if (rows.some((row) => !['U', 'D', 'Z'].includes(row.limit)))
      throw new Error('涨跌停类型异常');
    return rows as LimitEntity[];
  }
}
