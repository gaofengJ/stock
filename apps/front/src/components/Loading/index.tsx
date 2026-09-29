'use client';

import { Spin } from 'antd';
import { useEffect, useRef } from 'react';

export default function Loading({ height = 320 }: { height?: number | string }) {
  return (
    <div className="loading-placeholder" style={{ minHeight: height }} role="status" aria-live="polite">
      <span className="loading-icon" aria-hidden="true"><Spin size="large" /></span>
      <span>加载中…</span>
    </div>
  );
}

/** Center in the visible part of a section, including long scrollable pages. */
export function LoadingOverlay() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const overlay = overlayRef.current;
    const indicator = indicatorRef.current;
    if (!overlay || !indicator) return undefined;
    const scrollArea = overlay.closest('.platform-content');
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = overlay.getBoundingClientRect();
        const area = scrollArea?.getBoundingClientRect();
        const top = Math.max(rect.top, area?.top ?? 0, 0);
        const bottom = Math.min(rect.bottom, area?.bottom ?? window.innerHeight, window.innerHeight);
        const left = Math.max(rect.left, area?.left ?? 0, 0);
        const right = Math.min(rect.right, area?.right ?? window.innerWidth, window.innerWidth);
        indicator.style.visibility = bottom > top && right > left ? 'visible' : 'hidden';
        indicator.style.top = `${(top + bottom) / 2 - rect.top}px`;
        indicator.style.left = `${(left + right) / 2 - rect.left}px`;
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(overlay);
    if (scrollArea) observer.observe(scrollArea);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, []);
  return (
    <div ref={overlayRef} className="loading-overlay">
      <div ref={indicatorRef} className="loading-overlay-indicator"><Loading height={0} /></div>
    </div>
  );
}
