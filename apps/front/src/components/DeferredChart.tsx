'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/** Mount once near the viewport; capture mode intentionally mounts all charts. */
export default function DeferredChart({ children, eager = false, height = 420 }: {
  children: React.ReactNode; eager?: boolean; height?: number;
}) {
  const target = useRef<HTMLDivElement>(null);
  const capture = useSearchParams().get('reviewCapture') === '1';
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (visible || eager || capture) return undefined;
    if (!('IntersectionObserver' in window)) { setVisible(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    if (target.current) observer.observe(target.current);
    return () => observer.disconnect();
  }, [visible, eager, capture]);
  return <div ref={target} style={{ minHeight: height }}>{visible || eager || capture ? children : <div className="market-empty" aria-label="滚动到此处加载图表">图表将在滚动到此处时加载</div>}</div>;
}
