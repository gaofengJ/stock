import type { ThemeConfig } from 'antd';

export const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
export const quoteColors = {
  up: '#d92d53', down: '#16835b', flat: '#697386', warning: '#bd780a',
};
export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#ff2e63',
    colorText: '#252a34',
    colorTextSecondary: '#697386',
    colorBgLayout: '#f5f5f5',
    fontFamily,
    fontSize: 14,
    borderRadius: 6,
    controlHeight: 32,
  },
  components: {
    Layout: {
      headerHeight: 56, headerBg: '#fff', headerPadding: '0 16px', siderBg: '#fff', triggerBg: '#fff', triggerColor: '#ff2e63',
    },
    Table: {
      cellPaddingBlock: 10, cellPaddingInline: 12, cellPaddingBlockMD: 10, cellPaddingInlineMD: 12, cellFontSizeSM: 14, headerBg: '#fafafb',
    },
    Card: {
      paddingLG: 16, padding: 16, headerFontSize: 16, headerHeight: 48,
    },
    Statistic: { contentFontSize: 26, titleFontSize: 14 },
    Typography: { titleMarginTop: 0, titleMarginBottom: 16 },
  },
};
