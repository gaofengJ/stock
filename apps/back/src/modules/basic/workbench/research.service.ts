/* eslint-disable no-param-reassign -- Each request owns cloned source containers. */
import { BadRequestException, Injectable } from '@nestjs/common';
import * as dayjs from 'dayjs';
import { shanghaiDate } from '@/modules/daily-task/sync.utils';
import { MarketResearchQuery, ResearchQuery } from './research.dto';
import {
  ResearchSource,
  ResearchSourceService,
} from './research-source.service';
import {
  announcedRows,
  disclosedRows,
  financialHistory,
  holderChanges,
  sourceDate,
} from './research-rules';

type ReadSpec = [string, Record<string, unknown>, string, number];

@Injectable()
export class ResearchService {
  constructor(private source: ResearchSourceService) {}

  private validateDate(date: string) {
    if (
      !dayjs(date).isValid() ||
      dayjs(date).format('YYYY-MM-DD') !== date ||
      date > shanghaiDate()
    )
      throw new BadRequestException('请选择有效且不晚于今天的观察日期');
  }

  async stock(dto: ResearchQuery) {
    this.validateDate(dto.date);
    const end = sourceDate(dto.date);
    const { code } = dto;
    const recent = {
      ts_code: code,
      start_date: dayjs(dto.date).subtract(120, 'day').format('YYYYMMDD'),
      end_date: end,
    };
    const history = {
      ts_code: code,
      start_date: dayjs(dto.date).subtract(5, 'year').format('YYYYMMDD'),
      end_date: end,
    };
    const month = (dto.month || dto.date.slice(0, 7)).replace('-', '');
    if (month > dto.date.slice(0, 7).replace('-', ''))
      throw new BadRequestException('金股月份不能晚于观察日期');
    const specs: Record<string, ReadSpec[]> = {
      funds: [
        [
          'moneyflow_ths',
          recent,
          'ts_code,trade_date,net_amount,net_d5_amount,buy_lg_amount,buy_lg_amount_rate',
          6000,
        ],
      ],
      margin: [
        [
          'margin_detail',
          recent,
          'ts_code,trade_date,rzye,rzmre,rzche,rqye,rzrqye',
          6000,
        ],
      ],
      holders: [
        [
          'top10_holders',
          history,
          'ts_code,ann_date,end_date,holder_name,hold_amount,hold_ratio,holder_type',
          2000,
        ],
        [
          'top10_floatholders',
          history,
          'ts_code,ann_date,end_date,holder_name,hold_amount,hold_ratio,holder_type',
          2000,
        ],
        [
          'stk_holdernumber',
          history,
          'ts_code,ann_date,end_date,holder_num',
          3000,
        ],
      ],
      business: [
        [
          'fina_mainbz',
          { ...history, type: dto.businessType || 'P' },
          'ts_code,end_date,bz_item,bz_code,bz_sales,bz_profit,bz_cost,curr_type,update_flag',
          100,
        ],
      ],
      capital: [
        [
          'pledge_stat',
          { ts_code: code },
          'ts_code,end_date,pledge_count,unrest_pledge,rest_pledge,total_share,pledge_ratio',
          1000,
        ],
        [
          'pledge_detail',
          recent,
          'ts_code,ann_date,holder_name,pledge_amount,start_date,end_date,is_release,release_date,p_total_ratio,h_total_ratio',
          1000,
        ],
        [
          'repurchase',
          { start_date: recent.start_date, end_date: end },
          'ts_code,ann_date,end_date,proc,exp_date,vol,amount,high_limit,low_limit',
          1000,
        ],
      ],
      financial: [
        [
          'balancesheet',
          history,
          'ts_code,ann_date,f_ann_date,end_date,report_type,total_assets,total_liab,total_hldr_eqy_exc_min_int,update_flag',
          1000,
        ],
        [
          'income',
          history,
          'ts_code,ann_date,f_ann_date,end_date,report_type,revenue,n_income_attr_p,update_flag',
          1000,
        ],
        [
          'fina_indicator',
          history,
          'ts_code,ann_date,end_date,profit_dedt,or_yoy,netprofit_yoy,roe,grossprofit_margin,debt_to_assets,update_flag',
          100,
        ],
        [
          'cashflow',
          history,
          'ts_code,ann_date,f_ann_date,end_date,report_type,n_cashflow_act,update_flag',
          1000,
        ],
      ],
      institutions: [
        [
          'stk_surv',
          recent,
          'ts_code,name,surv_date,fund_visitors,rece_mode,rece_org,org_type,comp_rece,content',
          100,
        ],
        ['broker_recommend', { month }, 'month,broker,ts_code,name', 1000],
      ],
    };
    const sources = (
      await Promise.all(specs[dto.section].map((s) => this.source.read(...s)))
    ).map((s) => ({ ...s, rows: [...s.rows] }));
    sources.forEach((s) => {
      s.rows = s.rows.filter((r) => r.ts_code === code);
      if (['pledge_detail', 'repurchase'].includes(s.source))
        s.rows = announcedRows(s.rows, dto.date);
      else if (
        [
          'income',
          'cashflow',
          'balancesheet',
          'fina_indicator',
          'top10_holders',
          'top10_floatholders',
          'stk_holdernumber',
        ].includes(s.source)
      )
        s.rows = disclosedRows(s.rows, dto.date);
      else if (s.source !== 'broker_recommend') {
        let field = 'end_date';
        if (s.source === 'stk_surv') field = 'surv_date';
        if (['moneyflow_ths', 'margin_detail'].includes(s.source))
          field = 'trade_date';
        s.rows = s.rows.filter(
          (r) => sourceDate(r[field]) && sourceDate(r[field]) <= end,
        );
      }
      if (s.source === 'pledge_detail')
        s.rows = s.rows.map((r) => ({
          ...r,
          is_release:
            sourceDate(r.release_date) && sourceDate(r.release_date) <= end
              ? r.is_release
              : null,
          release_date:
            sourceDate(r.release_date) && sourceDate(r.release_date) <= end
              ? r.release_date
              : null,
        }));
      if (s.source === 'broker_recommend')
        s.rows = s.rows.filter((r) => String(r.month) === month);
    });
    const table = (source: string) =>
      sources.find((s) => s.source === source)?.rows || [];
    return {
      code,
      date: dto.date,
      section: dto.section,
      month,
      businessType: dto.businessType || 'P',
      sources,
      financial:
        dto.section === 'financial' ? financialHistory(sources, dto.date) : [],
      holders:
        dto.section === 'holders'
          ? holderChanges(table('top10_holders'), dto.date)
          : null,
      floatHolders:
        dto.section === 'holders'
          ? holderChanges(table('top10_floatholders'), dto.date)
          : null,
    };
  }

  async sectors(dto: MarketResearchQuery) {
    this.validateDate(dto.date);
    const source = dto.kind === 'N' ? 'moneyflow_cnt_ths' : 'moneyflow_ind_ths';
    const name = dto.kind === 'N' ? 'name' : 'industry';
    const result = await this.source.read(
      source,
      { trade_date: sourceDate(dto.date) },
      `trade_date,ts_code,${name},net_amount,net_buy_amount,net_sell_amount,company_num`,
      5000,
    );
    const filtered: ResearchSource = {
      ...result,
      rows: result.rows.filter(
        (r) => sourceDate(r.trade_date) === sourceDate(dto.date),
      ),
    };
    return { date: dto.date, kind: dto.kind || 'I', sources: [filtered] };
  }

  async market(dto: MarketResearchQuery) {
    this.validateDate(dto.date);
    const params = {
      start_date: dayjs(dto.date).subtract(90, 'day').format('YYYYMMDD'),
      end_date: sourceDate(dto.date),
    };
    const specs: ReadSpec[] = [
      [
        'moneyflow_mkt_dc',
        params,
        'trade_date,net_amount,net_amount_rate,buy_elg_amount,buy_lg_amount',
        3000,
      ],
      [
        'margin',
        params,
        'trade_date,exchange_id,rzye,rzmre,rzche,rqye,rzrqye',
        4000,
      ],
    ];
    let selected = specs;
    if (dto.section === 'funds') selected = [specs[0]];
    if (dto.section === 'margin') selected = [specs[1]];
    if (dto.section === 'ranking')
      selected = [
        [
          'margin_detail',
          { trade_date: sourceDate(dto.date) },
          'ts_code,trade_date,rzye,rzmre,rzche,rqye,rzrqye',
          6000,
        ],
        [
          'margin_secs',
          { trade_date: sourceDate(dto.date) },
          'trade_date,ts_code,name,exchange',
          6000,
        ],
      ];
    const results = await Promise.all(
      selected.map((s) => this.source.read(...s)),
    );
    return {
      date: dto.date,
      sources: results.map((s) => ({
        ...s,
        rows: s.rows.filter(
          (r) =>
            sourceDate(r.trade_date) &&
            (dto.section === 'ranking'
              ? sourceDate(r.trade_date) === sourceDate(dto.date)
              : sourceDate(r.trade_date) <= sourceDate(dto.date)),
        ),
      })),
    };
  }
}
