'use client';

import { errorMessage } from '@/api/errors';
import { useAccount } from '@/auth/Boundary';
import { allowedPath, homePath } from '@/auth/client';

import React, { useEffect, useState } from 'react';
import {
  Layout,
  Button,
  Drawer,
  Grid,
  Menu,
  Dropdown,
  Tooltip,
  message,
  MenuProps,
  Popover,
} from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useRouter } from 'next/navigation';

import AccountAvatar from '@/auth/AccountAvatar';
import { MenuOutlined, WechatOutlined } from '@ant-design/icons';
import ImgFengye from '@/assets/imgs/fengye.png';
import ImgAuthorAvatar from '@/assets/imgs/author-avatar.png';
import { useOptionsState } from '@/store/useOptionsStore';
import { EThemeColors } from '@/types/common.enum';

import { headerMenuItems } from './config';

const { Header, Sider, Content } = Layout;

dayjs.locale('zh-cn');

interface ILayoutProps {
  children: React.ReactNode;
  showAsideMenu?: boolean;
  asideMenuItems?: MenuProps['items'];
  headerMenuActive: string;
  asideMenuActive?: string;
  asideMenuOpen?: string;
  contentClassName?: string;
}

const CommonLayout: React.FC<ILayoutProps> = ({
  children,
  showAsideMenu = true,
  asideMenuItems = [],
  headerMenuActive,
  asideMenuActive = '',
  asideMenuOpen = '',
  contentClassName = 'p-16',
}) => {
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const mobile = !screens.md;
  const { user, logout } = useAccount();
  const visible = (items: MenuProps['items']) => items?.filter((item) => item && allowedPath(user, String(item.key)));

  const { getAllOptions } = useOptionsState();

  /**
   * 顶部菜单选择
   */
  const handleHeaderMenuSelect = (row: { key: string }) => {
    router.push(homePath(user, row.key));
  };

  /**
   * 侧边栏菜单选择
   */
  const handleAsideMenuSelect = (row: { key: string }) => {
    router.push(row.key);
    setDrawerOpen(false);
  };

  useEffect(() => {
    // The profile remains accessible while a reset password must be changed.
    if (headerMenuActive && !user?.mustChangePassword) getAllOptions();
  }, [getAllOptions, headerMenuActive, user?.mustChangePassword]);

  return (
    <Layout className="platform-layout">
      <Header
        className="platform-header"
        style={{ backgroundColor: 'white' }}
      >
        {mobile && showAsideMenu && <Button type="text" icon={<MenuOutlined />} aria-label="打开栏目导航" onClick={() => setDrawerOpen(true)} />}
        <div className="platform-brand">
          <img src={ImgFengye.src} alt="" width={28} height={28} />
          <span>木风同学</span>
        </div>
        <Menu
          mode="horizontal"
          selectedKeys={[headerMenuActive]}
          items={visible([...(headerMenuItems || []), { key: '/admin', label: '管理后台' }])}
          onSelect={handleHeaderMenuSelect}
          className="platform-nav"
          style={{ borderBottom: 'none', minWidth: 0, flex: 1 }}
        />
        <Popover
          content={(
            <div>
              <img
                src={ImgAuthorAvatar.src}
                alt="fengye"
                className="w-200 h-200"
              />
            </div>
            )}
        >
          <div className="header-contact flex items-center cursor-pointer">
            <WechatOutlined
              style={{
                color: EThemeColors.colorLimeGreen,
              }}
            />
            <span className="ml-4 mr-16 text-12">联系作者</span>
          </div>
        </Popover>
        <Tooltip title="北京时间每日 20:30 开始同步，每15分钟补试至22:00；22:00核对，次日07:30补缺。完成时间以数据源校验结果为准。">
          <span className="sync-schedule">
            每日
            <strong>20:30</strong>
            {' '}
            开始同步
          </span>
        </Tooltip>
        <Dropdown
          menu={{
            items: [{ key: 'profile', label: '个人中心' }, { key: 'logout', label: '退出登录' }],
            onClick: ({ key }) => {
              if (key === 'profile') router.push('/profile'); else logout().catch((e) => message.error(errorMessage(e)));
            },
          }}
          placement="bottomLeft"
          arrow
        >
          <button type="button" className="header-account" aria-label="打开账户菜单">
            <AccountAvatar avatar={user?.avatar} />
          </button>
        </Dropdown>
      </Header>
      <Layout className="platform-body">
        {showAsideMenu && !mobile ? (
          <Sider width={208} collapsedWidth={64} collapsed={!screens.xl || collapsed} onCollapse={setCollapsed} collapsible={!!screens.xl}>
            <Menu
              mode="inline"
              selectedKeys={[asideMenuActive]}
              defaultOpenKeys={[asideMenuOpen]}
              items={visible(asideMenuItems)}
              className="h-full"
              style={{ borderInlineEnd: 'none' }}
              onSelect={handleAsideMenuSelect}
            />
          </Sider>
        ) : null}
        {showAsideMenu && mobile && <Drawer title="栏目导航" placement="left" width={240} open={drawerOpen} onClose={() => setDrawerOpen(false)}><Menu mode="inline" selectedKeys={[asideMenuActive]} items={visible(asideMenuItems)} onSelect={handleAsideMenuSelect} /></Drawer>}
        <Layout className={`platform-content ${contentClassName}`}>
          <Content className="platform-content-inner">{children}</Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default CommonLayout;
