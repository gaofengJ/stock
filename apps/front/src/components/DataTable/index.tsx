/* eslint-disable react/jsx-props-no-spreading */

'use client';

import { Table, TableProps } from 'antd';
import {
  CSSProperties, useEffect, useRef, useState,
} from 'react';
import { LoadingOverlay } from '@/components/Loading';
import './table.css';

type Props<Row extends object> = Omit<TableProps<Row>, 'loading' | 'scroll'> & {
  loading?: boolean;
  scroll?: Omit<NonNullable<TableProps<Row>['scroll']>, 'y'>;
  maxBodyHeight?: number;
};

/** Shared table body sizing and loading; Ant Design handles synchronized fixed headers. */
export default function DataTable<Row extends object = any>({
  loading = false, scroll, locale, maxBodyHeight = 720, ...props
}: Props<Row>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(240);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const area = root.closest<HTMLElement>('.ant-drawer-body, .ant-modal-body, .platform-content');
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = root.getBoundingClientRect();
        if (!rect.width) return;
        const bounds = area?.getBoundingClientRect();
        const top = Math.max(0, bounds?.top ?? 0);
        const bottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight);
        // Include the parent's scroll offset so body height does not jump while scrolling.
        const offset = Math.max(0, rect.top - top + (area?.scrollTop ?? window.scrollY));
        const header = root.querySelector('.ant-table-header')?.getBoundingClientRect().height || 48;
        const footer = root.querySelector('.ant-pagination')?.getBoundingClientRect().height || 0;
        setHeight(Math.max(240, Math.min(maxBodyHeight, Math.floor(bottom - top - offset - header - footer - 48))));
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (area) observer.observe(area);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [maxBodyHeight]);
  return (
    <div ref={rootRef} className={`data-table${loading ? ' is-loading' : ''}`} aria-busy={loading} style={{ '--table-body-height': `${height}px` } as CSSProperties}>
      <div className="data-table-content" aria-hidden={loading || undefined}>
        <Table<Row>
          {...props}
          scroll={{ x: 'max-content', ...scroll, y: height }}
          loading={false}
          locale={{ ...locale, ...(loading ? { emptyText: <div className="data-table-loading-space" /> } : {}) }}
        />
      </div>
      {loading && <LoadingOverlay regionSelector=".ant-table-body" />}
    </div>
  );
}
