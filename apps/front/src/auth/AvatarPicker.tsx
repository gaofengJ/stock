'use client';

import { useState } from 'react';
import { Button, Modal, message } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { errorMessage } from '@/api/errors';
import { api } from './client';
import { useAccount } from './Boundary';
import AccountAvatar from './AccountAvatar';
import { avatarColors, avatarId, avatarOptions } from './avatars';

export default function AvatarPicker() {
  const { user, refresh } = useAccount();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [color, setColor] = useState('all');
  if (!user || user.mustChangePassword) return null;
  const options = avatarOptions();
  const visible = color === 'all' ? options : options.filter((option) => option.color === color);
  const current = avatarId(user.avatar, user.roles);
  const save = async () => {
    setSaving(true);
    try {
      await api('/users/me', 'PATCH', { avatar: selected });
      await refresh();
      setOpen(false);
      message.success('头像已更新');
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Button className="profile-avatar-change" onClick={() => { setSelected(current); setColor('all'); setOpen(true); }}>更换头像</Button>
      <Modal
        title="选择你的小牛头像"
        open={open}
        width={620}
        okText="保存头像"
        cancelText="取消"
        confirmLoading={saving}
        okButtonProps={{ disabled: !options.some((option) => option.id === selected) || selected === current }}
        cancelButtonProps={{ disabled: saving }}
        closable={!saving}
        maskClosable={!saving}
        keyboard={!saving}
        onCancel={() => setOpen(false)}
        onOk={save}
      >
        <p className="profile-caption">7种颜色 × 4种款式，共28款，所有用户均可选择。</p>
        <div className="avatar-color-filters" role="group" aria-label="按颜色筛选头像">
          <Button size="small" type={color === 'all' ? 'primary' : 'default'} aria-pressed={color === 'all'} onClick={() => setColor('all')}>全部</Button>
          {avatarColors.map((item) => (
            <Button key={item.id} size="small" type={color === item.id ? 'primary' : 'default'} aria-pressed={color === item.id} onClick={() => setColor(item.id)}>
              <span className="avatar-color-dot" style={{ background: item.swatch }} />
              {item.name}
            </Button>
          ))}
        </div>
        <div className="avatar-choice-scroll">
          <div className="avatar-choice-grid" role="group" aria-label="小牛头像">
            {visible.map((option) => (
              <button key={option.id} type="button" className="avatar-choice" aria-pressed={selected === option.id} aria-label={option.name} disabled={saving} onClick={() => setSelected(option.id)}>
                <AccountAvatar avatar={option.id} roles={user.roles} size={64} />
                <span>{option.name}</span>
                {selected === option.id && <CheckCircleFilled className="avatar-choice-check" />}
              </button>
            ))}
          </div>
        </div>
        <p className="avatar-selection-note" aria-live="polite">{`已选：${options.find((option) => option.id === selected)?.name || '保留当前头像'}`}</p>
      </Modal>
    </>
  );
}
