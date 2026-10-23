import { useEffect, useRef, useState } from 'react';
import {
  draftKey, emptyDraft, parseDraft, ReviewDraft,
} from './review-draft';

// eslint-disable-next-line default-param-last -- Optional server binding preserves standalone draft callers.
export default function useReviewDraft(account: number, date: string, generation = 0, serverDraft?: ReviewDraft, onDraft?: (draft: ReviewDraft) => void) {
  const key = generation ? `${draftKey(account, date)}:reset-${generation}` : draftKey(account, date);
  const current = useRef<ReviewDraft>(emptyDraft());
  const [draft, setDraft] = useState<ReviewDraft>(current.current);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('正在读取草稿');
  useEffect(() => {
    try {
      // A server-side clear invalidates old browser drafts too, for this owner only.
      if (generation) {
        const prefix = `stock-review-draft:v1:${account}:`;
        Object.keys(localStorage).filter((name) => name.startsWith(prefix) && !name.endsWith(`:reset-${generation}`)).forEach((name) => localStorage.removeItem(name));
      }
      current.current = serverDraft || parseDraft(localStorage.getItem(key));
      if (!serverDraft && onDraft) onDraft(current.current);
      setStatus(onDraft ? '观察名单随复盘保存，可跨设备恢复' : '草稿已保存在此浏览器');
    } catch {
      current.current = serverDraft || emptyDraft();
      setStatus('草稿读取失败，请及时导出本次填写内容');
    }
    setDraft(current.current);
    setReady(true);
  }, [key, account, generation, serverDraft, onDraft]);
  const update = (patch: Partial<ReviewDraft>) => {
    if (!ready) return;
    current.current = { ...current.current, ...patch };
    setDraft(current.current);
    onDraft?.(current.current);
    try {
      localStorage.setItem(key, JSON.stringify(current.current));
      setStatus(onDraft ? '观察名单随复盘保存，可跨设备恢复' : '草稿已保存在此浏览器');
    } catch {
      setStatus('草稿保存失败，请及时导出本次填写内容');
    }
  };
  return {
    draft, update, ready, status,
  };
}
