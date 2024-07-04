'use client';

import React from 'react';
import {
  Layout, ConfigProvider, Menu, Dropdown, Avatar,
} from 'antd';

import ImgFengye from '@/assets/imgs/fengye.png';
import { avatarDropdownItems, headerMenuItems, themeConfig } from './config';
import { EHeaderMenuKey } from './enum';

const { Header, Sider, Content } = Layout;

interface ILayoutProps {
  children: React.ReactNode;
  headerMenuActive: string;
  asideMenuActive: string;
}

const CommonLayout: React.FC<ILayoutProps> = ({
  children,
  headerMenuActive = EHeaderMenuKey.analysis,
  asideMenuActive,
}) => (
  <ConfigProvider theme={themeConfig}>
    <Layout className="h-[100vh]">
      <Header className="flex items-center">
        <img src={ImgFengye.src} alt="fengye" className="h-32 w-32" />
        <span className="w-216 pl-8 text-20 font-medium">木风同学</span>
        <Menu
          mode="horizontal"
          defaultSelectedKeys={[headerMenuActive]}
          items={headerMenuItems}
        />
        <span className="grow" />
        <Dropdown
          menu={{ items: avatarDropdownItems }}
          placement="bottomLeft"
          arrow
        >
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
