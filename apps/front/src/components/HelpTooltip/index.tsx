'use client';

import { Tooltip } from 'antd';

export default function HelpTooltip({ title, label, stopPropagation = false }: { title: string; label: string; stopPropagation?: boolean }) {
  return (
    <Tooltip title={title} trigger={['hover', 'click']}>
      <button type="button" className="help-tooltip-trigger" aria-label={`${label}说明`} onClick={(event) => { if (stopPropagation) event.stopPropagation(); }}>
        <svg className="help-tooltip-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.25 6a1.75 1.75 0 0 1 3.5 0c0 1.25-1.75 1.25-1.75 2.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11" r=".85" fill="currentColor" />
        </svg>
      </button>
    </Tooltip>
  );
}
