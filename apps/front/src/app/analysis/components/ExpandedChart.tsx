'use client';

import { useEffect, useRef, useState } from 'react';

export default function ExpandedChart({ render }: { render: (height: number) => React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(560);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const update = () => setHeight(Math.max(160, container.clientHeight));
    const observer = new ResizeObserver(update);
    observer.observe(container);
    update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // Modal locks the document, but the page has its own scrolling container.
    const page = document.querySelector<HTMLElement>('.platform-content');
    if (!page) return undefined;
    const { overflow } = page.style;
    page.style.overflow = 'hidden';
    return () => { page.style.overflow = overflow; };
  }, []);
  return <div ref={containerRef} className="market-expanded-chart">{render(height)}</div>;
}
