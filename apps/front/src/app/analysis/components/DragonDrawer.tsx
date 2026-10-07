'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/Interaction';
import { StockLink } from '@/components/StockActions';
import {
  Alert, Button, Drawer, Empty, Tabs, Tag, Tooltip,
} from 'antd';
import Table from '@/components/DataTable';
import HelpTooltip from '@/components/HelpTooltip';
import { errorMessage } from '@/api/errors';
import { DragonData, marketRequest } from '@/api/market';
import { getBasicActiveFundsList } from '@/api/services';
import { NSGetBasicActiveFundsList } from '@/api/services.types';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { matchingFunds } from '@/utils/active-funds';
import { changeClass } from '@/utils/format';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { numberText, DataState } from './MarketCharts';
import { fundingPeriod, periodLabels, reasonLabel } from '../dragon/dragon-display';
import './dragon.sass';

type Seat = DragonData['seats'][number];
const money = (value: number | null, signed = false) => numberText(value == null ? null : value / 10000, 2, signed);

function SeatName({ org, funds, date }: { org: string; funds: NSGetBasicActiveFundsList.IRes; date: string }) {
  const { user } = useAccount();
  const matched = matchingFunds(funds, org);
  if (!allowedPath(user, '/basic/active-funds')) return <span>{org}</span>;
  return matched.length ? (
    <div className="dragon-org">
      <Link href={`/basic/active-funds/detail/?org=${encodeURIComponent(org)}&date=${date}`} title="查看基础数据中的关联营业部">{org}</Link>
      <div>{matched.map((fund) => <Tag key={fund.name}>{fund.name}</Tag>)}</div>
    </div>
  ) : <Link href={`/basic/active-funds/detail/?org=${encodeURIComponent(org)}&date=${date}`} className="dragon-org">{org}</Link>;
}

function SeatTable({
  seats, side, funds, date,
}: { seats: Seat[]; side: string; funds: NSGetBasicActiveFundsList.IRes; date: string }) {
  const field = side === '0' ? 'buy' : 'sell';
  const rows = [...seats].sort((a, b) => (b[field] ?? -Infinity) - (a[field] ?? -Infinity));
  const maxAmount = Math.max(0, ...rows.map((r) => r[field] || 0));
  const label = { 0: '买入榜', 1: '卖出榜' }[side] || '其他席位';
  return (
    <section className={`dragon-seat-section ${side === '0' ? 'is-buy' : 'is-sell'}`}>
      <div className="dragon-seat-heading">
        <strong>{label}</strong>
        <span>
          {rows.length}
          {' '}
          个席位，单位：万元
        </span>
      </div>
      <Table<Seat>
        className="dragon-desktop-table"
        size="middle"
        pagination={false}
        autoHeight
        scroll={{ x: 640 }}
        rowKey={(r) => `${r.side}:${r.exalter}`}
        dataSource={rows}
        locale={{ emptyText: '暂无席位记录' }}
        columns={[
          {
            title: '排名', key: 'rank', width: 52, render: (_, row, index) => <span className="dragon-rank">{index + 1}</span>,
          },
          {
            title: '营业部 / 席位',
            dataIndex: 'exalter',
            width: 310,
            render: (org: string) => <SeatName date={date} org={org} funds={funds} />,
          },
          ...[{ key: 'buy' as const, title: '买入', className: 'quote-up' }, { key: 'sell' as const, title: '卖出', className: 'quote-down' }, { key: 'netBuy' as const, title: '净买入', className: '' }].map((column) => ({
            title: column.title,
            dataIndex: column.key,
            width: 100,
            align: 'right' as const,
            render: (value: number | null) => (
              <span className={`dragon-amount ${value == null ? '' : column.className || changeClass(value)}`}>
                {column.key === field && value != null && maxAmount > 0 && <span className="dragon-amount-bar" style={{ width: `${(Math.max(0, value) / maxAmount) * 100}%` }} />}
                <span>{money(value, column.key === 'netBuy')}</span>
              </span>
            ),
          })),
        ]}
      />
      <div className="dragon-mobile-seats">
        {!rows.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无席位记录" />}
        {rows.map((row, index) => (
          <div className="dragon-mobile-seat" key={`${row.side}:${row.exalter}`}>
            <div className="dragon-mobile-name">
              <span className="dragon-rank">{index + 1}</span>
              <SeatName date={date} org={row.exalter} funds={funds} />
            </div>
            <div className="dragon-mobile-amounts">
              <div>
                <span>买入</span>
                <strong className="quote-up">{money(row.buy)}</strong>
              </div>
              <div>
                <span>卖出</span>
                <strong className="quote-down">{money(row.sell)}</strong>
              </div>
              <div>
                <span>净买入</span>
                <strong className={changeClass(row.netBuy)}>{money(row.netBuy, true)}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DragonDetails({
  stock, date, reason: linkedReason, onReasonChange, active = true, availableReasons,
}: { stock: { tsCode: string; name: string } | null; date: string; reason?: string; onReasonChange?: (reason: string) => void; active?: boolean; availableReasons?: string[] }) {
  const [data, setData] = useState<DragonData | null>(null);
  const [funds, setFunds] = useState<NSGetBasicActiveFundsList.IRes>([]);
  const [fundsError, setFundsError] = useState('');
  const [fundsAttempt, setFundsAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [reason, setReason] = useState<string | undefined>(linkedReason);
  const stockCode = stock?.tsCode;
  const requestKey = `${stockCode}:${date}`;
  const [loadedKey, setLoadedKey] = useState('');
  const [dataKey, setDataKey] = useState('');
  useEffect(() => setReason(linkedReason), [linkedReason, stock?.tsCode, date]);
  const { user } = useAccount();
  const canReadFunds = allowedPath(user, '/basic/active-funds');
  const opened = !!stock;
  const { runLatestRequest, requestConfig } = useLatestRequest('market-dragon');
  const { runLatestRequest: loadFunds, requestConfig: fundsConfig } = useLatestRequest('dragon-active-funds');
  useEffect(() => {
    if (!opened || !canReadFunds) return;
    loadFunds({
      request: () => getBasicActiveFundsList(fundsConfig),
      onStart: () => { setFunds([]); setFundsError(''); },
      onSuccess: (r) => setFunds(r.data),
      onError: () => setFundsError('营业部关联信息加载失败'),
    });
  }, [opened, canReadFunds, loadFunds, fundsConfig, fundsAttempt]);
  useEffect(() => {
    if (!stockCode || !active) return;
    runLatestRequest({
      request: () => marketRequest<DragonData>('dragon', { date, code: stockCode }, requestConfig),
      onStart: () => { setLoading(true); setError(''); },
      onSuccess: (r) => { setData(r.data); setDataKey(requestKey); },
      onError: (e) => setError(errorMessage(e, '龙虎榜查询失败')),
      onFinally: () => { setLoadedKey(requestKey); setLoading(false); },
    });
  }, [attempt, stockCode, date, requestKey, active, runLatestRequest, requestConfig]);
  const pending = active && (loading || loadedKey !== requestKey);
  const result = dataKey === requestKey ? data : null;
  const reasons = Array.from(new Set([...(result?.summary.map((r) => r.reason) || []), ...(result?.seats.map((r) => r.reason) || [])])).filter((r) => !availableReasons || availableReasons.includes(r));
  return (
    <div className="dragon-details">
      {stock && <StockLink code={stock.tsCode} name={stock.name} date={date} />}
      <div className="dragon-intro">
        <span>按上榜原因查看买卖席位</span>
        <HelpTooltip label="龙虎榜统计口径" title="金额按上榜原因分别统计。关联名称按营业部名录匹配，实际交易主体需另行核实。" />
      </div>
      {canReadFunds && fundsError && <Alert message={fundsError} type="warning" showIcon action={<Button size="small" onClick={() => setFundsAttempt((v) => v + 1)}>重试</Button>} />}
      <DataState loading={pending} error={error} retry={() => setAttempt((v) => v + 1)} empty={!result}>
        {!pending && !error && result && !reasons.length && <Empty description="当日暂无龙虎榜记录" />}
        {!!reasons.length && (
        <Tabs
          key={`${stock?.tsCode}-${date}`}
          className="dragon-reasons"
          activeKey={reason && reasons.includes(reason) ? reason : reasons[0]}
          onChange={(value) => { setReason(value); onReasonChange?.(value); }}
          items={reasons.map((reason) => ({
            key: reason,
            label: <Tooltip title={reason}>{`${periodLabels[fundingPeriod(reason)]}，${reasonLabel(reason)}`}</Tooltip>,
            children: (
              <>
                <div className="dragon-reason">{reason || '未提供上榜原因'}</div>
                {result?.summary.filter((r) => r.reason === reason).map((r) => (
                  <div className="dragon-totals" key={`${reason}-${r.lBuy}-${r.lSell}-${r.netAmount}`}>
                    {[{ title: '买入总额', value: r.lBuy, color: 'quote-up' }, { title: '卖出总额', value: r.lSell, color: 'quote-down' }, { title: '净买入', value: r.netAmount, color: changeClass(r.netAmount) }].map((item) => (
                      <div key={item.title}>
                        <span>
                          {item.title}
                          （万元）
                        </span>
                        <strong className={item.color}>{money(item.value, item.title === '净买入')}</strong>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="dragon-seat-grid">
                  {['0', '1', ...(result?.seats.some((r) => r.reason === reason && !['0', '1'].includes(String(r.side))) ? ['other'] : [])].map((side) => (
                    <SeatTable date={date} key={side} side={side} funds={canReadFunds ? funds : []} seats={result?.seats.filter((r) => r.reason === reason && (side === 'other' ? !['0', '1'].includes(String(r.side)) : String(r.side) === side)) || []} />
                  ))}
                </div>
              </>
            ),
          }))}
        />
        )}
      </DataState>
    </div>
  );
}

export default function DragonDrawer({ stock, date, close }: { stock: { tsCode: string; name: string } | null; date: string; close: () => void }) {
  return (
    <Drawer title={`${stock?.name || ''} ${stock?.tsCode || ''} ${date} 龙虎榜`} width={960} open={!!stock} onClose={close} rootClassName="dragon-drawer">
      {stock && <DragonDetails stock={stock} date={date} />}
    </Drawer>
  );
}
