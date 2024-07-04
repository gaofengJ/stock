'use client';

import React from 'react';
import {
  Layout,
  ConfigProvider,
  Menu,
  Dropdown,
  Avatar,
  message,
  MenuProps,
} from 'antd';

import ImgFengye from '@/assets/imgs/fengye.png';
import { avatarDropdownItems, headerMenuItems, themeConfig } from './config';
import { EHeaderMenuKey } from './enum';

const { Header, Sider, Content } = Layout;

interface ILayoutProps {
  children: React.ReactNode;
  asideMenuItems: MenuProps['items'];
  headerMenuActive: string;
  asideMenuActive: string;
}

const CommonLayout: React.FC<ILayoutProps> = ({
  children,
  asideMenuItems,
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
          menu={{
            items: avatarDropdownItems,
            onClick: ({ key }) => {
              message.success(`${key}敬请期待`);
            },
          }}
          placement="bottomLeft"
          arrow
        >
          <Avatar className="text-white cursor-pointer">User</Avatar>
        </Dropdown>
      </Header>
      <Layout>
        <Sider width={256} collapsible>
          <Menu
            mode="inline"
            defaultSelectedKeys={[asideMenuActive]}
            defaultOpenKeys={[asideMenuActive]}
            items={asideMenuItems}
            className="h-full"
            style={{ borderInlineEnd: 'none' }}
          />
        </Sider>
        <Layout className="overflow-y-auto p-16">
          <Content>{children}</Content>
        </Layout>
      </Layout>
    </Layout>
  </ConfigProvider>
);

export default CommonLayout;
