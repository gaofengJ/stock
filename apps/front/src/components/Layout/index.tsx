'use client';

import React from 'react';
import {
  Layout, ConfigProvider, theme, Menu, Dropdown, Avatar,
} from 'antd';

import ImgFengye from '@/assets/imgs/fengye.png';
import { dropdownItems, headerMenuItems } from './config';

const { Header, Sider, Content } = Layout;

interface IProps {
  children: React.ReactNode;
  headerTabActive: string;
  asideTabActive: string;
}

const CommonLayout: React.FC<IProps> = ({
  children,
  headerTabActive,
  asideTabActive,
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
          defaultSelectedKeys={[headerTabActive]}
          items={headerMenuItems}
        />
        <span className="grow" />
        <Dropdown menu={{ items: dropdownItems }} placement="bottomLeft" arrow>
          <Avatar className="text-white">Admin</Avatar>
        </Dropdown>
      </Header>
      <Layout>
        <Sider width={256} collapsible>
          <Menu
            mode="inline"
            defaultSelectedKeys={[asideTabActive]}
            defaultOpenKeys={[asideTabActive]}
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
