'use client';

import { errorMessage } from '@/api/errors';
import { useEffect, useState } from 'react';
import {
  Alert, Collapse, Descriptions, Drawer, Empty, Spin, Table, Typography,
} from 'antd';
import { DragonData, marketRequest } from '@/api/market';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { numberText } from './MarketCharts';

export default function DragonDrawer({ stock, date, close }: { stock: { tsCode: string; name: string } | null; date: string; close: () => void }) {
  const [data, setData] = useState<DragonData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { runLatestRequest, requestConfig } = useLatestRequest('market-dragon');
  useEffect(() => {
    if (!stock) return;
    runLatestRequest({
      request: () => marketRequest<DragonData>('dragon', { date, code: stock.tsCode }, requestConfig),
      onStart: () => { setLoading(true); setError(''); setData(null); },
      onSuccess: (r) => setData(r.data),
      onError: (e) => setError(errorMessage(e, '龙虎榜查询失败')),
      onFinally: () => setLoading(false),
    });
  }, [stock, date, runLatestRequest, requestConfig]);
  const reasons = Array.from(new Set([...(data?.summary.map((r) => r.reason) || []), ...(data?.seats.map((r) => r.reason) || [])]));
  return (
    <Drawer title={`${stock?.name || ''} ${date} 龙虎榜`} width={880} open={!!stock} onClose={close}>
      <Typography.Paragraph type="secondary">按上榜原因分别展示。不同原因及买卖榜可能包含重复席位，不跨榜累计净买入额。</Typography.Paragraph>
      {loading && <Spin />}
      {error && <Alert message={error} type="error" showIcon />}
      {!loading && !error && data && !reasons.length && <Empty description="Tushare暂无返回记录，可能未上榜或数据尚未更新" />}
      <Collapse items={reasons.map((reason) => ({
        key: reason,
        label: reason,
        children: (
          <>
            {data?.summary.filter((r) => r.reason === reason).map((r) => (
              <Descriptions
                key={`${reason}-${r.lBuy}-${r.lSell}-${r.netAmount}`}
                size="small"
                items={[
                  { key: 'buy', label: '买入（万元）', children: numberText(r.lBuy == null ? null : r.lBuy / 10000) },
                  { key: 'sell', label: '卖出（万元）', children: numberText(r.lSell == null ? null : r.lSell / 10000) },
                  { key: 'net', label: '净买入（万元）', children: numberText(r.netAmount == null ? null : r.netAmount / 10000) },
                ]}
              />
            ))}
            <Table
              size="small"
              pagination={false}
              rowKey={(r) => `${r.side}:${r.exalter}`}
              dataSource={data?.seats.filter((r) => r.reason === reason)}
              columns={[
                { title: '榜单', dataIndex: 'side', render: (v) => (String(v) === '0' ? '买入榜' : '卖出榜') },
                { title: '营业部', dataIndex: 'exalter' },
                ...[{ key: 'buy', title: '买入' }, { key: 'sell', title: '卖出' }, { key: 'netBuy', title: '净买入' }].map((r) => ({ title: `${r.title}（万元）`, dataIndex: r.key, render: (v: number | null) => numberText(v == null ? null : v / 10000) })),
              ]}
            />
          </>
        ),
      }))}
      />
    </Drawer>
  );
}
