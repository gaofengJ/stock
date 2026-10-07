import { BadRequestException, Injectable } from '@nestjs/common';
import * as dayjs from 'dayjs';
import {
  BasicSnapshotService,
  SourceSnapshot,
} from '@/modules/basic/workbench/snapshot.service';
import { latestDisclosed } from '@/modules/basic/workbench/workbench.service';
import { MarketService } from './market.service';
import { MarketQueryDto } from './market.dto';
import {
  buildThemeReview,
  reviewAnnouncements,
  reviewDate,
  reviewNumber,
} from './theme-review.rules';

const compact = (date: string) => date.replace(/-/g, '');
const metadata = (sources: SourceSnapshot[]) =>
  sources.map(({ rows, ...source }) => ({ ...source, count: rows.length }));

@Injectable()
export class ThemeReviewService {
  constructor(
    private market: MarketService,
    private cache: BasicSnapshotService,
  ) {}

  async board(q: MarketQueryDto) {
    const list = await this.market.limits({ ...q, type: 'U' });
    if (!list.ready)
      return {
        date: q.date,
        ready: false,
        groups: [],
        total: 0,
        classified: 0,
        explained: 0,
        sources: [],
      };
    if (!list.items.length)
      return {
        date: q.date,
        ready: true,
        groups: [],
        total: 0,
        classified: 0,
        explained: 0,
        sources: [],
      };
    const source = await this.cache.read(
      'ths_hot_review',
      { trade_date: compact(q.date!) },
      'ts_code,name,trade_date,theme,lu_desc,detail_reason',
    );
    let { rows } = source;
    try {
      buildThemeReview([], rows, q.date!);
    } catch {
      rows = [];
      source.state = 'error';
      source.message = '题材来源校验失败，请稍后检查更新';
    }
    return {
      date: q.date,
      ready: true,
      ...buildThemeReview(list.items, rows, q.date!),
      sources: metadata([source]),
    };
  }

  async detail(q: MarketQueryDto, code: string) {
    const board = await this.board({
      ...q,
      keyword: undefined,
      height: undefined,
      sector: undefined,
    });
    const stock = board.groups
      .flatMap((group) => group.items)
      .find((r) => r.tsCode === code);
    if (!stock)
      throw new BadRequestException('所选股票不在该日期和统计范围的涨停名单中');
    const date = q.date!;
    const start = dayjs(date).subtract(29, 'day').format('YYYY-MM-DD');
    const [announcements, financial] = await Promise.all([
      this.cache.read(
        'eastmoney_ann',
        { ts_code: code, start_date: compact(start), end_date: compact(date) },
        'ts_code,ann_date,title,url,rec_time',
      ),
      this.cache.read(
        'fina_indicator',
        {
          ts_code: code,
          start_date: compact(
            dayjs(date).subtract(1, 'year').format('YYYY-MM-DD'),
          ),
          end_date: compact(date),
        },
        'ts_code,ann_date,end_date,or_yoy,netprofit_yoy,profit_dedt,roe,update_flag',
      ),
    ]);
    const report = latestDisclosed(
      financial.rows.filter(
        (r) => r.ts_code === code && reviewDate(r.end_date) <= date,
      ),
      date,
    );
    return {
      date,
      stock,
      announcementStart: start,
      announcements: reviewAnnouncements(announcements.rows, code, start, date),
      financial: report
        ? {
            period: reviewDate(report.end_date),
            announcedAt: reviewDate(report.ann_date),
            revenueGrowth: reviewNumber(report.or_yoy),
            profitGrowth: reviewNumber(report.netprofit_yoy),
            deductedProfit: reviewNumber(report.profit_dedt),
            roe: reviewNumber(report.roe),
          }
        : null,
      sources: [...board.sources, ...metadata([announcements, financial])],
    };
  }
}
