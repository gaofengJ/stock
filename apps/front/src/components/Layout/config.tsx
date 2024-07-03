import { MenuProps } from 'antd';
import Link from 'next/link';
import React from 'react';
import { EAvatarDropdownKey, EHeaderMenuKey, EHeaderMenuPath } from './enum';

/**
 * 顶部菜单配置
 */
export const menuConfig = [
  {
    key: EHeaderMenuKey.analysis,
    label: '数据分析',
    path: EHeaderMenuPath.analysis,
  },
  {
    key: EHeaderMenuKey.trends,
    label: '市场行情',
    path: EHeaderMenuPath.trends,
  },
  {
    key: EHeaderMenuKey.news,
    label: '实时资讯',
    path: EHeaderMenuPath.news,
  },
  {
    key: EHeaderMenuKey.review,
    label: '每日复盘',
    path: EHeaderMenuPath.review,
  },
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
export const avatarDropdownItems: MenuProps['items'] = [
  {
    key: EAvatarDropdownKey.PERSONAL_CENTER,
    label: <span>个人中心</span>,
  },
  {
    key: EAvatarDropdownKey.SWITCH_ACCOUNT,
    label: <span>切换账号</span>,
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
export const analysisSiderMenuItems: MenuProps['items'] = [
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
];
