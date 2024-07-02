import { MenuProps } from 'antd';
import Link from 'next/link';
import React from 'react';

/**
 * 顶部菜单配置
 */
export const menuConfig = [
  { key: 'home', label: '首页', path: '/home' },
  { key: 'market', label: '市场行情', path: '/market' },
  { key: 'data', label: '数据分析', path: '/analysis' },
  { key: 'review', label: '每日复盘', path: '/review' },
];

/**
 * 顶部菜单 Items
 */
export const headerMenuItems: MenuProps['items'] = menuConfig.map((item) => ({
  key: item.key,
  label: <Link href={item.path}>{item.label}</Link>,
}));

/**
 * 头像下拉选项
 */
export const dropdownItems: MenuProps['items'] = [
  {
    key: 'PERSONAL_CENTER',
    label: <span>个人中心</span>,
  },
  {
    key: 'SWITCH_ACCOUNT',
    label: <span>切换账户</span>,
  },
];

export interface IrouteItem {
  key: string;
  showAside: boolean;
  siderMenuItems?: {
    key: string;
    // icon: string;
    label: unknown;
    children?: unknown;
  }[];
}

// 路由对应信息
export const routeItems: IrouteItem[] = [
  {
    key: 'home',
    showAside: false,
  },
  {
    key: 'market',
    showAside: false,
  },
  {
    key: 'data',
    showAside: true,
    siderMenuItems: [
      {
        key: '/data/quota',
        // icon: React.createElement(LineChartOutlined),
        label: <Link href="/data/quota">情绪指标</Link>,
      },
      {
        key: '/data/limit',
        // icon: React.createElement(RiseOutlined),
        label: <Link href="/data/limit">连板统计</Link>,
      },
      {
        key: '/data/limit-review',
        // icon: React.createElement(BarsOutlined),
        label: <Link href="/data/limit-review">涨停板复盘</Link>,
      },
      {
        key: '/data/basic',
        // icon: React.createElement(TableOutlined),
        label: <Link href="/data/basic">基础信息</Link>,
        children: [
          {
            key: '/data/basic/stock',
            label: <Link href="/data/basic/stock">个股基本信息</Link>,
          },
          {
            key: '/data/basic/daily',
            label: <Link href="/data/basic/daily">每日交易数据</Link>,
          },
        ],
      },
    ],
  },
  {
    key: 'review',
    showAside: false,
  },
];
