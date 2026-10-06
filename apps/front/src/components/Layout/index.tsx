'use client';

import { errorMessage } from '@/api/errors';
import { useAccount } from '@/auth/Boundary';
import { useFeedbackNotifications } from '@/auth/FeedbackNotifications';
import { allowedPath, homePath } from '@/auth/client';

import React, { useEffect, useState } from 'react';
import {
  Layout,
  Button,
  Drawer,
  Grid,
  Menu,
  Dropdown,
  message,
  MenuProps,
  Popover,
  Watermark,
  Badge,
} from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import AccountAvatar from '@/auth/AccountAvatar';
import HelpTooltip from '@/components/HelpTooltip';
import { LoginActivityContext, useLoginActivity } from '@/auth/LoginActivity';
import {
  CommentOutlined, MenuOutlined, WechatOutlined, GiftOutlined, UserOutlined, LogoutOutlined,
} from '@ant-design/icons';
import ImgFengye from '@/assets/imgs/fengye.png';
import ImgAuthorContact from '@/assets/imgs/author-contact.webp';
import ImgAuthorReward from '@/assets/imgs/author-reward.webp';
import { useOptionsState } from '@/store/useOptionsStore';
import { withAlpha } from '@/colors';
import { ThemeToggle, useSiteTheme } from '@/components/SiteTheme';

import { headerMenuItems } from './config';
import FeedbackFloating from './FeedbackFloating';

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

function AccountMenuPanel({ menu }: { menu: React.ReactNode }) {
  const { user } = useAccount();
  return (
    <div className="header-account-panel">
      <div className="header-account-summary">
        <AccountAvatar avatar={user?.avatar} roles={user?.roles} size={40} />
        <div>
          <strong>{user?.nickname || user?.username}</strong>
          <span>{`@${user?.username || ''}`}</span>
        </div>
      </div>
      {menu}
    </div>
  );
}

const renderAccountMenu = (menu: React.ReactNode) => <AccountMenuPanel menu={menu} />;

const CommonLayout: React.FC<ILayoutProps> = ({
  children,
  showAsideMenu = true,
  asideMenuItems = [],
  headerMenuActive,
  asideMenuActive = '',
  asideMenuOpen = '',
  contentClassName = 'p-16',
}) => {
  const { colors } = useSiteTheme();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const mobile = !screens.md;
  const { user, logout, trialRemaining } = useAccount();
  const { unread: feedbackUnread } = useFeedbackNotifications();
  const canReadActivity = !!user?.permissions.includes('users:manage');
  const activity = useLoginActivity(canReadActivity);
  const adminLabel = (
    <Badge className="header-admin-badge" count={canReadActivity ? activity.data.unread : 0} overflowCount={100} size="small" offset={[8, -2]}>
      <span className="header-nav-label">管理后台</span>
    </Badge>
  );
  const accountName = user?.nickname || user?.username || '我的账户';
  const visible = (items: MenuProps['items']) => items?.filter((item) => item && allowedPath(user, String(item.key)));

  const { getAllOptions } = useOptionsState();

  /**
   * 顶部菜单选择
   */
  const handleHeaderMenuSelect = (row: { key: string }) => {
    router.push(row.key === '/admin' && canReadActivity && activity.data.unread > 0
      ? '/admin/users/activity' : homePath(user, row.key));
    setDrawerOpen(false);
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

  useEffect(() => {
    // Warm the image cache before the lazily mounted popovers are opened.
    [ImgAuthorContact.src, ImgAuthorReward.src].forEach((src) => {
      const image = new window.Image();
      image.src = src;
      image.decode().catch(() => {});
    });
  }, []);

  return (
    <Layout className="platform-layout">
      <Header
        className={`platform-header${user?.guest ? ' is-guest' : ''}`}
        style={{ backgroundColor: colors.surface }}
      >
        {mobile && <Button type="text" icon={<MenuOutlined />} aria-label="打开栏目导航" onClick={() => setDrawerOpen(true)} />}
        <Link href={homePath(user)} className="platform-brand" aria-label="木风同学，返回首页">
          <img src={ImgFengye.src} alt="" width={28} height={28} />
          <span>木风同学</span>
        </Link>
        {!mobile && (
        <Menu
          mode="horizontal"
          selectedKeys={[headerMenuActive]}
          items={visible([...(headerMenuItems || []), { key: '/admin', label: adminLabel }])}
          onClick={handleHeaderMenuSelect}
          className="platform-nav"
          style={{ borderBottom: 'none', minWidth: 0, flex: '1 1 auto' }}
        />
        )}
        <div className="header-tools">
          <ThemeToggle />
          <Popover
            trigger={['hover', 'click']}
            placement="bottomRight"
            content={(
              <div className="header-contact-content">
                <img
                  src={ImgAuthorContact.src}
                  alt="作者微信二维码"
                  width={200}
                  height={200}
                  className="w-200 h-200"
                />
                <span>微信扫码联系作者</span>
              </div>
            )}
          >
            <button type="button" className="header-contact" aria-label="联系作者">
              <WechatOutlined
                style={{
                  color: colors.wechat,
                }}
              />
              <span>联系作者</span>
            </button>
          </Popover>
          <Popover
            trigger={['hover', 'click']}
            placement="bottomRight"
            content={(
              <div className="header-contact-content">
                <img
                  src={ImgAuthorReward.src}
                  alt="作者微信收款二维码"
                  width={200}
                  height={200}
                  className="w-200 h-200"
                />
                <span>微信扫码打赏作者</span>
              </div>
            )}
          >
            <button type="button" className="header-contact" aria-label="打赏作者">
              <GiftOutlined style={{ color: colors.wechat }} />
              <span>打赏作者</span>
            </button>
          </Popover>
          <span className="sync-schedule">
            <span className="sync-schedule-label">
              盘后数据
              <strong>20:30</strong>
              起同步
            </span>
            <HelpTooltip label="盘后数据同步" title="每日北京时间 20:30 开始同步，次日早间补齐遗漏。实际更新情况以页面的数据日期为准。" />
          </span>
          {user?.guest ? (
            <div className="guest-account-tools">
              <span className="guest-countdown" role="timer" aria-label="游客体验剩余时间">
                体验
                {Math.floor(trialRemaining / 60)}
                :
                {String(trialRemaining % 60).padStart(2, '0')}
              </span>
              <Link href="/login">登录</Link>
              <Link href="/register" className="guest-register">免费注册</Link>
            </div>
          ) : (
            <Dropdown
              trigger={mobile ? ['click'] : ['hover', 'click']}
              open={accountOpen}
              onOpenChange={setAccountOpen}
              overlayClassName="header-account-popup"
              dropdownRender={renderAccountMenu}
              menu={{
                items: [
                  { key: 'profile', label: '个人中心', icon: <UserOutlined /> },
                  { key: 'feedback', label: <Badge dot={feedbackUnread} offset={[7, 0]}><span>意见反馈</span></Badge>, icon: <CommentOutlined /> },
                  { type: 'divider' },
                  { key: 'logout', label: '退出登录', icon: <LogoutOutlined /> },
                ],
                onClick: ({ key }) => {
                  setAccountOpen(false);
                  if (key === 'profile' || key === 'feedback') router.push(`/${key}`); else logout().catch((e) => message.error(errorMessage(e)));
                },
              }}
              placement="bottomRight"
            >
              <button type="button" className="header-account" aria-label={`${accountName}，账户菜单${feedbackUnread ? '，有未读反馈或回复' : ''}`} aria-haspopup="menu" aria-expanded={accountOpen}>
                <Badge dot={feedbackUnread}>
                  <AccountAvatar avatar={user?.avatar} roles={user?.roles} size={28} />
                </Badge>
                <span className="header-account-name">{accountName}</span>
                <svg className="header-account-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </Dropdown>
          )}
        </div>
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
        {mobile && (
          <Drawer title="栏目导航" placement="left" width={280} open={drawerOpen} onClose={() => setDrawerOpen(false)}>
            <Menu mode="inline" selectedKeys={[headerMenuActive]} items={visible([...(headerMenuItems || []), { key: '/admin', label: adminLabel }])} onClick={handleHeaderMenuSelect} />
            {showAsideMenu && !!asideMenuItems?.length && (
              <>
                <p className="drawer-section-label">当前栏目</p>
                <Menu mode="inline" selectedKeys={[asideMenuActive]} items={visible(asideMenuItems)} onClick={handleAsideMenuSelect} />
              </>
            )}
          </Drawer>
        )}
        <Layout className={`platform-content ${contentClassName}`}>
          <Content className="platform-content-inner">
            <Watermark className="platform-watermark" font={{ color: withAlpha(colors.text, 0.035), fontSize: 12 }} gap={[180, 160]} height={40} width={160} content="木风同学的投资小站">
              <LoginActivityContext.Provider value={activity}>{children}</LoginActivityContext.Provider>
            </Watermark>
          </Content>
        </Layout>
      </Layout>
      <FeedbackFloating />
    </Layout>
  );
};

export default CommonLayout;
