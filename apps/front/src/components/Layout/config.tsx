import { MenuProps, theme, ThemeConfig } from 'antd';
import React from 'react';

import { EThemeColors } from '@/types/common.enum';

import {
  EAnalysisAsideMenuKey,
  EAvatarDropdownKey,
  EBasicAsideMenuKey,
  EHeaderMenuKey,
} from './enum';

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: EThemeColors.colorPinkRed,
  },
  components: {
    Layout: {
      headerBg: EThemeColors.colorWhite,
      headerPadding: '0 16px',
      siderBg: EThemeColors.colorWhite,
      triggerBg: EThemeColors.colorWhite,
      triggerColor: EThemeColors.colorPinkRed,
    },
  },
  algorithm: theme.defaultAlgorithm,
};

/**
 * 顶部菜单 Items
 */
export const headerMenuItems: MenuProps['items'] = [
  {
    key: EHeaderMenuKey.analysis,
    label: '数据分析',
  },
  {
    key: EHeaderMenuKey.trends,
    label: '市场行情',
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
  {
    key: EAnalysisAsideMenuKey.analysisSenti,
    label: '情绪指标',
  },
  {
    key: EAnalysisAsideMenuKey.analysisChains,
    label: '连板统计',
  },
  {
    key: EAnalysisAsideMenuKey.analysisLimits,
    label: '涨停板复盘',
  },
];

/**
 * 基础数据 侧边栏 items
 */
export const basicSiderMenuItems: MenuProps['items'] = [
  {
    key: EBasicAsideMenuKey.basicDaily,
    label: '每日交易数据',
  },
  {
    key: EBasicAsideMenuKey.basicStock,
    label: '个股基本信息',
  },
];
