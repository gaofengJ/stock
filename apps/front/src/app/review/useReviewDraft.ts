import { useEffect, useRef, useState } from 'react';
import {
  draftKey, emptyDraft, parseDraft, ReviewDraft,
} from './review-draft';

export default function useReviewDraft(account: number, date: string) {
  const key = draftKey(account, date);
  const current = useRef<ReviewDraft>(emptyDraft());
  const [draft, setDraft] = useState<ReviewDraft>(current.current);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('正在读取草稿');
  useEffect(() => {
    try {
      current.current = parseDraft(localStorage.getItem(key));
      setStatus('草稿已保存在此浏览器');
    } catch {
      current.current = emptyDraft();
      setStatus('草稿读取失败，请及时导出本次填写内容');
    }
    setDraft(current.current);
    setReady(true);
  }, [key]);
  const update = (patch: Partial<ReviewDraft>) => {
    if (!ready) return;
    current.current = { ...current.current, ...patch };
    setDraft(current.current);
    try {
      localStorage.setItem(key, JSON.stringify(current.current));
      setStatus('草稿已保存在此浏览器');
    } catch {
      setStatus('草稿保存失败，请及时导出本次填写内容');
    }
  };
  return {
    draft, update, ready, status,
  };
}
