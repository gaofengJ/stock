import Image from 'next/image';
import {
  Avatar,
  ConfigProvider, Dropdown, Layout, Menu,
} from 'antd';

import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import ImgFengye from '@/assets/imgs/fengye.png';
import {
  dropdownItems, headerMenuItems,
} from './config';

const { Content, Header, Sider } = Layout;

export default function Home() {
  const router = useRouter();
  const { pathname } = router;
  const basePath = pathname.split('/')[1];
  const mainMenuKey = pathname.split('/').slice(0, 3).join('/');
  const [selectedTab, setSelectedTab] = useState(basePath);

  // const curRouteItem = routeItems.find(
  //   (routeItem: IrouteItem) => routeItem.key === basePath,
  // );

  useEffect(() => {
    setSelectedTab(basePath);
  }, [basePath]);

  return (
    <ConfigProvider>
      <Layout className="h-[100vh]">
        <Header>
          <Image src={ImgFengye} alt="fengye" />
          <span className="p-[0_80px_0_4px] text-20 text-500">木风同学</span>
          <Menu
            mode="horizontal"
            defaultSelectedKeys={[selectedTab]}
            items={headerMenuItems}
          />
          <span className="grow" />
          <Dropdown menu={{ items: dropdownItems }} placement="bottomLeft" arrow>
            <Avatar
              className="text-white"
            >
              Admin
            </Avatar>
          </Dropdown>
        </Header>
        <Layout>
          <Sider width={256} collapsible>
            <Menu
              mode="inline"
              defaultSelectedKeys={[selectedTab]}
              defaultOpenKeys={[mainMenuKey]}
              className="h-full"
              style={{ borderRight: '1px solid #e3e5e7' }}
              items={headerMenuItems}
            />
          </Sider>
          <Layout
            className="overflow-y-auto p-[0_24px_24px_24px]"
          >
            <Content>
              <section className="dashboard-content-wrapper" />
            </Content>
          </Layout>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
