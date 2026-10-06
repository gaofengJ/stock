'use client';

import { useState } from 'react';
import {
  Button, Card, Descriptions, Drawer, Segmented, Select, Tabs,
} from 'antd';
import Link, { InteractionButton } from '@/components/Interaction';
import { beijingTime, numberText } from '@/utils/format';
import {
  businessRows, dateText, newest, Row, sourceLabels,
} from './data';
import {
  dateColumn, numberColumn, ResearchChart, ResearchTable, RequestState, SourceBlock, textColumn, useResearch,
} from './common';

const sections = [
  ['funds', '资金流向'], ['margin', '融资融券'], ['holders', '股东变化'], ['business', '主营构成'],
  ['capital', '质押与回购'], ['financial', '财务趋势'], ['institutions', '机构调研'],
];

function StockPanel({ code, date, section }: { code: string; date: string; section: string }) {
  const [businessType, setBusinessType] = useState('P');
  const [inspect, setInspect] = useState<Row | null>(null);
  const [reportPeriod, setReportPeriod] = useState('all');
  const state = useResearch('stock', {
    code, date, section, ...(section === 'business' ? { businessType } : {}),
  });
  const { data } = state;
  const source = (name: string) => data?.sources.find((s) => s.source === name);
  const rows = (name: string) => source(name)?.rows || [];
  const block = (name: string, title: string, content: React.ReactNode, note?: string, empty?: boolean) => <SourceBlock key={name} source={source(name)} title={title} retry={state.retry} note={note} empty={empty}>{content}</SourceBlock>;
  const series = (key: string, name: string, divisor = 100000000) => ({ key, name, divisor });
  const trend = (items: Row[], lines: ReturnType<typeof series>[], field = 'trade_date', unit = '亿元') => <ResearchChart rows={items} series={lines} field={field} unit={unit} />;
  let content: React.ReactNode;
  if (section === 'funds') {
    const items = newest(rows('moneyflow_ths'));
    content = block(
      'moneyflow_ths',
      '个股资金流向', (
        <div>
          {trend(items, [series('net_amount', '当日净流入', 10000), series('net_d5_amount', '近5日净流入', 10000)])}
          <ResearchTable rows={items} columns={[dateColumn('trade_date'), numberColumn('net_amount', '当日净流入（亿元）', 10000, true), numberColumn('net_d5_amount', '近5日净流入（亿元）', 10000, true), numberColumn('buy_lg_amount', '大单净流入（亿元）', 10000, true), numberColumn('buy_lg_amount_rate', '大单净流入占比（%）', 1, true)]} />
        </div>
      ), '同花顺日频口径，展示观察日前120天；源金额为万元，统一换算为亿元。日频接口按最新已发布数据查询。',
    );
  } else if (section === 'margin') {
    const items = newest(rows('margin_detail')).map((r) => ({ ...r, net_buy: r.rzmre != null && r.rzche != null ? Number(r.rzmre) - Number(r.rzche) : null }));
    content = block(
      'margin_detail',
      '个股融资融券', (
        <div>
          {trend(items, [series('rzye', '融资余额'), series('rqye', '融券余额')])}
          <ResearchTable rows={items} columns={[dateColumn('trade_date'), numberColumn('rzye', '融资余额（亿元）', 1e8), numberColumn('net_buy', '融资净买入（亿元）', 1e8, true), numberColumn('rqye', '融券余额（亿元）', 1e8), numberColumn('rzrqye', '两融余额（亿元）', 1e8)]} />
        </div>
      ), '观察日前120天；融资净买入 = 融资买入额 − 融资偿还额。缺失字段不参与计算。',
    );
  } else if (section === 'holders') {
    const holderTable = (key: 'holders' | 'floatHolders') => {
      const snapshot = data?.[key];
      return (
        <>
          <p className="live-research-note">
            本期
            {dateText(snapshot?.period)}
            {' '}
            · 可比上期
            {dateText(snapshot?.previousPeriod)}
            。新进／退出表示前十名单变化。
          </p>
          <ResearchTable rows={snapshot?.rows || []} columns={[textColumn('holder_name', '股东名称', 260), dateColumn('ann_date', '公告日期'), numberColumn('hold_amount', '持股数量（万股）', 10000), numberColumn('hold_ratio', '持股比例（%）'), numberColumn('change_amount', '较上期变化（万股）', 10000, true), textColumn('change_label', '名单变化', 150)]} />
          {!!snapshot?.exited.length && (
          <p className="live-research-note">
            退出前十：
            {snapshot.exited.map((r) => r.holder_name).join('、')}
          </p>
          )}
        </>
      );
    };
    const numbers = newest(rows('stk_holdernumber'), 'end_date');
    content = (
      <>
        {block('top10_holders', '前十大股东', holderTable('holders'), '仅展示观察日期前已公告的报告期，数量变化按可比名单计算。')}
        {block('top10_floatholders', '前十大流通股东', holderTable('floatHolders'))}
        {block('stk_holdernumber', '股东户数', <ResearchTable rows={numbers} columns={[dateColumn('end_date', '统计截止日'), dateColumn('ann_date', '公告日期'), { ...numberColumn('holder_num', '股东户数（户）'), render: (v) => numberText(v, 0) }]} />)}
      </>
    );
  } else if (section === 'business') {
    const items = businessRows(rows('fina_mainbz'));
    content = block('fina_mainbz', `主营构成 · ${dateText(items[0]?.end_date)}`, <ResearchTable rows={items} columns={[textColumn('bz_item', '主营项目', 260), textColumn('curr_type', '币种', 90), numberColumn('bz_sales', '主营收入（亿元）', 1e8), numberColumn('bz_profit', '主营利润（亿元）', 1e8), numberColumn('bz_cost', '主营成本（亿元）', 1e8), numberColumn('listed_share', '列示收入占比（%）'), numberColumn('profit_margin', '主营利润率（%）')]} />, '按观察日期前的最近报告期展示接口当前返回的构成。该接口没有公告日期，不能据此认定历史当时已知；收入占比仅在同币种、无缺失且无合计项目时按列示收入计算，不能替代公司总收入占比。');
  } else if (section === 'capital') {
    const stats = newest(rows('pledge_stat'), 'end_date');
    content = (
      <>
        {block('pledge_stat', '股票质押统计', <ResearchTable rows={stats} columns={[dateColumn('end_date', '统计截止日'), numberColumn('pledge_ratio', '质押比例（%）'), numberColumn('pledge_count', '质押笔数'), numberColumn('unrest_pledge', '无限售质押（万股）'), numberColumn('rest_pledge', '限售质押（万股）')]} />, '按统计截止日过滤；接口未提供公告日期，历史值为本次查询返回的统计资料。')}
        {block('pledge_detail', '质押明细', <ResearchTable rows={newest(rows('pledge_detail'), 'ann_date')} columns={[dateColumn('ann_date', '公告日期'), textColumn('holder_name', '股东名称', 260), numberColumn('pledge_amount', '质押数量（万股）'), dateColumn('start_date', '质押开始'), dateColumn('end_date', '约定到期'), dateColumn('release_date', '已披露解押日期')]} />, '展示近120天公告；约定到期日可以晚于观察日期，未取得解押记录不代表仍在质押。')}
        {block('repurchase', '股票回购', <ResearchTable rows={newest(rows('repurchase'), 'ann_date')} columns={[dateColumn('ann_date', '公告日期'), textColumn('proc', '进度', 150), dateColumn('end_date', '回购截止日'), numberColumn('vol', '回购数量（万股）', 10000), numberColumn('amount', '回购金额（亿元）', 1e8), numberColumn('high_limit', '价格上限（元）'), numberColumn('low_limit', '价格下限（元）')]} />, '展示近120天公告记录，方案与进展可能重复披露，不将各条记录累加；数量和金额含义以披露进度为准。')}
      </>
    );
  } else if (section === 'financial') {
    const items = (data?.financial || []).filter((r) => reportPeriod === 'all' || String(r.end_date).endsWith(reportPeriod));
    content = (
      <>
        <p className="live-research-note">近5年，按报告期对齐、仅展示观察日期前已披露资料。收入、利润、现金流为报告期累计值；不同季度累计值不可直接比较。缺失值以“—”和曲线断点展示。</p>
        {data?.sources.map((s) => (s.state === 'error' ? block(s.source, {
          balancesheet: '资产负债表', income: '利润表', fina_indicator: '财务指标', cashflow: '现金流量表',
        }[s.source] || s.source, null) : (
          <p key={s.source} className="live-research-note">
            {sourceLabels[s.source]}
            {' '}
            ·
            {' '}
            {s.rows.length ? `已取得 ${s.rows.length} 条记录` : '所选范围内接口未返回记录'}
            {` · 获取于 ${beijingTime(s.fetchedAt)}`}
          </p>
        )))}
        {trend(items, [series('total_assets', '总资产'), series('total_liab', '总负债')], 'end_date')}
        {trend(items, [series('revenue', '营业收入'), series('n_income_attr_p', '归母净利润'), series('n_cashflow_act', '经营现金流净额')], 'end_date')}
        <ResearchTable rows={items} columns={[dateColumn('end_date', '报告期'), numberColumn('revenue', '营业收入（亿元）', 1e8), numberColumn('n_income_attr_p', '归母净利润（亿元）', 1e8), numberColumn('profit_dedt', '扣非净利润（亿元）', 1e8), numberColumn('n_cashflow_act', '经营现金流（亿元）', 1e8), numberColumn('or_yoy', '收入同比（%）', 1, true), numberColumn('netprofit_yoy', '净利润同比（%）', 1, true), numberColumn('roe', 'ROE（%）'), numberColumn('grossprofit_margin', '毛利率（%）'), numberColumn('debt_to_assets', '资产负债率（%）'), dateColumn('income_ann_date', '利润表公告'), dateColumn('indicator_ann_date', '指标公告'), dateColumn('cashflow_ann_date', '现金流公告'), numberColumn('total_assets', '总资产（亿元）', 1e8), numberColumn('total_liab', '总负债（亿元）', 1e8), numberColumn('total_hldr_eqy_exc_min_int', '归母股东权益（亿元）', 1e8), dateColumn('balance_ann_date', '资产负债表公告')]} />
      </>
    );
  } else {
    content = (
      <>
        {block('stk_surv', '机构调研', <ResearchTable
          rows={newest(rows('stk_surv'), 'surv_date')}
          columns={[dateColumn('surv_date', '调研日期'), textColumn('rece_mode', '接待方式', 150), { ...textColumn('rece_org', '参与机构', 280), ellipsis: true }, { ...textColumn('fund_visitors', '机构参与人员', 220), ellipsis: true }, {
            title: '调研资料', key: 'detail', width: 130, render: (_, r) => <InteractionButton intent="preview" onClick={() => setInspect(r)}>查看内容</InteractionButton>,
          }]}
        />, '展示观察日前120天的调研活动。调研日期是活动发生时间，接口未提供公开披露时间，不能用于还原历史当时可知信息。')}
        <Drawer title={`${dateText(inspect?.surv_date)} · 机构调研资料`} open={!!inspect} onClose={() => setInspect(null)} width="min(760px, 100vw)" destroyOnClose>
          {inspect && (
          <>
            <Descriptions column={1} items={[{ key: 'org', label: '参与机构', children: inspect.rece_org || '—' }, { key: 'type', label: '机构类型', children: inspect.org_type || '—' }, { key: 'visitors', label: '机构参与人员', children: inspect.fund_visitors || '—' }, { key: 'people', label: '接待人员', children: inspect.comp_rece || '—' }]} />
            <p className="live-research-content">{inspect.content || '接口未提供调研内容'}</p>
          </>
          )}
        </Drawer>
      </>
    );
  }
  return (
    <>
      <div className="live-research-filters">
        {section === 'financial' && <Select style={{ width: 180 }} aria-label="报告期类型" value={reportPeriod} onChange={(v) => setReportPeriod(String(v))} options={[{ label: '全部报告期', value: 'all' }, { label: '年报', value: '1231' }, { label: '半年报', value: '0630' }, { label: '一季报', value: '0331' }, { label: '三季报', value: '0930' }]} />}
        {section === 'business' && <Segmented aria-label="主营分类" options={[{ label: '按产品', value: 'P' }, { label: '按地区', value: 'D' }, { label: '按行业', value: 'I' }]} value={businessType} onChange={(v) => setBusinessType(String(v))} />}
        {section === 'institutions' && (
          <Link href={`/basic/stock/broker-picks/?${new URLSearchParams({ month: date.slice(0, 7), q: code })}`}>查看该股券商月度金股</Link>
        )}
        <Button onClick={state.retry} loading={state.loading}>刷新资料</Button>
      </div>
      <RequestState state={state}>{content}</RequestState>
    </>
  );
}

export default function StockResearch({ code, date }: { code: string; date: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('funds');
  return (
    <Card className="live-research" title="个股研究" extra={<InteractionButton intent="expand" expanded={open} onClick={() => setOpen(!open)} disabled={!date}>{open ? '收起资料' : '查看资料'}</InteractionButton>}>
      {open ? (
        <>
          <p className="live-research-note">
            观察日期
            {date}
            {' '}
            · 选择分区查询最新已发布资料
          </p>
          <Tabs activeKey={active} onChange={setActive} items={sections.map(([key, label]) => ({ key, label }))} />
          <StockPanel key={`${code}-${date}-${active}`} code={code} date={date} section={active} />
        </>
      ) : <p className="live-research-note live-research-empty">资金、两融、股东、主营、质押回购、财务趋势及机构调研。展开后按所选分区获取资料。</p>}
    </Card>
  );
}
