/* eslint-disable react/jsx-props-no-spreading */

'use client';

import {
  ComponentRef, KeyboardEvent, useRef, useState,
} from 'react';
import { Button, Popover, Tooltip } from 'antd';
import { CopyOutlined, EyeOutlined, FileTextOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { InteractionButton } from '@/components/Interaction';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import {
  canViewStockChart, stockHref, stockSymbol, validStockCode,
} from '@/utils/stock-interaction';
import { useStockActions } from './context';
import { useStockList } from './ListScope';
import './stock-actions.css';

interface Props {
  code: string; name?: string; date?: string; label?: React.ReactNode;
  navigation?: readonly unknown[];
  onChart?: (rows: any[]) => void; onDetails?: () => void; chartOpen?: boolean;
}
/** Explicit actions keep stock navigation separate from page-specific selection. */
export default function StockActions({
  code, name, date, label = '股票操作', onChart, onDetails, chartOpen = false, navigation,
}: Props) {
  const { user } = useAccount();
  const actions = useStockActions();
  const listRows = useStockList();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<ComponentRef<typeof Button>>(null);
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
  };
  if (!validStockCode(code)) return <span>{label}</span>;
  const symbol = stockSymbol(code);
  const canDetails = allowedPath(user, '/basic/stock/detail');
  const canChart = canViewStockChart(user);
  let chartHint: string | undefined;
  if (!canChart) chartHint = '当前账号没有个股K线权限';
  else if (chartOpen) chartHint = '正在查看该股票K线';
  return (
    <Popover
      trigger={['click']}
      open={open}
      onOpenChange={setOpen}
      title={(
        <span className="stock-actions-title">
          <strong>{name || symbol}</strong>
          <span>{code}</span>
        </span>
      )}
      getPopupContainer={(trigger) => trigger.closest<HTMLElement>('.ant-modal-content, .ant-drawer-content') || document.body}
      content={(
        <div className="stock-actions-menu">
          {canDetails ? (
            <Link className="stock-action-item" aria-label="个股详情" href={stockHref(code, date)} onKeyDown={closeOnEscape} onClick={() => { setOpen(false); onDetails?.(); }}>
              <FileTextOutlined />
              <span>个股详情</span>
            </Link>
          ) : <Tooltip title="当前账号没有个股详情权限"><span><Button className="stock-action-item" type="text" icon={<FileTextOutlined />} aria-label="个股详情" disabled>个股详情</Button></span></Tooltip>}
          <Tooltip title={chartHint}>
            <span>
              <Button className="stock-action-item" type="text" icon={<EyeOutlined />} aria-label="预览K线" disabled={!canChart || chartOpen} onKeyDown={closeOnEscape} onClick={() => { setOpen(false); const rows = navigation || listRows(); if (onChart) onChart([...rows]); else actions.openChart({ code, name, date }, rows); }}>预览K线</Button>
            </span>
          </Tooltip>
          <div className="stock-action-copy">
            <Button className="stock-action-item" type="text" icon={<CopyOutlined />} aria-label="复制代码" onKeyDown={closeOnEscape} onClick={() => { setOpen(false); actions.copyCode(code); }}>复制代码</Button>
          </div>
        </div>
      )}
    >
      <InteractionButton ref={triggerRef} className="stock-action-trigger" intent="popover" aria-label={`${name || symbol}股票操作`} aria-haspopup="dialog" aria-expanded={open} title="个股详情、预览K线或复制代码" onKeyDown={closeOnEscape}>{label}</InteractionButton>
    </Popover>
  );
}
export function StockLink({ label, ...props }: Props) {
  return <StockActions {...props} label={label || props.name || stockSymbol(props.code)} />;
}
