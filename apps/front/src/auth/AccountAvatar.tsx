'use client';

import { Avatar } from 'antd';

export default function AccountAvatar({ avatar, size = 36 }: { avatar?: string; size?: number }) {
  const id = /^animal-[1-8]$/.test(avatar || '') ? avatar : 'animal-1';
  return <Avatar size={size} src={`/avatars/${id}.svg`} alt="账户头像" style={{ flexShrink: 0, background: '#f5ebe5' }} />;
}
