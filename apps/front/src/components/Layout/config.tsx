import { MenuProps } from 'antd';
import React from 'react';
import {
  DashboardOutlined, AreaChartOutlined, ThunderboltOutlined, BranchesOutlined, TableOutlined, ProfileOutlined, CalendarOutlined, TeamOutlined,
} from '@ant-design/icons';

import {
  EAnalysisAsideMenuKey,
  EAvatarDropdownKey,
  EBasicAsideMenuKey,
  EHeaderMenuKey,
  basicNavigationOrder,
} from './enum';

export { themeConfig } from '@/theme';

/**
 * 顶部菜单 Items
 */
export const headerMenuItems: MenuProps['items'] = [
  { key: EHeaderMenuKey.tradingSystem, label: '交易体系' },
  {
    key: EHeaderMenuKey.analysis,
    label: '市场分析',
  },
  {
    key: EHeaderMenuKey.strategy,
    label: '策略选股',
  },
  {
    key: EHeaderMenuKey.basic,
    label: '基础数据',
  },
  {
    key: EHeaderMenuKey.news,
    label: '实时资讯',
  },
  {
    key: EHeaderMenuKey.review,
    label: '每日复盘',
  },
  {
    key: EHeaderMenuKey.blog,
    label: '市场那些事',
  },
];

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

/**
 * 数据分析 侧边栏 items
 */
export const analysisSiderMenuItems: MenuProps['items'] = [
  { key: '/analysis/overview', label: '大盘概览', icon: <DashboardOutlined /> },
  {
    key: EAnalysisAsideMenuKey.analysisSenti,
    label: '市场情绪',
    icon: <AreaChartOutlined />,
  },
  {
    key: EAnalysisAsideMenuKey.analysisLimits,
    label: '涨停复盘',
    icon: <ThunderboltOutlined />,
  },
  {
    key: EAnalysisAsideMenuKey.analysisChains,
    label: '连板分析',
    icon: <BranchesOutlined />,
  },
];

/**
 * 基础数据 侧边栏 items
 */
const basicMenuDetails = {
  [EBasicAsideMenuKey.basicStock]: { label: '个股基本信息', icon: <ProfileOutlined /> },
  [EBasicAsideMenuKey.basicBrokerPicks]: { label: '券商月度金股', icon: <TeamOutlined /> },
  [EBasicAsideMenuKey.basicDaily]: { label: '每日交易数据', icon: <TableOutlined /> },
  [EBasicAsideMenuKey.basicRisk]: { label: '风险与交易状态', icon: <ProfileOutlined /> },
  [EBasicAsideMenuKey.basicTradeCal]: { label: '交易日历', icon: <CalendarOutlined /> },
  [EBasicAsideMenuKey.basicActiveFunds]: { label: '游资名录', icon: <TeamOutlined /> },
};
export const basicSiderMenuItems: MenuProps['items'] = basicNavigationOrder.map((key) => ({ key, ...basicMenuDetails[key] }));
