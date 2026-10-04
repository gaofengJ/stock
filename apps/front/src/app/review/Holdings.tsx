'use client';

import { useRef, useState, useEffect } from 'react';
import {
  Alert, Button, Card, DatePicker, Input, InputNumber, Space,
} from 'antd';
import dayjs from 'dayjs';
import request from '@/api/request';
import { errorMessage } from '@/api/errors';
import { numberText } from '@/utils/format';
import RiskInspect from '../basic/components/RiskInspect';

interface Holding { id: number; code: string; boughtOn?: string; cost?: number; rationale?: string }
export default function Holdings({ date, candidates }: { date: string; candidates: string[] }) {
  const [rows, setRows] = useState<Holding[]>([{ id: 0, code: '' }]);
  const nextId = useRef(1);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const generation = useRef(0); const abort = useRef<AbortController>();
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); }, []);
  const clearResult = () => { generation.current += 1; abort.current?.abort(); setResult(null); setError(''); setLoading(false); };
  const change = (i: number, update: Partial<Holding>) => { clearResult(); setRows((old) => old.map((r, n) => (n === i ? { ...r, ...update } : r))); };
  const analyze = async () => {
    clearResult(); const { current } = generation;
    if (rows.some((r) => !/^\d{6}\.(SH|SZ|BJ)$/.test(r.code))) { setError('请输入带交易所后缀的代码，例如 000001.SZ、600000.SH、920001.BJ'); return; }
    if (new Set(rows.map((r) => r.code)).size !== rows.length) { setError('股票代码不能重复'); return; }
    setLoading(true); abort.current = new AbortController();
    try {
      const response = await request.post('/review/holdings', {
        date,
        holdings: rows.map((row) => ({
          code: row.code, boughtOn: row.boughtOn, cost: row.cost, rationale: row.rationale,
        })),
      }, { signal: abort.current.signal, timeout: 130000, autoShowError: false });
      if (current === generation.current) setResult(response.data);
    } catch (e) { if (current === generation.current) setError(errorMessage(e, '持仓分析失败，请重试')); } finally { if (current === generation.current) setLoading(false); }
  };
  return (
    <Card title="可选：输入持仓后分析" className="mb-16">
      <p>默认报告独立生成。仅分析你本次输入的1–3只股票，买入日期、成本和理由均可不填；输入只用于当前页面，不保存持仓。</p>
      {rows.map((r, i) => (
        <Space key={r.id} wrap className="mb-16">
          <Input aria-label={`持仓${i + 1}代码`} value={r.code} placeholder="股票代码（含.SH／.SZ／.BJ）" style={{ width: 250 }} onChange={(e) => change(i, { code: e.target.value.trim().toUpperCase() })} />
          <DatePicker aria-label={`持仓${i + 1}买入日期`} placeholder="买入日期（可选）" value={r.boughtOn ? dayjs(r.boughtOn) : null} disabledDate={(d) => d.format('YYYY-MM-DD') > date} onChange={(d) => change(i, { boughtOn: d?.format('YYYY-MM-DD') })} />
          <InputNumber aria-label={`持仓${i + 1}成本`} placeholder="成本（可选）" min={0.0001} max={1000000} value={r.cost} onChange={(v) => change(i, { cost: v ?? undefined })} />
          <Input aria-label={`持仓${i + 1}理由`} value={r.rationale} maxLength={300} placeholder="原买入理由（可选）" onChange={(e) => change(i, { rationale: e.target.value })} />
          {rows.length > 1 && <Button onClick={() => { clearResult(); setRows(rows.filter((_, n) => n !== i)); }}>移除</Button>}
        </Space>
      ))}
      <Space wrap className="mb-16">
        <Button disabled={rows.length >= 3} onClick={() => { clearResult(); nextId.current += 1; setRows([...rows, { id: nextId.current, code: '' }]); }}>添加持仓</Button>
        <Button type="primary" loading={loading} onClick={analyze}>分析输入的持仓</Button>
        <Button onClick={() => { clearResult(); setRows([{ id: 0, code: '' }]); }}>清空持仓与结果</Button>
      </Space>
      {error && <Alert type="error" message={error} />}
      {result?.items.map((r: any) => (
        <Card key={r.code} size="small" title={`${r.name} ${r.code}`} className="mb-16" extra={<RiskInspect code={r.code} date={date} />}>
          <p>
            持有
            {r.heldDays ?? '未知'}
            {' '}
            个交易日 · 收盘
            {numberText(r.close)}
            {' '}
            元 · 成本价格差
            {numberText(r.profitPct)}
            %
          </p>
          <p>
            {r.ma5.label}
            ；
            {r.basis}
            {' '}
            MA5：
            {numberText(r.ma5.ma5)}
          </p>
          <p>{r.timeReview}</p>
          <p>
            原买入理由：
            {r.rationale || '未输入'}
          </p>
          <p>
            新机会对照：
            {candidates.join('、') || '尚未选观察名单'}
            。请看图比较强弱、风险与原买入理由，再决定是否替换。
          </p>
        </Card>
      ))}
      {result && <p>{result.note}</p>}
    </Card>
  );
}
