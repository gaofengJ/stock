'use client';

import {
  KeyboardEvent, useEffect, useId, useState,
} from 'react';
import { Badge, Popover } from 'antd';
import { CloseOutlined, CommentOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { useFeedbackNotifications } from '@/auth/FeedbackNotifications';

const storageKey = 'stock-feedback-floating-hidden';

export default function FeedbackFloating() {
  const { user } = useAccount();
  const { unread } = useFeedbackNotifications();
  const path = usePathname().replace(/\/$/, '') || '/';
  const panelId = useId();
  // Wait for the saved preference so a dismissed entry never flashes on reload.
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { setHidden(localStorage.getItem(storageKey) === '1'); } catch { setHidden(false); }
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        setHidden(event.key === storageKey && event.newValue === '1');
        setOpen(false);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const dismiss = () => {
    setOpen(false);
    setHidden(true);
    try { localStorage.setItem(storageKey, '1'); } catch { /* The entry still closes when storage is unavailable. */ }
  };
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') setOpen(false);
  };

  if (hidden || !allowedPath(user, '/feedback') || user?.mustChangePassword || path === '/feedback') return null;

  return (
    <div className="feedback-floating">
      <Popover
        trigger={['hover', 'click']}
        placement="topRight"
        open={open}
        onOpenChange={setOpen}
        title="意见反馈"
        content={(
          <div className="feedback-floating-actions" id={panelId}>
            <Link href="/feedback" onClick={() => setOpen(false)} onKeyDown={closeOnEscape}>打开反馈页面</Link>
            <button type="button" onClick={dismiss} onKeyDown={closeOnEscape} aria-label="关闭悬浮反馈入口">
              <CloseOutlined />
              <span>关闭悬浮入口</span>
            </button>
          </div>
        )}
      >
        <button
          type="button"
          className="feedback-floating-trigger"
          aria-label={`意见反馈${unread ? '，有未读回复' : ''}`}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onKeyDown={closeOnEscape}
        >
          <Badge dot={unread} offset={[3, 0]}><CommentOutlined /></Badge>
        </button>
      </Popover>
    </div>
  );
}
