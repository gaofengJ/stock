'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Space } from 'antd';
import { Article, validateArticle } from './article-contract';
import { fetchNotebookImage } from './notebook-images';

export default function StoredImages({ article, onReady }: { article: Article; onReady: (source: Article, result: Article) => void }) {
  const cache = useRef(new Map<string, string>());
  const [failed, setFailed] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const hashes = [...new Set(article.images.map((image) => image.data).filter((data) => data.startsWith('review-asset:')))];
    const queue = hashes.filter((key) => !cache.current.has(key) && (!retry || retry === key));
    const worker = async () => {
      for (let key = queue.shift(); key && !abort.signal.aborted; key = queue.shift()) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const data = await fetchNotebookImage(key.slice(13), abort.signal);
          if (!abort.signal.aborted) cache.current.set(key, data);
        } catch { /* Show individual retry actions after this batch. */ }
      }
    };
    Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker)).then(() => {
      if (abort.signal.aborted) return;
      const missing = hashes.filter((key) => !cache.current.has(key));
      setFailed(missing);
      if (!missing.length) {
        try {
          const images = article.images.map((image) => ({ ...image, data: cache.current.get(image.data) || image.data }));
          onReady(article, validateArticle({ ...article, images }));
        } catch (e) { setError((e as Error).message); }
      }
    });
    return () => abort.abort();
  }, [article, onReady, retry, attempt]);
  return (
    <Space direction="vertical" role="status">
      <span>{error || (failed.length ? '部分历史配图读取失败，仍可返回编辑当日记录。' : '正在读取图文配图…')}</span>
      {failed.map((key) => <Button key={key} onClick={() => { setAttempt(attempt + 1); setRetry(key); }}>{`重试：${article.images.find((image) => image.data === key)?.caption || '历史配图'}`}</Button>)}
    </Space>
  );
}
