'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function usePagePosition(owner: number) {
  const previous = useRef<string | null>(null);
  const path = usePathname(); const query = useSearchParams().toString();
  useEffect(() => {
    if (new URLSearchParams(query).has('reviewCapture')) return undefined;
    const area = document.querySelector<HTMLElement>('.platform-content');
    if (!area) return undefined;
    const key = `research-position:${owner}:${path}?${query}`;
    const samePage = previous.current === `${owner}:${path}`; previous.current = `${owner}:${path}`;
    let position = samePage ? area.scrollTop : 0; let restoring = true; let frame = 0;
    try { if (!samePage) position = Number(sessionStorage.getItem(key)) || 0; } catch { /* Position storage is optional. */ }
    let observer: MutationObserver;
    const restore = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!restoring) return;
        area.scrollTop = position;
        if (area.scrollHeight - area.clientHeight >= position) { restoring = false; observer.disconnect(); }
      });
    };
    observer = new MutationObserver(restore);
    observer.observe(area, { childList: true, subtree: true }); restore();
    const userScroll = () => { restoring = false; observer.disconnect(); };
    const save = () => { if (!restoring) { try { sessionStorage.setItem(key, String(area.scrollTop)); } catch { /* Position storage is optional. */ } } };
    area.addEventListener('wheel', userScroll, { passive: true }); area.addEventListener('touchstart', userScroll, { passive: true }); area.addEventListener('scroll', save, { passive: true });
    return () => { save(); cancelAnimationFrame(frame); observer.disconnect(); area.removeEventListener('wheel', userScroll); area.removeEventListener('touchstart', userScroll); area.removeEventListener('scroll', save); };
  }, [owner, path, query]);
}
