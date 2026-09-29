'use client';

import { BellOutlined } from '@ant-design/icons';
import LoginActivity from '@/auth/LoginActivity';
import PageHeading from '@/auth/PageHeading';

export default function Page() {
  return (
    <>
      <PageHeading title="登录动态" description="查看普通用户的登录与注册记录，管理未读提醒。" icon={<BellOutlined />} />
      <LoginActivity />
    </>
  );
}
