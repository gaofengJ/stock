'use client';

import { usePathname } from 'next/navigation';
import CommonLayout from '@/components/Layout';

const items = [
  { key: '/admin/users', label: '用户管理' },
  { key: '/admin/roles', label: '角色管理' },
  { key: '/admin/sync', label: '数据同步' },
  { key: '/admin/logs', label: '日志分析' },
];
export default function Layout({ children }: { children: React.ReactNode }) {
  const path = usePathname().replace(/\/$/, '');
  return (
    <CommonLayout
      headerMenuActive="/admin"
      asideMenuItems={items}
      asideMenuActive={path}
    >
      {children}
    </CommonLayout>
  );
}
