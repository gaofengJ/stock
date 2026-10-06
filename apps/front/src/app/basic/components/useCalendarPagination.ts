'use client';

import { useEffect, useRef, useState } from 'react';

/** Fit complete rows in the viewport; use pagination instead of an inner scroll area. */
export default function useCalendarPagination(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState({ key, value: 1 });
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const measure = () => setPageSize(Math.max(1, Math.min(20, Math.floor((window.innerHeight - root.getBoundingClientRect().top - 150) / 64))));
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (root.parentElement) observer.observe(root.parentElement);
    window.addEventListener('resize', measure); measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [key]);
  return {
    ref,
    pagination: {
      pageSize, current: page.key === key ? page.value : 1, onChange: (v: number) => setPage({ key, value: v }), showSizeChanger: false, showTotal: (total: number) => `共 ${total} 条`,
    },
  };
}
