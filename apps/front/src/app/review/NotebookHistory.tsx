'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Button, Collapse, Modal, Select, Space,
} from 'antd';
import Link from 'next/link';
import SelectField from '@/components/SelectField';
import request from '@/api/request';
import { errorMessage } from '@/api/errors';
import { legacyDraft } from './review-draft';
import { internalText, NotebookContent } from './notebook-model';
import { ReviewWorkspace, emptyWorkspace } from './workspace-contract';

export interface NotebookSnapshot {
  date: string; revision: number; generation?: number; content: NotebookContent | null;
  versions?: { revision: number; createdAt: string }[];
  previous?: { date: string; revision: number; content: NotebookContent } | null;
}
export default function NotebookHistory({
  snapshot, onCopy, verification, onVerify,
}: { snapshot: NotebookSnapshot; onCopy: (workspace: ReviewWorkspace) => void; verification: string; onVerify: (text: string) => void }) {
  const [dates, setDates] = useState<{ date: string; revision: number }[]>([]);
  const [history, setHistory] = useState<NotebookSnapshot | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; request.get<{ date: string; revision: number }[]>('/review/notebook/dates', { autoShowError: false }).then(({ data }) => { if (alive) setDates(data); }).catch((e) => { if (alive) setError(errorMessage(e)); }); return () => { alive = false; }; }, [snapshot.revision]);
  const { previous } = snapshot;
  const previousWorkspace = previous?.content.workspace || { ...emptyWorkspace(), draft: legacyDraft(previous?.content.private.toolEvidence) };
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
        label: '历史复盘、版本与上次观察核对',
        children: (
          <Space direction="vertical" style={{ width: '100%' }}>
            {error && <Alert type="warning" message={error} />}
            <Space wrap>
              {dates.slice(0, 20).map((row) => (
                <Link key={row.date} href={`/review/?date=${row.date}`}>
                  {row.date}
                  （版本
                  {' '}
                  {row.revision}
                  ）
                </Link>
              ))}
            </Space>
            {!dates.length && <span>尚无已保存复盘</span>}
            <SelectField label="本日历史版本"><Select aria-label="查看历史版本" placeholder="选择本日历史版本（只读）" loading={busy} style={{ width: 280 }} value={history?.revision} options={(snapshot.versions || []).map((row) => ({ value: row.revision, label: `版本 ${row.revision}：${row.createdAt}` }))} onChange={readVersion} /></SelectField>
            {previous && (
            <>
              <strong>
                上次复盘：
                {previous.date}
              </strong>
              <p style={{ whiteSpace: 'pre-wrap' }}>{previous.content.private.marketJudgment || '上次未填写市场判断'}</p>
              {previousWorkspace.draft.selected.map((pick) => {
                const prefix = `${previous.date} ${pick.name} ${pick.tsCode}：`;
                const selected = verification.split('\n').find((line) => line.startsWith(prefix))?.slice(prefix.length);
                return (
                  <div key={pick.tsCode}>
                    <strong>{pick.name}</strong>
                    <p>{previousWorkspace.draft.notes[pick.tsCode] || '上次未填写触发条件'}</p>
                    <SelectField label={`${pick.name}上次观察验证`}><Select aria-label={`${pick.name}上次观察验证`} placeholder="选择验证结果" style={{ width: 180 }} value={selected} options={['触发', '未触发', '失效', '待核实'].map((label) => ({ label, value: label }))} onChange={(value) => onVerify([...verification.split('\n').filter((line) => line && !line.startsWith(prefix)), `${prefix}${value}`].join('\n'))} /></SelectField>
                  </div>
                );
              })}
              <Button onClick={() => onCopy(previousWorkspace)}>沿用上次观察名单与条件</Button>
              <span>复制后需按当前日期重新核验风险，不代表仍符合条件。</span>
            </>
            )}
          </Space>
        ),
      }]}
      />
      <Modal title={`${snapshot.date} 历史版本 ${history?.revision || ''}（只读）`} width={850} open={!!history} onCancel={() => setHistory(null)} footer={<Button onClick={() => setHistory(null)}>关闭</Button>}>
        <p>查看历史不会修改当前复盘。下方展示记录与正文，历史原图仍保留在服务器。</p>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{history?.content ? `${internalText(snapshot.date, history.content)}\n\n${history.content.article?.body || ''}` : ''}</pre>
      </Modal>
    </>
  );
}
