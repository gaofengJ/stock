'use client';

import React from 'react';
import {
  Layout, ConfigProvider, theme, Menu, Dropdown, Avatar,
} from 'antd';

import ImgFengye from '@/assets/imgs/fengye.png';
import { avatarDropdownItems, headerMenuItems } from './config';

const { Header, Sider, Content } = Layout;

interface ILayoutProps {
  children: React.ReactNode;
  headerMenuActive: string;
  asideMenuActive: string;
}

const CommonLayout: React.FC<ILayoutProps> = ({
  children,
  headerMenuActive,
  asideMenuActive,
}) => (
  <ConfigProvider
    theme={{
      token: {
        colorPrimary: 'red',
      },
      algorithm: theme.defaultAlgorithm,
    }}
  >
    <Layout className="h-[100vh]">
      <Header className="flex items-center bg-[#FFF]">
        <img src={ImgFengye.src} alt="fengye" className="h-32 w-32" />
        <span className="p-[0_80px_0_8px] text-20 font-medium">木风同学</span>
        <Menu
          mode="horizontal"
          defaultSelectedKeys={[headerMenuActive]}
          items={headerMenuItems}
        />
        <span className="grow" />
        <Dropdown menu={{ items: avatarDropdownItems }} placement="bottomLeft" arrow>
          <Avatar className="text-white">Admin</Avatar>
        </Dropdown>
      </Header>
      <Layout>
        <Sider width={256} collapsible>
          <Menu
            mode="inline"
            defaultSelectedKeys={[asideMenuActive]}
            defaultOpenKeys={[asideMenuActive]}
            className="h-full"
            style={{ borderRight: '1px solid #e3e5e7' }}
            items={headerMenuItems}
          />
        </Sider>
        <Layout className="overflow-y-auto p-[0_24px_24px_24px]">
          <Content>{children}</Content>
        </Layout>
      </Layout>
    </Layout>
  </ConfigProvider>
);

export default CommonLayout;
