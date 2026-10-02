'use client';

import { useMemo, useState } from 'react';
import {
  Checkbox, Drawer, Input, Select, Space, Tag, Tooltip,
} from 'antd';
import Link from 'next/link';
import Table from '@/components/DataTable';
import SectorLinks from '@/components/SectorLinks';
import {
  StrategySignals, TrajectoryBoard, TrajectoryCell, TrajectoryRow,
} from '@/api/market';
import { changeClass, numberText } from '@/utils/format';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { useSearchParams } from 'next/navigation';
import SectorFilter, { useSectorSelection } from '@/components/SectorFilter';
import useMarketData from './useMarketData';
import { useMarket } from './MarketContext';
import { DataState, Metrics, SectionTitle } from './MarketCharts';
import { marketHref } from './market-navigation';

export default function StrongTrajectories() {
  const { date, scope } = useMarket(); const { user } = useAccount(); const params = useSearchParams();
  const code = /^\d{6}\.(SH|SZ|BJ)$/.test(params.get('code') || '') ? params.get('code') : undefined;
  const { sector, setSector } = useSectorSelection(); const [count, setCount] = useState(10); const [keyword, setKeyword] = useState('');
  const [showSignals, setShowSignals] = useState(false); const [detail, setDetail] = useState<{ row: TrajectoryRow; cell: TrajectoryCell } | null>(null);
  const request = useMarketData<TrajectoryBoard>('trajectories', {
    trajectoryDays: count, days: 20, sector, ...(code ? { code } : {}),
  });
  const signals = useMarketData<StrategySignals>('strategy-signals', { trajectoryDays: count, days: 20, ...(code ? { code } : {}) }, showSignals && allowedPath(user, '/strategy'));
  const data = request.data?.date === date ? request.data : null;
  const signalMap = useMemo(() => new Map(signals.data?.items.map((r) => [`${r.date}:${r.tsCode}`, r.strategies]) || []), [signals.data]);
  const labels = new Map(signals.data?.strategies.map((r) => [r.key, r.label]) || []);
  const readySignals = new Set(!signals.loading && !signals.error ? Object.values(signals.data?.readyByStrategy || { legacy: signals.data?.readyDates || [] }).flat() : []);
  const pendingSignals = (day: string) => signals.data?.strategies.filter((s) => !(signals.data?.readyByStrategy?.[s.key] || signals.data?.readyDates || []).includes(day)) || [];
  const selectedSignals = detail && readySignals.has(detail.cell.date) ? signalMap.get(`${detail.cell.date}:${detail.row.tsCode}`) || [] : [];
  const signalText = (day: string) => {
    if (signals.loading) return '加载中…';
    if (signals.error) return '加载失败';
    if (!readySignals.has(day)) return '策略数据待更新';
    if (pendingSignals(day).length) return '部分策略待更新';
    return '未命中';
  };
  const recapType = (state: string) => {
    if (state === '炸板') return 'Z';
    if (state === '跌停') return 'D';
    return 'U';
  };
  return (
    <>
      <div className="market-section-toolbar">
        <SectionTitle title="强势股多日轨迹" description="跟踪区间内涨停、炸板股票；未涨停且有成交时高度为0，缺数据保留空态。策略按现行规则回看。" />
        <Space wrap>
          <SectorFilter value={sector} onChange={setSector} />
          <Input.Search aria-label="搜索轨迹股票" allowClear placeholder="股票名称／代码" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 190 }} />
          <Select aria-label="轨迹范围" value={count} onChange={setCount} options={[5, 10, 20].map((value) => ({ value, label: `近${value}个交易日` }))} />
          {allowedPath(user, '/strategy') && <Checkbox checked={showSignals} onChange={(e) => setShowSignals(e.target.checked)}>策略标记</Checkbox>}
          {code && <Link href={marketHref('/analysis/chains', { date, scope }, { view: 'trajectory' })}>显示全部股票</Link>}
        </Space>
      </div>
      {showSignals && <p className="market-note">{signals.loading ? '策略标记加载中…' : signals.error || '★ 表示命中默认参数策略，点击查看；数据未补齐显示“待更新”。'}</p>}
      <DataState loading={request.loading} error={request.error} retry={request.retry} empty={!data?.ready}>
        <Table<TrajectoryRow>
          rowKey="tsCode"
          size="small"
          bordered
          pagination={false}
          maxBodyHeight={560}
          minBodyHeight={360}
          scroll={{ x: 200 + count * 105 }}
          dataSource={data?.items.filter((r) => `${r.name} ${r.tsCode}`.includes(keyword.trim()))}
          columns={[
            {
              title: '股票',
              fixed: 'left',
              width: 180,
              render: (_, r) => (
                <Space direction="vertical" size={0}>
                  <strong>{r.name}</strong>
                  <span className="market-note">{r.tsCode}</span>
                </Space>
              ),
            },
            ...(data?.dates || []).map((day) => ({
              title: <Tooltip title={day}>{day.slice(5)}</Tooltip>,
              key: day,
              width: 105,
              align: 'center' as const,
              render: (_:unknown, row:TrajectoryRow) => {
                const cell = row.cells.find((c) => c.date === day)!;
                const hits = signalMap.get(`${day}:${row.tsCode}`) || [];
                return (
                  <button type="button" className={`trajectory-cell ${changeClass(cell.pctChg)}`} onClick={() => setDetail({ row, cell })} aria-label={`${row.name} ${day} ${cell.state}`}>
                    <span className="trajectory-state">{cell.state === '交易' ? '—' : cell.state}</span>
                    <span>
                      {numberText(cell.pctChg, 2, true)}
                      {cell.pctChg == null ? '' : '%'}
                    </span>
                    {showSignals && <small>{readySignals.has(day) && hits.length ? `★ ${hits.length}${pendingSignals(day).length ? ' / 待更新' : ''}` : signalText(day).replace('未命中', '')}</small>}
                  </button>
                );
              },
            })),
          ]}
        />
      </DataState>
      <Drawer width={560} title={detail ? `${detail.row.name} - ${detail.cell.date}` : ''} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
        <>
          <Metrics items={[{ title: '状态', value: null, display: detail.cell.state }, {
            title: '涨跌幅', value: detail.cell.pctChg, suffix: '%', digits: 2, signed: true,
          }, { title: '收盘价', value: detail.cell.close, digits: 2 }, {
            title: '成交额', value: detail.cell.amount, suffix: '亿元', digits: 2,
          }]}
          />
          <p>
            <SectorLinks stock={detail.row} date={date} />
            {' '}
            <SectorLinks stock={detail.row} type="N" date={date} />
          </p>
          <Space wrap>
            {allowedPath(user, '/analysis/limits') && ['首板', '炸板', '跌停'].some((s) => detail.cell.state === s) && <Link href={marketHref('/analysis/limits', { date: detail.cell.date, scope }, { keyword: detail.row.tsCode, type: recapType(detail.cell.state) })}>查看复盘明细</Link>}
            {allowedPath(user, '/analysis/limits') && /\d+板/.test(detail.cell.state) && <Link href={marketHref('/analysis/limits', { date: detail.cell.date, scope }, { keyword: detail.row.tsCode, type: 'U' })}>查看复盘明细</Link>}
          </Space>
          {showSignals && (
          <>
            <SectionTitle title="当日策略命中" />
            <Space wrap>
              {selectedSignals.map((key) => <Link key={key} href={`/strategy/?${new URLSearchParams({ date: detail.cell.date, strategyType: key, code: detail.row.tsCode })}`}><Tag>{labels.get(key) || key}</Tag></Link>)}
              {!selectedSignals.length && signalText(detail.cell.date)}
            </Space>
            {!!selectedSignals.length && !!pendingSignals(detail.cell.date).length && (
            <p className="market-note">
              {pendingSignals(detail.cell.date).map((s) => s.label).join('、')}
              数据待补齐
            </p>
            )}
          </>
          )}
        </>
        )}
      </Drawer>
    </>
  );
}
