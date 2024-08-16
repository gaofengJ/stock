'use client';

import React, { useEffect } from 'react';
import {
  Layout,
  ConfigProvider,
  Menu,
  Dropdown,
  Avatar,
  message,
  MenuProps,
} from 'antd';
import zhCN from 'antd/es/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useRouter } from 'next/navigation';

import ImgFengye from '@/assets/imgs/fengye.png';
import { useOptionsState } from '@/store/useOptionsStore';

import { avatarDropdownItems, headerMenuItems, themeConfig } from './config';

const { Header, Sider, Content } = Layout;

dayjs.locale('zh-cn');

interface ILayoutProps {
  children: React.ReactNode;
  showAsideMenu?: boolean;
  asideMenuItems?: MenuProps['items'];
  headerMenuActive: string;
  asideMenuActive?: string;
  asideMenuOpen?: string;
}

const CommonLayout: React.FC<ILayoutProps> = ({
  children,
  showAsideMenu = true,
  asideMenuItems = [],
  headerMenuActive,
  asideMenuActive = '',
  asideMenuOpen = '',
}) => {
  const router = useRouter();

  const { getAllOptions } = useOptionsState();

  /**
   * 顶部菜单选择
   */
  const handleHeaderMenuSelect = (row: { key: string }) => {
    router.push(row.key);
  };

  /**
   * 侧边栏菜单选择
   */
  const handleAsideMenuSelect = (row: { key: string }) => {
    router.push(row.key);
  };

  useEffect(() => {
    getAllOptions(); // 获取所有选项
  }, [getAllOptions]);

  return (
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <Layout className="h-[100vh] min-w-[1080px]">
        <Header className="flex items-center">
          <img src={ImgFengye.src} alt="fengye" className="h-32 w-32" />
          <span className="w-216 pl-8 text-20 font-medium">木风同学</span>
          <Menu
            mode="horizontal"
            defaultSelectedKeys={[headerMenuActive]}
            items={headerMenuItems}
            onSelect={handleHeaderMenuSelect}
          />
          <span className="grow" />
          <span className="mr-16 text-text-pink-red78">每晚20: 00更新当日数据</span>
          <Dropdown
            menu={{
              items: avatarDropdownItems,
              onClick: ({ key }) => {
                message.success(`${key}敬请期待`);
              },
            }}
            placement="bottomLeft"
            arrow
          >
            <Avatar className="basis-[32px] text-white cursor-pointer">User</Avatar>
          </Dropdown>
        </Header>
        <Layout>
          {showAsideMenu ? (
            <Sider width={256} collapsible>
              <Menu
                mode="inline"
                defaultSelectedKeys={[asideMenuActive]}
                defaultOpenKeys={[asideMenuOpen]}
                items={asideMenuItems}
                className="h-full"
                style={{ borderInlineEnd: 'none' }}
                onSelect={handleAsideMenuSelect}
              />
            </Sider>
          ) : null}
          <Layout className="overflow-y-auto p-16">
            <Content>{children}</Content>
          </Layout>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default CommonLayout;
