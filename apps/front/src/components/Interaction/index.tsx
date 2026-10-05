/* eslint-disable react/jsx-props-no-spreading */

'use client';

import { forwardRef, ComponentProps, ComponentRef } from 'react';
import Link from 'next/link';
import { Button, ButtonProps } from 'antd';
import {
  ArrowRightOutlined, CheckCircleFilled, DownOutlined, ExportOutlined, EyeOutlined, UpOutlined,
} from '@ant-design/icons';

/** Content navigation only; menus, breadcrumbs and page-local filters keep their own semantics. */
const NavigationLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(({
  children, className = '', title, target, ...props
}, ref) => {
  const newWindow = target === '_blank';
  return (
    <Link ref={ref} {...props} target={target} className={`interaction-link ${className}`} title={`${title ? `${title} · ` : ''}${newWindow ? '在新窗口打开' : '前往详情页面'}`}>
      {children}
      <span className="interaction-link-mark" aria-hidden="true">{newWindow ? <ExportOutlined /> : <ArrowRightOutlined />}</span>
      {newWindow && <span className="interaction-sr-only">（在新窗口打开）</span>}
    </Link>
  );
});
NavigationLink.displayName = 'NavigationLink';
export default NavigationLink;

export function ExternalLink({
  children, className = '', title, ...props
}: ComponentProps<'a'>) {
  return (
    <a {...props} target="_blank" rel="noopener noreferrer" className={`interaction-link ${className}`} title={`${title ? `${title} · ` : ''}在新窗口打开`}>
      {children}
      <span className="interaction-link-mark" aria-hidden="true"><ExportOutlined /></span>
      <span className="interaction-sr-only">（在新窗口打开）</span>
    </a>
  );
}

type InteractionProps = Omit<ButtonProps, 'href' | 'target' | 'type'> & {
  intent: 'select' | 'preview' | 'expand' | 'popover';
  selected?: boolean;
  expanded?: boolean;
};

/** A real button preserves keyboard activation and forwards refs/events for Popover. */
export const InteractionButton = forwardRef<ComponentRef<typeof Button>, InteractionProps>(({
  intent, selected = false, expanded = false, children, className = '', title, icon, ...props
}, ref) => {
  const hints = {
    select: '切换当前页内容', preview: '打开预览面板', expand: expanded ? '收起内容' : '展开内容', popover: '展开更多选项',
  };
  const marks = {
    select: selected ? <CheckCircleFilled /> : <span className="interaction-choice-mark" />,
    preview: <EyeOutlined />,
    expand: expanded ? <UpOutlined /> : <DownOutlined />,
    popover: <DownOutlined />,
  };
  return (
    <Button
      ref={ref}
      size="small"
      {...props}
      type="default"
      className={`interaction-button interaction-${intent} ${className}`}
      title={`${title ? `${title} · ` : ''}${hints[intent]}`}
      aria-pressed={intent === 'select' ? selected : undefined}
      aria-expanded={intent === 'expand' ? expanded : props['aria-expanded']}
      aria-haspopup={intent === 'preview' ? 'dialog' : props['aria-haspopup']}
      icon={icon || <span aria-hidden="true">{marks[intent]}</span>}
    >
      {children}
    </Button>
  );
});
InteractionButton.displayName = 'InteractionButton';
