'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button, Checkbox, Grid, Input, Modal, Select, Space, Tag, Tooltip,
} from 'antd';
import Link from '@/components/Interaction';
import Table from '@/components/DataTable';
import SectorLinks from '@/components/SectorLinks';
import {
  StrategySignals, TrajectoryBoard, TrajectoryCell, TrajectoryRow,
} from '@/api/market';
import { changeClass, numberText } from '@/utils/format';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { EyeOutlined } from '@ant-design/icons';
import SectorFilter from '@/components/SectorFilter';
import { filterTrajectories } from '../chains/chains-display';
import useMarketData from './useMarketData';
import { useMarket } from './MarketContext';
import { DataState, SectionTitle } from './MarketCharts';
import { marketHref } from './market-navigation';
import '../chains/chains.css';

function HistoricalSectors({ date, code }: { date: string; code: string }) {
  const request = useMarketData<TrajectoryBoard>('trajectories', {
    date, code, trajectoryDays: 1, days: 20,
  });
  const stock = request.data?.date === date ? request.data.items.find((row) => row.tsCode === code) : undefined;
  return (
    <DataState loading={request.loading} error={request.error} retry={request.retry} empty={!stock}>
      {stock && (
      <>
        <div className="mb-16">
          所属行业：
          <SectorLinks stock={stock} date={date} />
        </div>
        <div className="mb-16">
          所属概念：
          <SectorLinks stock={stock} type="N" date={date} />
        </div>
      </>
      )}
    </DataState>
  );
}

export default function StrongTrajectories({ sector, onSectorChange, active }: { sector?: string; onSectorChange: (value?: string) => void; active: boolean }) {
  const screens = Grid.useBreakpoint();
  const { date, scope } = useMarket(); const { user } = useAccount(); const params = useSearchParams();
  const router = useRouter();
  const code = /^\d{6}\.(SH|SZ|BJ)$/.test(params.get('code') || '') ? params.get('code') : undefined;
  const [count, setCount] = useState(10);
  const keyword = params.get('keyword') ?? code ?? '';
  const setKeyword = (value: string) => {
    const query = new URLSearchParams(params.toString());
    query.delete('code');
    if (value) query.set('keyword', value); else query.delete('keyword');
    router.replace(`/analysis/chains/?${query}`, { scroll: false });
  };
  const [state, setState] = useState('all');
  const [showSignals, setShowSignals] = useState(false); const [detail, setDetail] = useState<{ row: TrajectoryRow; cell: TrajectoryCell } | null>(null);
  const request = useMarketData<TrajectoryBoard>('trajectories', {
    trajectoryDays: count, days: 20, sector, ...(code ? { code } : {}),
  }, active);
  const signals = useMarketData<StrategySignals>('strategy-signals', { trajectoryDays: count, days: 20, ...(code ? { code } : {}) }, active && showSignals && allowedPath(user, '/strategy'));
  useEffect(() => { setDetail(null); }, [date, scope, sector, count, code, keyword, active]);
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
    <div className="chains-trajectory">
      <SectionTitle title="强势股多日轨迹" description="跟踪区间内涨停、炸板股票；未涨停且有成交时高度为0，缺数据保留空态。" />
      <div className="chains-trajectory-filters">
        <SectorFilter value={sector} onChange={onSectorChange} />
        <Input.Search aria-label="搜索轨迹股票" allowClear placeholder="股票名称／代码" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 190 }} />
        <Select aria-label="轨迹范围" value={count} onChange={setCount} options={[5, 10, 20].map((value) => ({ value, label: `近${value}个交易日` }))} />
        <Select aria-label="所选日状态" value={state} onChange={setState} style={{ width: 148 }} options={[{ value: 'all', label: '所选日全部状态' }, ...['连板', '首板', '断板', '炸板', '跌停', '交易', '无成交', '待补齐'].map((value) => ({ value, label: value === '交易' ? '普通交易（未涨停）' : value }))]} />
        {allowedPath(user, '/strategy') && <Checkbox checked={showSignals} onChange={(e) => setShowSignals(e.target.checked)}>显示策略命中</Checkbox>}
        {!!keyword && <Button size="small" onClick={() => setKeyword('')}>清除股票筛选</Button>}
      </div>
      <p className="chains-trajectory-hint">
        状态筛选以
        {date}
        {' '}
        为准；此处筛选仅用于多日轨迹。点击每日状态查看当日详情。
      </p>
      {allowedPath(user, '/strategy') && (
        <p className="chains-trajectory-hint">
          策略命中：按现行策略的默认参数回看各交易日，★ 后的数字是命中的策略数量。点击每日状态可查看策略名称，并进入策略选股查看规则与结果。
          {showSignals && <span>{signals.loading ? ' 正在加载策略数据…' : signals.error || ' 未完成计算的日期显示“待更新”。'}</span>}
        </p>
      )}
      <DataState loading={request.loading} error={request.error} retry={request.retry} empty={!data?.ready}>
        <Table<TrajectoryRow>
          rowKey="tsCode"
          size="small"
          bordered
          pagination={false}
          maxBodyHeight={960}
          minBodyHeight={120}
          bottomSpacing={24}
          scroll={{ x: (screens.sm ? 260 : 140) + (data?.dates.length || count) * 105 }}
          locale={{ emptyText: keyword || state !== 'all' || sector ? '当前筛选条件下无匹配股票' : '当前区间内无涨停或炸板股票' }}
          dataSource={filterTrajectories(data?.items || [], date, keyword, state)}
          columns={[
            {
              title: '股票',
              fixed: 'left',
              width: 140,
              render: (_, r) => (
                <Space direction="vertical" size={0}>
                  <strong>{r.name}</strong>
                  <span className="market-note">{r.tsCode}</span>
                  <div className="chains-mobile-current">
                    <span className="market-note">{`${date.slice(5)} 状态`}</span>
                    <strong>{r.cells.find((c) => c.date === date)?.state === '交易' ? '未涨停' : r.cells.find((c) => c.date === date)?.state || '待更新'}</strong>
                  </div>
                </Space>
              ),
            },
            {
              title: <Tooltip title={`所选交易日 ${date}，点击表头按连板高度排序`}>{`${date.slice(5)} 状态`}</Tooltip>,
              key: 'current',
              responsive: ['sm'],
              width: 120,
              fixed: 'left',
              sorter: (a, b) => (a.cells.find((c) => c.date === date)?.height ?? -1) - (b.cells.find((c) => c.date === date)?.height ?? -1),
              render: (_, row) => {
                const cell = row.cells.find((c) => c.date === date);
                return (
                  <div className="chains-current-cell">
                    <strong>{cell?.state === '交易' ? '未涨停' : cell?.state || '待更新'}</strong>
                    <span className={changeClass(cell?.pctChg)}>
                      {numberText(cell?.pctChg, 2, true)}
                      {cell?.pctChg == null ? '' : '%'}
                    </span>
                  </div>
                );
              },
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
                  <button type="button" className={`trajectory-cell ${changeClass(cell.pctChg)}`} aria-haspopup="dialog" title="打开当日交易详情" onClick={() => setDetail({ row, cell })} aria-label={`预览${row.name} ${day} ${cell.state}`}>
                    <span className="trajectory-state">{cell.state === '交易' ? '未涨停' : cell.state}</span>
                    <span>
                      {numberText(cell.pctChg, 2, true)}
                      {cell.pctChg == null ? '' : '%'}
                    </span>
                    {showSignals && <small>{readySignals.has(day) && hits.length ? `★ ${hits.length}${pendingSignals(day).length ? ' / 待更新' : ''}` : signalText(day).replace('未命中', '')}</small>}
                    <span className="interaction-preview-caption" aria-hidden="true">
                      <EyeOutlined aria-hidden />
                    </span>
                  </button>
                );
              },
            })),
          ]}
        />
      </DataState>
      <Modal className="chains-detail-modal" width={640} style={{ top: 40, maxWidth: 'calc(100vw - 32px)' }} title={detail ? `${detail.row.name} · ${detail.cell.date} 交易详情` : ''} open={!!detail} onCancel={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>关闭</Button>}>
        {detail && (
        <>
          <p className="chains-detail-caption">查看该股票在所选交易日的连板状态、行情及所属行业／概念。</p>
          <dl className="chains-detail-metrics">
            <div>
              <dt>连板状态</dt>
              <dd>{detail.cell.state === '交易' ? '未涨停' : detail.cell.state}</dd>
            </div>
            <div>
              <dt>当日涨跌幅</dt>
              <dd className={changeClass(detail.cell.pctChg)}>
                {numberText(detail.cell.pctChg, 2, true)}
                {detail.cell.pctChg == null ? '' : '%'}
              </dd>
            </div>
            <div>
              <dt>收盘价（元）</dt>
              <dd>{numberText(detail.cell.close, 2)}</dd>
            </div>
            <div>
              <dt>成交额（亿元）</dt>
              <dd>{numberText(detail.cell.amount, 2)}</dd>
            </div>
          </dl>
          <HistoricalSectors key={`${detail.row.tsCode}:${detail.cell.date}`} date={detail.cell.date} code={detail.row.tsCode} />
          <Space wrap className="chains-detail-actions">
            {allowedPath(user, '/basic/stock/detail') && <Link href={`/basic/stock/detail/?${new URLSearchParams({ code: detail.row.tsCode, date: detail.cell.date })}`}>查看股票资料</Link>}
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
      </Modal>
    </div>
  );
}
