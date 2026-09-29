'use client';

import { QuestionCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';

export default function HelpTooltip({ title, label }: { title: string; label: string }) {
  return (
    <Tooltip title={title} trigger={['hover', 'focus', 'click']}>
      <button type="button" className="help-tooltip-trigger" aria-label={`${label}说明`}>
        <QuestionCircleOutlined aria-hidden />
      </button>
    </Tooltip>
  );
}
