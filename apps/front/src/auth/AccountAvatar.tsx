'use client';

import { Avatar } from 'antd';
import { avatarId } from './avatars';

export default function AccountAvatar({ avatar, roles, size = 36 }: {
  avatar?: string;
  roles?: { code: string }[];
  size?: number;
}) {
  const src = `/avatars/${avatarId(avatar, roles)}.svg`;
  return <Avatar size={size} src={src} alt="小牛头像" style={{ flexShrink: 0, background: '#fff0f4' }} />;
}
