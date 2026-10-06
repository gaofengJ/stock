'use client';

import {
  TeamOutlined, SafetyCertificateOutlined, SyncOutlined, FileSearchOutlined, BellOutlined,
} from '@ant-design/icons';
import { usePathname } from 'next/navigation';
import CommonLayout from '@/components/Layout';

const items = [
  { key: '/admin/users', label: '用户管理', icon: <TeamOutlined /> },
  { key: '/admin/users/activity', label: '登录动态', icon: <BellOutlined /> },
  { key: '/admin/roles', label: '角色管理', icon: <SafetyCertificateOutlined /> },
  { key: '/admin/sync', label: '数据同步', icon: <SyncOutlined /> },
  { key: '/admin/logs', label: '日志中心', icon: <FileSearchOutlined /> },
];
export default function Layout({ children }: { children: React.ReactNode }) {
  const path = usePathname().replace(/\/$/, '');
  return (
    <CommonLayout
      headerMenuActive="/admin"
      asideMenuItems={items}
      asideMenuActive={path}
    >
      <main className="account-page admin-page account-surface">{children}</main>
    </CommonLayout>
  );
}
