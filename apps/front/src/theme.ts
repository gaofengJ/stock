import { theme, type ThemeConfig } from 'antd';
import { uiColors, darkUiColors, withAlpha } from './colors';

export { quoteColors } from './colors';

export const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
export function createThemeConfig(dark: boolean): ThemeConfig {
  const colors = dark ? darkUiColors : uiColors;
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: colors.primary,
      colorSuccess: colors.success,
      colorSuccessBg: withAlpha(colors.success, 0.08),
      colorSuccessBorder: withAlpha(colors.success, 0.24),
      colorError: colors.error,
      colorErrorBg: withAlpha(colors.error, 0.08),
      colorErrorBorder: withAlpha(colors.error, 0.24),
      colorWarning: colors.warning,
      colorWarningBg: withAlpha(colors.warning, 0.08),
      colorWarningBorder: withAlpha(colors.warning, 0.24),
      colorInfo: colors.info,
      colorInfoBg: withAlpha(colors.info, 0.08),
      colorInfoBorder: withAlpha(colors.info, 0.24),
      colorText: colors.text,
      colorTextSecondary: colors.secondary,
      colorBgLayout: colors.background,
      colorBgContainer: colors.surface,
      colorBgElevated: colors.surfaceMuted,
      colorBorder: colors.border,
      colorBorderSecondary: colors.borderLight,
      fontFamily,
      fontSize: 14,
      borderRadius: 6,
      controlHeight: 32,
    },
    components: {
      Layout: {
        headerHeight: 56, headerBg: colors.surface, headerPadding: '0 16px', siderBg: colors.surface, triggerBg: colors.surface, triggerColor: colors.primary,
      },
      Table: {
        cellPaddingBlock: 10, cellPaddingInline: 12, cellPaddingBlockMD: 10, cellPaddingInlineMD: 12, cellFontSizeSM: 14, headerBg: colors.surfaceMuted,
      },
      Card: {
        paddingLG: 16, padding: 16, headerFontSize: 16, headerHeight: 48,
      },
      Statistic: { contentFontSize: 26, titleFontSize: 14 },
      Typography: { titleMarginTop: 0, titleMarginBottom: 16 },
    },
  };
}
export const themeConfig = createThemeConfig(false);
