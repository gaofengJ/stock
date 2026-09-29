import type { ThemeConfig } from 'antd';
import { uiColors, withAlpha } from './colors';

export { quoteColors } from './colors';

export const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: uiColors.primary,
    colorSuccess: uiColors.success,
    colorSuccessBg: withAlpha(uiColors.success, 0.08),
    colorSuccessBorder: withAlpha(uiColors.success, 0.24),
    colorError: uiColors.error,
    colorErrorBg: withAlpha(uiColors.error, 0.08),
    colorErrorBorder: withAlpha(uiColors.error, 0.24),
    colorWarning: uiColors.warning,
    colorWarningBg: withAlpha(uiColors.warning, 0.08),
    colorWarningBorder: withAlpha(uiColors.warning, 0.24),
    colorInfo: uiColors.info,
    colorInfoBg: withAlpha(uiColors.info, 0.08),
    colorInfoBorder: withAlpha(uiColors.info, 0.24),
    colorText: uiColors.text,
    colorTextSecondary: uiColors.secondary,
    colorBgLayout: uiColors.background,
    fontFamily,
    fontSize: 14,
    borderRadius: 6,
    controlHeight: 32,
  },
  components: {
    Layout: {
      headerHeight: 56, headerBg: uiColors.surface, headerPadding: '0 16px', siderBg: uiColors.surface, triggerBg: uiColors.surface, triggerColor: uiColors.primary,
    },
    Table: {
      cellPaddingBlock: 10, cellPaddingInline: 12, cellPaddingBlockMD: 10, cellPaddingInlineMD: 12, cellFontSizeSM: 14, headerBg: uiColors.surfaceMuted,
    },
    Card: {
      paddingLG: 16, padding: 16, headerFontSize: 16, headerHeight: 48,
    },
    Statistic: { contentFontSize: 26, titleFontSize: 14 },
    Typography: { titleMarginTop: 0, titleMarginBottom: 16 },
  },
};
