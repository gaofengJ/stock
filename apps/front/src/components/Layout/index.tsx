'use client';

import { useAccount } from '@/auth/Boundary';
import { allowedPath, homePath } from '@/auth/client';

import React, { useEffect } from 'react';
import {
  Layout,
  ConfigProvider,
  Menu,
  Dropdown,
  Tooltip,
  message,
  MenuProps,
  Popover,
} from 'antd';
import zhCN from 'antd/es/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useRouter } from 'next/navigation';

import AccountAvatar from '@/auth/AccountAvatar';
import { WechatOutlined } from '@ant-design/icons';
import ImgFengye from '@/assets/imgs/fengye.png';
import ImgAuthorAvatar from '@/assets/imgs/author-avatar.png';
import { useOptionsState } from '@/store/useOptionsStore';
import { EThemeColors } from '@/types/common.enum';

import { headerMenuItems, themeConfig } from './config';

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
  };

  useEffect(() => {
    // The profile remains accessible while a reset password must be changed.
    if (headerMenuActive && !user?.mustChangePassword) getAllOptions();
  }, [getAllOptions, headerMenuActive, user?.mustChangePassword]);

  return (
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <Layout className="h-[100vh] min-w-[1080px]">
        <Header
          className="flex items-center border-b border-[#f0f0f0]"
          style={{ backgroundColor: 'white' }}
        >
          <img src={ImgFengye.src} alt="fengye" className="w-32 h-32" />
          <span className="w-216 pl-8 text-20 font-medium">木风同学</span>
          <Menu
            mode="horizontal"
            defaultSelectedKeys={[headerMenuActive]}
            items={visible([...(headerMenuItems || []), { key: '/admin', label: '管理后台' }])}
            onSelect={handleHeaderMenuSelect}
            className="border-b-0"
            style={{ borderBottom: 'none' }}
          />
          <span className="grow" />
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
            <div className="flex items-center cursor-pointer">
              <WechatOutlined
                style={{
                  color: EThemeColors.colorLimeGreen,
                }}
              />
              <span className="ml-4 mr-16 text-12">联系作者</span>
            </div>
          </Popover>
          <Tooltip title="北京时间每日 20:30 开始同步；未完整时于 20:45、21:00、21:15、21:30 自动补试，完成时间以数据源为准。">
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
                if (key === 'profile') router.push('/profile'); else logout().catch((e) => message.error(e.message));
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
        <Layout>
          {showAsideMenu ? (
            <Sider width={256} collapsible>
              <Menu
                mode="inline"
                defaultSelectedKeys={[asideMenuActive]}
                defaultOpenKeys={[asideMenuOpen]}
                items={visible(asideMenuItems)}
                className="h-full"
                style={{ borderInlineEnd: 'none' }}
                onSelect={handleAsideMenuSelect}
              />
            </Sider>
          ) : null}
          <Layout className={`overflow-y-auto ${contentClassName}`}>
            <Content>{children}</Content>
          </Layout>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default CommonLayout;
