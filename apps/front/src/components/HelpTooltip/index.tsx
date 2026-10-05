'use client';

import { QuestionCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';

export default function HelpTooltip({ title, label, stopPropagation = false }: { title: string; label: string; stopPropagation?: boolean }) {
  return (
    <Tooltip title={title} trigger={['hover', 'click']}>
      <button type="button" className="help-tooltip-trigger" aria-label={`${label}说明`} onClick={(event) => { if (stopPropagation) event.stopPropagation(); }}>
        <QuestionCircleOutlined aria-hidden />
      </button>
    </Tooltip>
  );
}
