'use client';

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert, Button, Empty, Input, Segmented, Tooltip,
} from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import Table from '@/components/DataTable';
import { DragonBoard, DragonListing } from '@/api/market';
import { changeClass, numberText } from '@/utils/format';
import SectorFilter, { useSectorSelection } from '@/components/SectorFilter';
import SectorLinks from '@/components/SectorLinks';
import MarketShell from '../components/MarketShell';
import { useMarket } from '../components/MarketContext';
import useMarketData from '../components/useMarketData';
import { DataState, SectionTitle } from '../components/MarketCharts';
import { DragonDetails } from '../components/DragonDrawer';
import { marketHref } from '../components/market-navigation';
import './dragon-board.sass';

const money = (v: number | null) => numberText(v == null ? null : v / 10000);
const rowKey = (r: DragonListing) => `${r.tsCode}:${r.reason}`;

export default function Page() {
  const { sector, setSector } = useSectorSelection();
  const { date, scope } = useMarket();
  const params = useSearchParams();
  const router = useRouter();
  const code = /^\d{6}\.(SH|SZ|BJ)$/.test(params.get('code') || '') ? params.get('code') || '' : '';
  const linkedReason = params.get('reason') || undefined;
  const [keyword, setKeyword] = useState('');
  const [direction, setDirection] = useState('全部');
  const detail = useRef<HTMLDivElement>(null);
  const locateDetail = useCallback(() => detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), []);
  const {
    data, loading, error, retry,
  } = useMarketData<DragonBoard>('dragon-board', { days: 20, sector });
  const selected = useMemo(() => (!loading && !error ? data?.items.find((r) => r.tsCode === code && (!linkedReason || r.reason === linkedReason)) : undefined), [loading, error, data, code, linkedReason]);
  const rows = useMemo(() => (data?.items || []).filter((r) => `${r.name} ${r.tsCode}`.toLowerCase().includes(keyword.trim().toLowerCase())
    && (direction === '全部' || (r.netAmount != null && (direction === '净买入' ? r.netAmount > 0 : r.netAmount < 0)))), [data, keyword, direction]);
  const stockCount = new Set(rows.map((r) => r.tsCode)).size;
  const selectedKey = selected ? rowKey(selected) : '';
  useEffect(() => {
    if (selectedKey) detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedKey, date]);
  const open = (r: DragonListing) => router.push(marketHref('/analysis/dragon', { date, scope }, { ...(sector ? { sector } : {}), code: r.tsCode, reason: r.reason }), { scroll: false });
  const clear = () => router.replace(marketHref('/analysis/dragon', { date, scope }, sector ? { sector } : {}), { scroll: false });
  return (
    <MarketShell title="龙虎榜" path="/analysis/dragon">
      <div className="dragon-board">
        <div className="dragon-board-toolbar">
          <SectorFilter value={sector} onChange={setSector} />
          <Input.Search allowClear aria-label="搜索龙虎榜股票" placeholder="股票名称 / 代码" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 250 }} />
          <Segmented options={['全部', '净买入', '净卖出']} value={direction} onChange={(v) => setDirection(String(v))} />
          <span className="dragon-board-count">
            {stockCount}
            {' '}
            只股票 /
            {' '}
            {rows.length}
            {' '}
            条上榜记录
          </span>
        </div>
        <div className="dragon-board-list-title">
          <SectionTitle title="上榜股票" description="每条记录对应一个上榜原因，跨日上榜资金不与单日金额合并。" />
          <span>资金单位：万元</span>
        </div>
        <DataState loading={loading} error={error} retry={retry} empty={!data}>
          <Table<DragonListing>
            size="small"
            bordered
            pagination={false}
            rowKey={rowKey}
            dataSource={rows}
            scroll={{ x: 1280 }}
            maxBodyHeight={440}
            minBodyHeight={280}
            rowClassName={(r) => (selected && rowKey(r) === rowKey(selected) ? 'dragon-board-selected' : '')}
            locale={{ emptyText: keyword || direction !== '全部' ? '没有符合筛选条件的股票' : '当日暂无龙虎榜记录' }}
            columns={[
              {
                title: '代码', dataIndex: 'tsCode', fixed: 'left', width: 110,
              },
              {
                title: '名称', dataIndex: 'name', fixed: 'left', width: 110, render: (name, r) => <Button className="dragon-stock-link" type="link" onClick={() => open(r)}>{name}</Button>,
              },
              {
                title: '行业', key: 'industry', width: 160, render: (_, r) => <SectorLinks stock={r} date={date} />,
              },
              {
                title: '题材', key: 'topics', width: 220, render: (_, r) => <SectorLinks stock={r} type="N" date={date} />,
              },
              {
                title: '收盘价(元)', dataIndex: 'close', width: 105, align: 'right', render: (v) => numberText(v),
              },
              {
                title: '涨跌幅(%)', dataIndex: 'pctChange', width: 120, align: 'right', sorter: (a, b) => (a.pctChange ?? -Infinity) - (b.pctChange ?? -Infinity), render: (v) => <span className={changeClass(v)}>{numberText(v, 2, true)}</span>,
              },
              {
                title: '换手率(%)', dataIndex: 'turnoverRate', width: 110, align: 'right', render: (v) => numberText(v),
              },
              {
                title: '买入金额', dataIndex: 'lBuy', width: 125, align: 'right', render: (v) => <span className="quote-up">{money(v)}</span>,
              },
              {
                title: '卖出金额', dataIndex: 'lSell', width: 125, align: 'right', render: (v) => <span className="quote-down">{money(v)}</span>,
              },
              {
                title: '净买入', dataIndex: 'netAmount', width: 140, align: 'right', defaultSortOrder: 'descend', sorter: (a, b) => (a.netAmount ?? -Infinity) - (b.netAmount ?? -Infinity), render: (v) => <span className={changeClass(v)}>{money(v)}</span>,
              },
              {
                title: '上榜原因', dataIndex: 'reason', width: 340, ellipsis: { showTitle: false }, render: (v) => <Tooltip title={v}>{v || '—'}</Tooltip>,
              },
              {
                title: '席位明细', key: 'details', width: 95, fixed: 'right', align: 'center', render: (_, r) => <Button className="dragon-stock-link" type="link" onClick={() => open(r)} aria-label={`查看${r.name}席位`}>查看</Button>,
              },
            ]}
          />
        </DataState>
        <div className="dragon-board-detail" ref={detail}>
          {selected ? (
            <>
              <div className="dragon-board-stock-heading">
                <div>
                  <strong>{selected.name}</strong>
                  <span className="dragon-stock-code">{selected.tsCode}</span>
                  <span className="dragon-stock-price">{numberText(selected.close)}</span>
                  <span className={changeClass(selected.pctChange)}>
                    {selected.pctChange != null && selected.pctChange !== 0 && (selected.pctChange > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />)}
                    {' '}
                    {numberText(selected.pctChange, 2, true)}
                    %
                  </span>
                </div>
                <Button type="text" onClick={clear}>收起明细</Button>
              </div>
              <DragonDetails stock={selected} date={date} reason={selected.reason} onReady={locateDetail} />
            </>
          ) : (
            <>
              {code && !loading && !error && <Alert type="info" showIcon message="该股票在当前日期和范围内没有对应上榜记录" action={<Button size="small" onClick={clear}>清除定位</Button>} />}
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择上榜股票，查看买卖席位" />
            </>
          )}
        </div>
      </div>
    </MarketShell>
  );
}
