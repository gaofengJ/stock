'use client';

import {
  KeyboardEvent, PointerEvent, useEffect, useId, useRef, useState,
} from 'react';
import { Badge, Popover } from 'antd';
import { CloseOutlined, CommentOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { useFeedbackNotifications } from '@/auth/FeedbackNotifications';

const storageKey = 'stock-feedback-floating-hidden';
const positionKey = 'stock-feedback-floating-position';
type Position = { x: number; y: number };
type Drag = { pointerId: number; startX: number; startY: number; left: number; top: number; moved: boolean };

// Store a viewport-relative position so resizing never strands the entry off screen.
const bounds = () => ({ x: Math.max(0, window.innerWidth - 48 - 24), y: Math.max(0, window.innerHeight - 30 - 24) });
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const fromPixels = (left: number, top: number): Position => {
  const available = bounds();
  return { x: available.x ? clamp((left - 12) / available.x) : 0, y: available.y ? clamp((top - 12) / available.y) : 0 };
};

export default function FeedbackFloating() {
  const { user } = useAccount();
  const { unread } = useFeedbackNotifications();
  const path = usePathname().replace(/\/$/, '') || '/';
  const panelId = useId();
  // Wait for the saved preference so a dismissed entry never flashes on reload.
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  const lastPosition = useRef<Position | null>(null);
  const suppressUntil = useRef(0);

  useEffect(() => {
    try { setHidden(localStorage.getItem(storageKey) === '1'); } catch { setHidden(false); }
    try {
      const saved = JSON.parse(localStorage.getItem(positionKey) || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        const restored = { x: clamp(saved.x), y: clamp(saved.y) };
        setPosition(restored);
        lastPosition.current = restored;
      }
    } catch { /* Fall back to the default corner position. */ }
    const resize = () => setViewport(bounds());
    resize();
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        setHidden(event.key === storageKey && event.newValue === '1');
        setOpen(false);
      }
    };
    window.addEventListener('storage', sync);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => { setOpen(false); }, [path]);

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    suppressUntil.current = 0;
    drag.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const { current } = drag;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < 5) return;
    current.moved = true;
    setDragging(true);
    setOpen(false);
    const next = fromPixels(current.left + dx, current.top + dy);
    lastPosition.current = next;
    setPosition(next);
  };
  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const { current } = drag;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (current.moved) {
      suppressUntil.current = Date.now() + 300;
      try { localStorage.setItem(positionKey, JSON.stringify(lastPosition.current)); } catch { /* Dragging still works without storage. */ }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

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
    <div
      className={`feedback-floating${dragging ? ' is-dragging' : ''}`}
      style={position ? {
        left: 12 + position.x * viewport.x, top: 12 + position.y * viewport.y, right: 'auto', bottom: 'auto',
      } : undefined}
    >
      <Popover
        trigger={['hover', 'click']}
        placement="topRight"
        open={open}
        onOpenChange={(next) => { if (!drag.current?.moved && Date.now() >= suppressUntil.current) setOpen(next); }}
        overlayClassName="feedback-floating-popover"
        title={(
          <div className="feedback-floating-heading">
            <span>意见反馈</span>
            <button type="button" className="feedback-floating-close" onClick={dismiss} onKeyDown={closeOnEscape} aria-label="关闭悬浮反馈入口" title="关闭悬浮入口"><CloseOutlined /></button>
          </div>
        )}
        content={(
          <div className="feedback-floating-actions" id={panelId}>
            <Link href="/feedback" onClick={() => setOpen(false)} onKeyDown={closeOnEscape}>打开反馈页面</Link>
            <small>关闭后可从账户菜单进入</small>
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
          title="意见反馈，可拖动调整位置"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={finishDrag}
          onClickCapture={(event) => {
            if (Date.now() < suppressUntil.current) { event.preventDefault(); event.stopPropagation(); }
          }}
        >
          <Badge dot={unread} offset={[3, 0]}><CommentOutlined /></Badge>
        </button>
      </Popover>
    </div>
  );
}
