/* eslint-disable react/jsx-props-no-spreading */

'use client';

import { useState } from 'react';
import { Button, Popover, Tooltip } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import Link, { InteractionButton } from '@/components/Interaction';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import {
  canViewStockChart, stockHref, stockSymbol, validStockCode,
} from '@/utils/stock-interaction';
import { useStockActions } from './context';
import './stock-actions.css';

interface Props {
  code: string; name?: string; date?: string; label?: React.ReactNode;
  onChart?: () => void; onDetails?: () => void; chartOpen?: boolean;
}
/** Explicit actions keep stock navigation separate from page-specific selection. */
export default function StockActions({
  code, name, date, label = '股票操作', onChart, onDetails, chartOpen = false,
}: Props) {
  const { user } = useAccount();
  const actions = useStockActions();
  const [open, setOpen] = useState(false);
  if (!validStockCode(code)) return <span>{label}</span>;
  const symbol = stockSymbol(code);
  const canDetails = allowedPath(user, '/basic/stock/detail');
  const canChart = canViewStockChart(user);
  let chartHint: string | undefined;
  if (!canChart) chartHint = '当前账号没有个股K线权限';
  else if (chartOpen) chartHint = '正在查看该股票K线';
  return (
    <Popover
      trigger={['hover', 'click']}
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
          {canDetails ? <Link href={stockHref(code, date)} title="查看个股详情" onClick={() => { setOpen(false); onDetails?.(); }}>查看详情</Link> : <Tooltip title="当前账号没有个股详情权限"><span><Button type="text" size="small" disabled>查看详情</Button></span></Tooltip>}
          <Tooltip title={chartHint}>
            <span>
              <InteractionButton intent="preview" disabled={!canChart || chartOpen} onClick={() => { setOpen(false); if (onChart) onChart(); else actions.openChart({ code, name, date }); }}>查看K线</InteractionButton>
            </span>
          </Tooltip>
          <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => { setOpen(false); actions.copyCode(code); }}>复制代码</Button>
          <p>复制六位代码后，可在同花顺桌面端输入代码查看K线。</p>
        </div>
      )}
    >
      <InteractionButton className="stock-action-trigger" intent="popover" aria-label={`${name || symbol}股票操作`} aria-haspopup="dialog" aria-expanded={open} title="查看详情、K线或复制代码">{label}</InteractionButton>
    </Popover>
  );
}
export function StockLink({ label, ...props }: Props) {
  return <StockActions {...props} label={label || props.name || stockSymbol(props.code)} />;
}
