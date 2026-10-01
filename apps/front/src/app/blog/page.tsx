'use client';

import React, { useEffect, useRef, useState } from 'react';
import { api, authFailure } from '@/auth/client';
import { useSiteTheme } from '@/components/SiteTheme';
import { normalizeBlogPath } from './path';

const MarketStoriesPage = () => {
  const base = process.env.NODE_ENV === 'development'
    ? 'http://localhost:8082/blog-frame/'
    : '/blog-frame/';
  const frame = useRef<HTMLIFrameElement>(null);
  const { mode } = useSiteTheme();
  const [src, setSrc] = useState<string>();
  const [height, setHeight] = useState<number>();
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const { origin } = new URL(base, window.location.origin);
    const queryPath = () => normalizeBlogPath(new URLSearchParams(window.location.search).get('article')) || '/';
    const send = (type: string, extra = {}) => frame.current?.contentWindow?.postMessage({ type, ...extra }, origin);
    setSrc(`${base}${queryPath().slice(1)}`);
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      const { current: theme } = modeRef;
      if (event.data?.type === 'stock-blog-ready') send('stock-blog-theme', { mode: theme });
      if (event.data?.type === 'stock-blog-denied') authFailure(403);
      if (event.data?.type !== 'stock-blog-route') return;
      const path = normalizeBlogPath(event.data.path);
      if (!path) return;
      const url = new URL(window.location.href);
      if (path === '/') url.searchParams.delete('article');
      else url.searchParams.set('article', path);
      window.history.replaceState(window.history.state, '', url);
    };
    const restore = () => send('stock-blog-navigate', { path: queryPath() });
    const check = () => { api('/auth/blog-access').catch(() => {}); };
    const timer = window.setInterval(check, 60000);
    window.addEventListener('message', receive);
    window.addEventListener('popstate', restore);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('message', receive);
      window.removeEventListener('popstate', restore);
    };
  }, [base]);

  useEffect(() => {
    if (!src) return;
    frame.current?.contentWindow?.postMessage({ type: 'stock-blog-theme', mode }, new URL(base, window.location.origin).origin);
  }, [mode, src, base]);

  useEffect(() => {
    if (!src) return undefined;
    const resize = () => {
      const top = frame.current?.getBoundingClientRect().top;
      if (top !== undefined) setHeight(Math.max(240, window.innerHeight - top - 24));
    };
    resize();
    const container = frame.current?.closest('.platform-content');
    const observer = new ResizeObserver(resize);
    if (container) observer.observe(container);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [src]);

  return (
    <div className="w-full" style={{ height: height || 'calc(100dvh - 160px)', minHeight: 240 }}>
      {src && (
        <iframe
          ref={frame}
          src={src}
          className="w-full h-full border-none"
          title="市场那些事"
        />
      )}
    </div>
  );
};

export default MarketStoriesPage;
