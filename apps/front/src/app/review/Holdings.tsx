'use client';

import { useRef, useState, useEffect } from 'react';
import {
  Alert, Button, Card, DatePicker, Form, Input, InputNumber, Space,
} from 'antd';
import dayjs from 'dayjs';
import request from '@/api/request';
import { errorMessage } from '@/api/errors';
import { numberText } from '@/utils/format';
import RiskInspect from '../basic/components/RiskInspect';
import { HoldingInput, holdingErrors } from './review-interactions';

export default function Holdings({ date, candidates, onResult }: { date: string; candidates: string[]; onResult: (value: any) => void }) {
  const [rows, setRows] = useState<HoldingInput[]>([{ id: 0, code: '' }]);
  const nextId = useRef(1);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validated, setValidated] = useState(false);
  const [changed, setChanged] = useState(false);
  const generation = useRef(0); const abort = useRef<AbortController>();
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); }, []);
  const clearResult = () => {
    generation.current += 1; abort.current?.abort();
    if (result || loading) setChanged(true);
    setResult(null); onResult(null); setError(''); setLoading(false);
  };
  const change = (i: number, update: Partial<HoldingInput>) => { clearResult(); setRows((old) => old.map((r, n) => (n === i ? { ...r, ...update } : r))); };
  const errors = holdingErrors(rows, date);
  const focus = (id: number, field = 'code') => requestAnimationFrame(() => document.getElementById(`holding-${id}-${field}`)?.focus());
  const analyze = async () => {
    clearResult(); setValidated(true);
    const invalid = errors.findIndex((fields) => Object.values(fields).some(Boolean));
    if (invalid >= 0) { focus(rows[invalid].id, Object.entries(errors[invalid]).find(([, value]) => value)?.[0]); return; }
    const { current } = generation;
    setLoading(true); abort.current = new AbortController();
    try {
      const response = await request.post('/review/holdings', {
        date,
        holdings: rows.map((row) => ({
          code: row.code, boughtOn: row.boughtOn, cost: row.cost, rationale: row.rationale,
        })),
      }, { signal: abort.current.signal, timeout: 130000, autoShowError: false });
      if (current === generation.current) { setResult(response.data); onResult(response.data); setChanged(false); }
    } catch (e) { if (current === generation.current) setError(errorMessage(e, '持仓分析失败，请重试')); } finally { if (current === generation.current) setLoading(false); }
  };
  let feedback = '';
  if (result) feedback = '分析已完成，结果可随复盘计划导出。';
  if (changed) feedback = '输入已修改，请重新分析。';
  if (loading) feedback = '正在分析，修改输入会取消本次分析。';
  return (
    <div className="review-holdings-form">
      <p className="review-caption">输入1–3只持仓，查看持有天数与5日线情况。买入日期、成本和理由可选填；收起后保留本次输入，刷新或切换日期后清空。</p>
      {rows.map((r, i) => (
        <div className="review-holding-row" key={r.id}>
          <div className="review-pick-heading">
            <strong>{`持仓 ${i + 1}`}</strong>
            {rows.length > 1 && <Button size="small" aria-label={`移除持仓${i + 1}`} onClick={() => { clearResult(); setRows(rows.filter((_, n) => n !== i)); }}>移除</Button>}
          </div>
          <Form layout="vertical" component="div" colon={false} className="review-holding-fields">
            <Form.Item label="股票代码" htmlFor={`holding-${r.id}-code`} validateStatus={validated && errors[i].code ? 'error' : undefined} help={validated && errors[i].code}>
              <Input id={`holding-${r.id}-code`} aria-label={`持仓${i + 1}代码`} aria-invalid={validated && !!errors[i].code} value={r.code} placeholder="000001.SZ / 600000.SH / 920001.BJ" onChange={(e) => change(i, { code: e.target.value.trim().toUpperCase() })} />
            </Form.Item>
            <Form.Item label="买入日期（可选）" htmlFor={`holding-${r.id}-boughtOn`} validateStatus={validated && errors[i].boughtOn ? 'error' : undefined} help={validated && errors[i].boughtOn}>
              <DatePicker id={`holding-${r.id}-boughtOn`} aria-label={`持仓${i + 1}买入日期`} value={r.boughtOn ? dayjs(r.boughtOn) : null} disabledDate={(d) => d.format('YYYY-MM-DD') > date} onChange={(d) => change(i, { boughtOn: d?.format('YYYY-MM-DD') })} />
            </Form.Item>
            <Form.Item label="成本／元每股（可选）" htmlFor={`holding-${r.id}-cost`} validateStatus={validated && errors[i].cost ? 'error' : undefined} help={validated && errors[i].cost}>
              <InputNumber id={`holding-${r.id}-cost`} aria-label={`持仓${i + 1}成本`} value={r.cost} onChange={(v) => change(i, { cost: v ?? undefined })} />
            </Form.Item>
            <Form.Item className="review-holding-rationale" label="原买入理由（可选）" htmlFor={`holding-${r.id}-rationale`}>
              <Input.TextArea id={`holding-${r.id}-rationale`} aria-label={`持仓${i + 1}理由`} value={r.rationale} maxLength={300} rows={2} placeholder="记录原买入逻辑，分析后与观察名单对照" onChange={(e) => change(i, { rationale: e.target.value })} />
            </Form.Item>
          </Form>
        </div>
      ))}
      <Space wrap size={[12, 8]}>
        <Button disabled={rows.length >= 3} onClick={() => { clearResult(); const id = nextId.current; nextId.current += 1; setRows([...rows, { id, code: '' }]); focus(id); }}>添加持仓</Button>
        <Button type="primary" loading={loading} onClick={analyze}>分析输入的持仓</Button>
        <Button onClick={() => { clearResult(); setRows([{ id: 0, code: '' }]); setValidated(false); setChanged(false); focus(0); }}>清空持仓与结果</Button>
        <span className="review-caption">{`${rows.length}/3 只${rows.length === 3 ? ' · 已达上限' : ''}`}</span>
      </Space>
      <p role="status" className="review-caption">{feedback}</p>
      {error && <Alert type="error" message={error} action={<Button onClick={analyze}>重试分析</Button>} />}
      {result?.items.map((r: any) => (
        <Card key={r.code} size="small" title={`${r.name} ${r.code}`} className="review-holding-result" extra={<RiskInspect code={r.code} name={r.name} date={date} />}>
          <p>{`持有 ${r.heldDays ?? '未知'} 个交易日 · 收盘 ${numberText(r.close)} 元 · 成本价格差 ${numberText(r.profitPct)}%`}</p>
          <p>{`${r.ma5.label}；${r.basis} MA5：${numberText(r.ma5.ma5)}`}</p>
          <p>{r.timeReview}</p>
          <p>{`原买入理由：${r.rationale || '未输入'}`}</p>
          <p>{`新机会对照：${candidates.join('、') || '尚未选观察名单'}。请看图比较强弱、风险与原买入理由，再决定是否替换。`}</p>
        </Card>
      ))}
      {result && <p>{result.note}</p>}
    </div>
  );
}
