'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Button, Drawer, Select, Space, message,
} from 'antd';
import { api } from '@/auth/client';
import { errorMessage } from '@/api/errors';
import styles from './news.module.scss';

export interface NewsPreferences { keywords: string[]; stocks: string[] }
interface Stock { tsCode: string; name: string }

export default function FocusDrawer({
  open, onClose, value, onSaved,
}: { open: boolean; onClose: () => void; value: NewsPreferences; onSaved: (preferences: NewsPreferences) => void }) {
  const [draft, setDraft] = useState(value);
  const [options, setOptions] = useState<Stock[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const generation = useRef(0);
  useEffect(() => { if (open) { setDraft(value); setSearch(''); setOptions([]); } }, [open, value]);
  useEffect(() => {
    const current = generation.current + 1; generation.current = current;
    if (!open || !search.trim()) { setSearching(false); return undefined; }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try { const result = await api<Stock[]>(`/news/stocks?q=${encodeURIComponent(search.trim())}`); if (current === generation.current) setOptions(result); } catch (e) { if (current === generation.current) message.error(errorMessage(e)); } finally { if (current === generation.current) setSearching(false); }
    }, 250);
    return () => { window.clearTimeout(timer); generation.current += 1; };
  }, [open, search]);
  const save = async () => {
    setSaving(true);
    try { const result = await api<NewsPreferences>('/news/preferences', 'PATCH', draft); onSaved(result); onClose(); message.success('关注设置已保存'); } catch (e) { message.error(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Drawer
      title="我的关注"
      open={open}
      onClose={onClose}
      width="min(520px, 100vw)"
      footer={(
        <Space>
          <Button type="primary" loading={saving} onClick={save}>保存关注</Button>
          <Button onClick={onClose}>取消</Button>
        </Space>
      )}
    >
      <p className={styles.note}>关注设置随账号保存。股票按代码、简称和公司全称匹配，可能有遗漏。</p>
      <p id="news-follow-keywords-label">关注关键词（最多 20 个）</p>
      <Select id="news-follow-keywords" aria-label="关注关键词" mode="tags" tokenSeparators={[',', '，']} className={styles.focusSelect} value={draft.keywords} maxCount={20} placeholder="输入关键词后按回车，如半导体、降息" onChange={(keywords) => setDraft((old) => ({ ...old, keywords: keywords.map((word: string) => word.slice(0, 40)) }))} />
      <p id="news-watch-stocks-label">自选股票（最多 50 只）</p>
      <Select id="news-watch-stocks" aria-label="自选股票" mode="multiple" showSearch filterOption={false} loading={searching} maxCount={50} value={draft.stocks} className={styles.focusSelect} onSearch={setSearch} placeholder="输入 A 股代码或名称" notFoundContent={searching ? '搜索中…' : '输入代码或名称搜索'} options={[...options.map((stock) => ({ value: stock.tsCode, label: `${stock.name} ${stock.tsCode}` })), ...draft.stocks.filter((code) => !options.some((stock) => stock.tsCode === code)).map((code) => ({ value: code, label: code }))]} onChange={(stocks) => setDraft((old) => ({ ...old, stocks }))} />
    </Drawer>
  );
}
