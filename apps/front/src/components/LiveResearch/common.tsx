'use client';

import { ReactNode, useEffect, useState } from 'react';
import {
  Alert, Button, Empty, Skeleton,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import request from '@/api/request';
import Table from '@/components/DataTable';
import CChart from '@/components/CChart';
import { useSiteTheme } from '@/components/SiteTheme';
import { chartPalette } from '@/colors';
import {
  beijingTime, changeClass, finiteNumber, numberText, scaledNumber,
} from '@/utils/format';
import {
  dateText, newest, Research, Row, Source, sourceLabels,
} from './data';
import './research.css';

export function useResearch(endpoint: string, params: Record<string, string>, enabled = true) {
  const key = JSON.stringify(params);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data?: Research; error?: string; loading: boolean }>({ key: '', loading: true });
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let active = true;
    setState({ key, loading: true });
    request.get<Research>(`/basic/workbench/research/${endpoint}`, { params: JSON.parse(key), signal: controller.signal, autoShowError: false })
      .then((res) => { if (active) setState({ key, data: res.data, loading: false }); })
      .catch((error) => { if (active) setState({ key, error: error.message || '资料获取失败，请重试', loading: false }); });
    return () => { active = false; controller.abort(); };
  }, [endpoint, key, enabled, attempt]);
  return { ...(state.key === key ? state : { loading: true, data: undefined, error: undefined }), retry: () => setAttempt((v) => v + 1) };
}

export function RequestState({ state, children }: { state: ReturnType<typeof useResearch>; children: ReactNode }) {
  if (state.loading) return <Skeleton active paragraph={{ rows: 5 }} />;
  if (state.error) return <Alert type="error" showIcon message={state.error} action={<Button onClick={state.retry}>重试</Button>} />;
  return <div>{children}</div>;
}

export function SourceBlock({
  source, title, retry, note, children, empty,
}: { source?: Source; title: string; retry: () => void; note?: string; children: ReactNode; empty?: boolean }) {
  let body = children;
  if (empty ?? !source?.rows.length) body = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="所选范围内接口未返回记录" />;
  if (!source || source.state === 'error') body = <Alert type="warning" showIcon message={source?.message || '该来源未取得，请重试'} action={<Button size="small" onClick={retry}>重试</Button>} />;
  return (
    <section className="live-research-section">
      <div className="live-research-heading">
        <h3>{title}</h3>
        <span className="live-research-note">{source ? `${sourceLabels[source.source] || 'Tushare'} · 获取于 ${beijingTime(source.fetchedAt)}` : '资料未取得'}</span>
      </div>
      {note && <p className="live-research-note">{note}</p>}
      {body}
    </section>
  );
}

export const dateColumn = (key: string, title = '日期') => ({
  title, dataIndex: key, width: 116, render: dateText,
});
export const textColumn = (key: string, title: string, width = 180) => ({
  title, dataIndex: key, width, render: (v: unknown) => String(v ?? '').trim() || '—',
});
export const numberColumn = (key: string, title: string, divisor = 1, signed = false) => ({
  title,
  dataIndex: key,
  width: 150,
  align: 'right' as const,
  sorter: (a: Row, b: Row) => (finiteNumber(a[key]) ?? -Infinity) - (finiteNumber(b[key]) ?? -Infinity),
  render: (v: unknown) => <span className={signed ? changeClass(v) : undefined}>{divisor === 1 ? numberText(v, 2, signed) : scaledNumber(v, divisor)}</span>,
});

export function ResearchTable({ rows, columns }: { rows: Row[]; columns: ColumnsType<Row> }) {
  const uniqueRows = Array.from(new Map(rows.map((r) => [JSON.stringify(r), r])).values());
  return <Table<Row> autoHeight rowKey={(row) => JSON.stringify(row)} dataSource={uniqueRows} columns={columns} pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }} />;
}

export function ResearchChart({
  rows, field = 'trade_date', series, unit,
}: { rows: Row[]; field?: string; series: { key: string; name: string; divisor?: number }[]; unit: string }) {
  const { colors, mode } = useSiteTheme();
  const sorted = newest(rows, field).reverse();
  if (!sorted.some((r) => series.some((s) => finiteNumber(r[s.key]) != null))) return null;
  return (
    <CChart
      appearance={mode}
      height={280}
      genOptions={() => ({
        color: chartPalette,
        textStyle: { color: colors.text },
        tooltip: { trigger: 'axis', renderMode: 'richText' },
        legend: { type: 'scroll', textStyle: { color: colors.text } },
        grid: {
          top: 42, bottom: 48, left: 12, right: 12, containLabel: true,
        },
        xAxis: {
          type: 'category', data: sorted.map((r) => dateText(r[field])), axisLabel: { color: colors.secondary }, axisLine: { lineStyle: { color: colors.border } },
        },
        yAxis: {
          type: 'value', name: unit, axisLabel: { color: colors.secondary }, splitLine: { lineStyle: { color: colors.border } },
        },
        series: series.map((s) => ({
          name: s.name, type: 'line', connectNulls: false, showSymbol: false, data: sorted.map((r) => { const n = finiteNumber(r[s.key]); return n == null ? null : Number((n / (s.divisor || 1)).toFixed(4)); }),
        })),
      })}
    />
  );
}
