'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Button, Collapse, Input, Modal, Pagination, Select, Space,
} from 'antd';
import Link from 'next/link';
import SelectField from '@/components/SelectField';
import request from '@/api/request';
import { errorMessage } from '@/api/errors';
import { legacyDraft } from './review-draft';
import { internalText, NotebookContent } from './notebook-model';
import { WatchDraft } from './workspace-contract';

export interface NotebookSnapshot {
  date: string; revision: number; generation?: number; content: NotebookContent | null;
  versions?: { revision: number; createdAt: string }[];
  previous?: { date: string; revision: number; content: NotebookContent } | null;
}
interface HistoryDate { date: string; revision: number }
export function useNotebookDates(revision?: number, stock = '') {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; dates: HistoryDate[]; error: string }>();
  const key = JSON.stringify([revision, stock, attempt]);
  useEffect(() => {
    if (revision === undefined) return undefined;
    const controller = new AbortController();
    request.get<HistoryDate[]>('/review/notebook/dates', {
      params: stock ? { stock } : {}, signal: controller.signal, autoShowError: false,
    }).then(({ data }) => {
      if (!Array.isArray(data)) throw Error('历史日期暂不可用');
      if (!controller.signal.aborted) setResult({ key, dates: data, error: '' });
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ key, dates: [], error: errorMessage(error) });
    });
    return () => controller.abort();
  }, [key, revision, stock]);
  const current = result?.key === key ? result : undefined;
  return {
    dates: current?.dates || [], loading: !current, error: current?.error, retry: () => setAttempt((value) => value + 1),
  };
}

export default function NotebookHistory({ snapshot, allDates }: {
  snapshot: NotebookSnapshot; allDates: ReturnType<typeof useNotebookDates>;
}) {
  const [month, setMonth] = useState('');
  const [stock, setStock] = useState('');
  const [page, setPage] = useState(1);
  const matches = useNotebookDates(stock ? snapshot.revision : undefined, stock);
  const results = stock ? matches : allDates;
  const months = [...new Set(allDates.dates.map((row) => row.date.slice(0, 7)))];
  const dates = results.dates.filter((row) => row.date.startsWith(month));
  const pageSize = 12;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(dates.length / pageSize)));
  const [history, setHistory] = useState<NotebookSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const readVersion = async (revision: number) => {
    setBusy(true); setError('');
    try {
      const { data } = await request.get<NotebookSnapshot>('/review/notebook', {
        params: {
          date: snapshot.date, revision, previous: 0, publicationBodies: 0, assetReferences: 1,
        },
        autoShowError: false,
      }); setHistory(data);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Collapse items={[{
        key: 'history',
        label: '历史记录与恢复',
        children: (
          <div className="notebook-history-content">
            {error && <Alert type="warning" message={error} />}
            <Space wrap>
              <SelectField label="记录月份">
                <Select
                  aria-label="记录月份"
                  value={month}
                  style={{ minWidth: 140 }}
                  options={[{ value: '', label: '全部月份' }, ...months.map((value) => ({ value, label: value }))]}
                  onChange={(value) => { setMonth(value); setPage(1); }}
                />
              </SelectField>
              <Input.Search
                aria-label="搜索历史观察股"
                placeholder="股票名称或代码"
                allowClear
                maxLength={100}
                onSearch={(value) => { setStock(value.trim()); setPage(1); }}
              />
            </Space>
            {results.error && <Alert type="warning" message={results.error} action={<Button onClick={results.retry}>重试</Button>} />}
            {results.loading && <span role="status">正在读取历史复盘</span>}
            {!results.loading && !results.error && !dates.length && <span>{stock || month ? '没有符合条件的历史复盘' : '尚无已保存复盘'}</span>}
            <Space wrap>
              {dates.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((row) => (
                <Link key={row.date} href={`/review/?date=${row.date}`}>
                  {`${row.date}（版本 ${row.revision}）`}
                </Link>
              ))}
            </Space>
            <Pagination
              size="small"
              current={currentPage}
              pageSize={pageSize}
              total={dates.length}
              hideOnSinglePage
              showSizeChanger={false}
              onChange={setPage}
            />
            <SelectField label="本日历史版本"><Select aria-label="查看历史版本" placeholder="选择本日历史版本（只读）" loading={busy} style={{ width: 280 }} value={history?.revision} options={(snapshot.versions || []).map((row) => ({ value: row.revision, label: `版本 ${row.revision}：${row.createdAt}` }))} onChange={readVersion} /></SelectField>
            <Link href="/domain-transfer/">从旧 IP 恢复本机草稿</Link>
          </div>
        ),
      }]}
      />
      <Modal className="notebook-history-modal" title={`${snapshot.date} 历史版本 ${history?.revision || ''}（只读）`} width={850} open={!!history} onCancel={() => setHistory(null)} footer={<Button onClick={() => setHistory(null)}>关闭</Button>}>
        <p>查看历史不会修改当前复盘。下方展示记录与正文，历史原图仍保留在服务器。</p>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{history?.content ? `${internalText(snapshot.date, history.content)}\n\n${history.content.article?.body || ''}` : ''}</pre>
      </Modal>
    </>
  );
}

export function PreviousObservations({
  previous, draft, verification, onVerify, onCopy, ineligible,
}: {
  previous: NotebookSnapshot['previous']; draft: WatchDraft; verification: string;
  onVerify: (value: string) => void; onCopy: (value: WatchDraft) => void; ineligible: (code: string) => string;
}) {
  const last = previous?.content.workspace?.draft || legacyDraft(previous?.content.private.toolEvidence);
  const picks = last.selected;
  const prefix = (pick: WatchDraft['selected'][number]) => `${previous?.date} ${pick.name} ${pick.tsCode}：`;
  const lines = verification.split('\n');
  const results = ['触发', '未触发', '失效', '待核实'];
  const structured = (line: string) => picks.some((pick) => results.some((value) => line === prefix(pick) + value));
  const carry = (rows: typeof picks) => {
    const next = { ...draft, selected: [...draft.selected], notes: { ...draft.notes } };
    rows.forEach((pick) => {
      if (ineligible(pick.tsCode) || next.selected.some((item) => item.tsCode === pick.tsCode)) return;
      next.selected.push(pick);
      if (!Object.hasOwn(next.notes, pick.tsCode) && last.notes[pick.tsCode]) next.notes[pick.tsCode] = last.notes[pick.tsCode];
    });
    onCopy(next);
  };
  if (!previous && !verification) return null;
  return (
    <section className="notebook-panel review-previous">
      <h3>{previous ? `上次观察 ${previous.date}` : '上次观察'}</h3>
      {previous?.content.private.marketJudgment && <p>{previous.content.private.marketJudgment}</p>}
      {picks.map((pick) => {
        const key = prefix(pick);
        const carried = draft.selected.some((item) => item.tsCode === pick.tsCode);
        const reason = carried ? '' : ineligible(pick.tsCode);
        return (
          <div className="notebook-previous-pick" key={pick.tsCode}>
            <strong>{pick.name}</strong>
            <span>{last.notes[pick.tsCode] || '上次未填写条件'}</span>
            {last.riskNotes[pick.tsCode] && <small>{`${previous?.date} 风险记录：${last.riskNotes[pick.tsCode]}`}</small>}
            <SelectField label="验证结果">
              <Select
                aria-label={`${pick.name}上次观察验证`}
                placeholder="验证结果"
                options={results.map((value) => ({ value, label: value }))}
                value={results.find((value) => lines.includes(key + value))}
                onChange={(value) => onVerify([...lines.filter((line) => line && !results.some((v) => line === key + v)), key + value].join('\n'))}
              />
            </SelectField>
            {reason && <small>{reason}</small>}
            <Button disabled={carried || !!reason} aria-label={`沿用${pick.name}`} onClick={() => carry([pick])}>{carried ? '已在今日名单' : '沿用到今天'}</Button>
          </div>
        );
      })}
      {picks.length > 1 && <Button disabled={picks.every((pick) => !!ineligible(pick.tsCode) || draft.selected.some((row) => row.tsCode === pick.tsCode))} onClick={() => carry(picks)}>沿用全部可加入的观察</Button>}
      <details>
        <summary>补充验证说明</summary>
        <Input.TextArea
          aria-label="补充验证说明"
          maxLength={4000}
          value={lines.filter((line) => !structured(line)).join('\n')}
          onChange={(event) => onVerify([...lines.filter(structured), event.target.value].join('\n'))}
        />
      </details>
    </section>
  );
}
