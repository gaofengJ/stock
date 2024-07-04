import { MenuProps, theme, ThemeConfig } from 'antd';
import Link from 'next/link';
import React from 'react';

import { EThemeColors } from '@/types/common.enum';

import {
  EAnalysisAsideMenuKey,
  EAvatarDropdownKey,
  EHeaderMenuKey,
} from './enum';

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: EThemeColors.colorRed,
  },
  components: {
    Layout: {
      headerBg: EThemeColors.colorWhite,
      headerPadding: '0 16px',
      triggerBg: EThemeColors.colorWhite,
      triggerColor: EThemeColors.colorTeal,
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
    label: <Link href={EHeaderMenuKey.analysis}>数据分析</Link>,
  },
  {
    key: EHeaderMenuKey.trends,
    label: <Link href={EHeaderMenuKey.trends}>市场行情</Link>,
  },
  {
    key: EHeaderMenuKey.news,
    label: <Link href={EHeaderMenuKey.news}>实时资讯</Link>,
  },
  {
    key: EHeaderMenuKey.review,
    label: <Link href={EHeaderMenuKey.review}>每日复盘</Link>,
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
    label: <Link href={EAnalysisAsideMenuKey.analysisSenti}>情绪指标</Link>,
  },
  {
    key: EAnalysisAsideMenuKey.analysisChains,
    label: <Link href={EAnalysisAsideMenuKey.analysisChains}>连板统计</Link>,
  },
  {
    key: EAnalysisAsideMenuKey.analysisLimits,
    label: <Link href={EAnalysisAsideMenuKey.analysisLimits}>涨停板复盘</Link>,
  },
  {
    key: EAnalysisAsideMenuKey.analysisBasic,
    label: <Link href={EAnalysisAsideMenuKey.analysisBasic}>基础信息</Link>,
    children: [
      {
        key: EAnalysisAsideMenuKey.analysisBasicStock,
        label: (
          <Link href={EAnalysisAsideMenuKey.analysisBasicStock}>
            个股基本信息
          </Link>
        ),
      },
      {
        key: EAnalysisAsideMenuKey.analysisBasicDaily,
        label: (
          <Link href={EAnalysisAsideMenuKey.analysisBasicDaily}>
            每日交易数据
          </Link>
        ),
      },
    ],
  },
];
