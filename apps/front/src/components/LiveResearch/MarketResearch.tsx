'use client';

import { useState } from 'react';
import {
  Button, Card, Input, Tabs,
} from 'antd';
import Link, { InteractionButton } from '@/components/Interaction';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { finiteNumber } from '@/utils/format';
import { marginTotals, newest } from './data';
import {
  dateColumn, numberColumn, ResearchChart, ResearchTable, RequestState, SourceBlock, textColumn, useResearch,
} from './common';

function MarginRanking({ date }: { date: string }) {
  const { user } = useAccount();
  const state = useResearch('market', { date, section: 'ranking' });
  const [keyword, setKeyword] = useState('');
  const source = state.data?.sources.find((s) => s.source === 'margin_detail');
  const eligible = state.data?.sources.find((s) => s.source === 'margin_secs');
  const names = new Map((eligible?.rows || []).map((r) => [r.ts_code, r.name]));
  const filtered = (items: Record<string, any>[]) => items.filter((r) => !keyword || `${r.ts_code} ${r.name || ''}`.includes(keyword));
  const rows = filtered((source?.rows || []).map((r) => {
    const buy = finiteNumber(r.rzmre); const repay = finiteNumber(r.rzche);
    return { ...r, name: names.get(r.ts_code) || '', net_buy: buy != null && repay != null ? buy - repay : null };
  })).sort((a, b) => (finiteNumber(b.net_buy) ?? -Infinity) - (finiteNumber(a.net_buy) ?? -Infinity));
  const stockColumn = { ...textColumn('ts_code', '标的代码', 160), render: (v: string) => (/^\d{6}\.(SH|SZ|BJ)$/.test(v) && /^[034689]/.test(v) && allowedPath(user, '/basic/stock') ? <Link href={`/basic/stock/detail/?${new URLSearchParams({ code: v, date })}`}>{v}</Link> : v) };
  return (
    <>
      <div className="live-research-filters">
        <Input.Search placeholder="搜索名称或代码" aria-label="搜索两融标的" value={keyword} onChange={(e) => setKeyword(e.target.value.trim())} allowClear style={{ width: 260, maxWidth: '100%' }} />
        <Button onClick={state.retry} loading={state.loading}>刷新榜单</Button>
      </div>
      <RequestState state={state}>
        <SourceBlock source={source} title={`${date} · 融资净买入榜`} retry={state.retry} empty={!rows.length} note="只展示所选交易日，包含接口返回的股票及ETF标的。净买入为买入额减偿还额，余额变化与净买入并非同一指标；交易所数据存在披露滞后。">
          <ResearchTable rows={rows} columns={[stockColumn, textColumn('name', '标的名称', 180), numberColumn('net_buy', '融资净买入（亿元）', 1e8, true), numberColumn('rzye', '融资余额（亿元）', 1e8), numberColumn('rqye', '融券余额（亿元）', 1e8)]} />
        </SourceBlock>
        <SourceBlock source={eligible} title="盘前融资融券标的" retry={state.retry} empty={!filtered(eligible?.rows || []).length} note="标的名单独立于当日交易明细，数据缺失不代表不具备两融资格。">
          <ResearchTable rows={filtered(eligible?.rows || [])} columns={[stockColumn, textColumn('name', '标的名称', 220), textColumn('exchange', '交易所', 120), dateColumn('trade_date', '名单日期')]} />
        </SourceBlock>
      </RequestState>
    </>
  );
}

function MarketPanel({ date }: { date: string }) {
  const [tab, setTab] = useState('funds');
  const state = useResearch('market', { date, section: tab }, tab !== 'ranking');
  const source = state.data?.sources.find((s) => s.source === (tab === 'funds' ? 'moneyflow_mkt_dc' : 'margin'));
  const rows = newest(source?.rows || []);
  const totals = marginTotals(rows);
  return (
    <>
      <div className="live-research-filters">
        {tab !== 'ranking' && <Button onClick={state.retry} loading={state.loading}>刷新资料</Button>}
        <span className="live-research-note">
          观察日期
          {date}
          {' '}
          {tab === 'ranking' ? ' · 当日榜单；数据范围独立于本页行情筛选' : ' · 近90天；数据范围独立于本页行情筛选'}
        </span>
      </div>
      <Tabs activeKey={tab} onChange={setTab} items={[{ key: 'funds', label: '全市场资金' }, { key: 'margin', label: '市场两融' }, { key: 'ranking', label: '融资净买入榜与标的' }]} />
      {tab === 'ranking' ? <MarginRanking date={date} /> : (
        <RequestState state={state}>
          <SourceBlock source={source} retry={state.retry} title={tab === 'funds' ? '沪深市场主力资金' : '交易所融资融券'} note={tab === 'funds' ? '东方财富主力资金口径，源金额为元，展示时换算为亿元。数据覆盖沪深市场，不含北交所。' : '趋势图为沪深两市合计，任一交易所缺失时保留断点；明细保留接口返回的各交易所，金额统一为亿元。'}>
            {tab === 'funds' ? (
              <>
                <ResearchChart rows={rows} unit="亿元" series={[{ key: 'net_amount', name: '主力净流入', divisor: 1e8 }]} />
                <ResearchTable rows={rows} columns={[dateColumn('trade_date'), numberColumn('net_amount', '主力净流入（亿元）', 1e8, true), numberColumn('net_amount_rate', '净流入占比（%）', 1, true), numberColumn('buy_elg_amount', '超大单净流入（亿元）', 1e8, true), numberColumn('buy_lg_amount', '大单净流入（亿元）', 1e8, true)]} />
              </>
            ) : (
              <>
                <ResearchChart rows={totals} unit="亿元" series={[{ key: 'rzye', name: '沪深融资余额', divisor: 1e8 }, { key: 'rqye', name: '沪深融券余额', divisor: 1e8 }]} />
                <ResearchTable rows={rows} columns={[dateColumn('trade_date'), { ...textColumn('exchange_id', '交易所', 130), render: (v: string) => ({ SSE: '上交所', SZSE: '深交所', BSE: '北交所' }[v] || v) }, numberColumn('rzye', '融资余额（亿元）', 1e8), numberColumn('rzmre', '融资买入（亿元）', 1e8), numberColumn('rzche', '融资偿还（亿元）', 1e8), numberColumn('rqye', '融券余额（亿元）', 1e8), numberColumn('rzrqye', '两融余额（亿元）', 1e8)]} />
              </>
            )}
          </SourceBlock>
        </RequestState>
      )}
    </>
  );
}

export default function MarketResearch({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="live-research" title="市场资金与两融" extra={<InteractionButton intent="expand" expanded={open} disabled={!date} onClick={() => setOpen(!open)}>{open ? '收起资料' : '查看资料'}</InteractionButton>}>
      {open ? <MarketPanel key={date} date={date} /> : <p className="live-research-note live-research-empty">查看沪深市场主力资金及交易所两融数据，展开后获取资料。</p>}
    </Card>
  );
}

function SectorPanel({ date, kind }: { date: string; kind: string }) {
  const { user } = useAccount();
  const state = useResearch('sectors', { date, kind });
  const [keyword, setKeyword] = useState('');
  const source = state.data?.sources[0];
  const name = kind === 'N' ? 'name' : 'industry';
  const rows = (source?.rows || []).filter((r) => !keyword || `${r[name]} ${r.ts_code}`.includes(keyword)).sort((a, b) => (finiteNumber(b.net_amount) ?? -Infinity) - (finiteNumber(a.net_amount) ?? -Infinity));
  return (
    <>
      <div className="live-research-filters">
        <Input.Search aria-label="搜索资金板块" placeholder="搜索板块名称或代码" value={keyword} onChange={(e) => setKeyword(e.target.value.trim())} allowClear style={{ width: 260, maxWidth: '100%' }} />
        <Button onClick={state.retry} loading={state.loading}>刷新资料</Button>
      </div>
      <RequestState state={state}>
        <SourceBlock source={source} title={`${date} · ${kind === 'N' ? '概念' : '行业'}资金排名`} retry={state.retry} note="同花顺当日资金口径，金额为亿元。只展示所选日期，未返回当日数据时不回退到其他日期；板块成分可能重叠，不将各板块净流入累加。" empty={!rows.length}>
          <ResearchTable
            rows={rows}
            columns={[{
              title: '资金排名', key: 'rank', width: 110, render: (_, r) => [...(source?.rows || [])].sort((a, b) => (finiteNumber(b.net_amount) ?? -Infinity) - (finiteNumber(a.net_amount) ?? -Infinity)).findIndex((v) => v.ts_code === r.ts_code) + 1,
            }, {
              ...textColumn(name, '板块名称', 220),
              render: (v, r) => (allowedPath(user, '/analysis/sectors') ? (
                <Link href={`/analysis/sectors/?${new URLSearchParams({
                  date, scope: 'all', kind, code: r.ts_code,
                })}`}
                >
                  {v || r.ts_code}
                </Link>
              ) : v || r.ts_code),
            }, numberColumn('net_amount', '净流入（亿元）', 1, true), numberColumn('net_buy_amount', '流入（亿元）'), numberColumn('net_sell_amount', '流出（亿元）'), { ...numberColumn('company_num', '成分股数'), render: (v) => finiteNumber(v)?.toLocaleString('zh-CN') || '—' }]}
          />
        </SourceBlock>
      </RequestState>
    </>
  );
}

export function SectorResearch({ date, kind }: { date: string; kind: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="live-research" title={`${kind === 'N' ? '概念' : '行业'}资金流向`} extra={<InteractionButton intent="expand" expanded={open} disabled={!date} onClick={() => setOpen(!open)}>{open ? '收起资料' : '查看资料'}</InteractionButton>}>
      {open ? <SectorPanel key={`${date}-${kind}`} date={date} kind={kind} /> : <p className="live-research-note live-research-empty">查看所选日期的板块资金排名，展开后获取资料。</p>}
    </Card>
  );
}
