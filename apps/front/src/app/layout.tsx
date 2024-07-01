import type { Metadata } from 'next';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Inter } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import Image from 'next/image';
import {
  Avatar,
  ConfigProvider, Dropdown, Layout, Menu,
} from 'antd';
import ImgFengye from '@/assets/imgs/fengye.png';
import './globals.css';
import {
  dropdownItems, headerMenuItems,
} from './config';

const inter = Inter({ subsets: ['latin'] }); // 仅加载 Inter 字体的拉丁字母子集。这有助于减少字体文件的大小，从而提高页面加载速度

export const metadata: Metadata = {
  title: 'Stock',
  description: '木风同学的投资小站',
};

const { Header, Sider, Content } = Layout;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const { pathname } = router;
  const pathArr = pathname.split('/');
  const basePath = pathArr[1];
  const mainMenuKey = pathArr.slice(0, 3).join('/');
  const [selectedHeaderTab, setSelectedHeaderTab] = useState(basePath);

  // const curRouteItem = routeItems.find(
  //   (routeItem: IrouteItem) => routeItem.key === basePath,
  // );

  useEffect(() => {
    setSelectedHeaderTab(basePath);
  }, [basePath]);

  return (
    <html lang="en">
      <body className={inter.className}>
        <AntdRegistry>
          <ConfigProvider>
            <Layout className="h-[100vh]">
              <Header>
                <Image src={ImgFengye} alt="fengye" />
                <span className="p-[0_80px_0_4px] text-20 text-500">
                  木风同学
                </span>
                <Menu
                  mode="horizontal"
                  defaultSelectedKeys={[selectedHeaderTab]}
                  items={headerMenuItems}
                />
                <span className="grow" />
                <Dropdown
                  menu={{ items: dropdownItems }}
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
                    defaultSelectedKeys={[selectedHeaderTab]}
                    defaultOpenKeys={[mainMenuKey]}
                    className="h-full"
                    style={{ borderRight: '1px solid #e3e5e7' }}
                    items={headerMenuItems}
                  />
                </Sider>
                <Layout className="overflow-y-auto p-[0_24px_24px_24px]">
                  <Content>
                    <section className="dashboard-content-wrapper">{children}</section>
                  </Content>
                </Layout>
              </Layout>
            </Layout>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
