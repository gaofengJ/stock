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
  minBodyHeight?: number;
  bottomSpacing?: number;
  autoHeight?: boolean;
};

/** Shared table body sizing and loading; Ant Design handles synchronized fixed headers. */
export default function DataTable<Row extends object = any>({
  loading = false, scroll, locale, maxBodyHeight = 720, minBodyHeight = 240, bottomSpacing = 48, autoHeight = false, ...props
}: Props<Row>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(minBodyHeight);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || autoHeight) return undefined;
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
        setHeight(Math.max(minBodyHeight, Math.min(maxBodyHeight, Math.floor(bottom - top - offset - header - footer - bottomSpacing))));
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (area) observer.observe(area);
    // Notices and filters can change the table's position without resizing it.
    const layoutObserver = new MutationObserver(measure);
    layoutObserver.observe(area || root.parentElement || root, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      layoutObserver.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [maxBodyHeight, minBodyHeight, bottomSpacing, autoHeight]);
  return (
    <div ref={rootRef} className={`data-table${loading ? ' is-loading' : ''}`} aria-busy={loading} style={{ '--table-body-height': `${height}px` } as CSSProperties}>
      <div className="data-table-content" aria-hidden={loading || undefined}>
        <Table<Row>
          {...props}
          scroll={{ x: 'max-content', ...scroll, ...(autoHeight ? {} : { y: height }) }}
          loading={false}
          locale={{ ...locale, ...(loading ? { emptyText: <div className="data-table-loading-space" /> } : {}) }}
        />
      </div>
      {loading && <LoadingOverlay regionSelector={autoHeight ? '.ant-table-content' : '.ant-table-body'} />}
    </div>
  );
}
