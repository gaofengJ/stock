// Single source for Ant Design, CSS variables, Tailwind and ECharts.
export const uiColors = {
  primary: '#ff2e63',
  primaryText: '#ce365c',
  primarySoft: '#fff0f4',
  primarySubtle: '#fff6f8',
  text: '#252a34',
  secondary: '#697386',
  muted: '#929aa8',
  disabled: '#b1b8c4',
  background: '#f5f5f5',
  surface: '#ffffff',
  surfaceMuted: '#fafafb',
  border: '#eceef1',
  borderLight: '#f0f1f4',
  success: '#16a085',
  error: '#f04468',
  warning: '#c58a26',
  info: '#4f86e8',
  wechat: '#07c160',
};

export const quoteColors = {
  up: uiColors.error, down: uiColors.success, flat: uiColors.secondary, warning: uiColors.warning,
};

export const chartColors = {
  orange: '#e99a32',
  blue: uiColors.info,
  purple: '#a16ae8',
  pink: '#e66ba2',
  teal: '#28b1b0',
  gold: '#b89a42',
  slate: '#7b91b0',
  grid: '#e8edf3',
  axis: '#b1bbc9',
  reference: '#929faf',
};
// Fixed order: MA5 / MA10 / MA20 / MA30 / MA60 / MA120 / MA250.
export const movingAverageColors = [chartColors.orange, chartColors.blue, chartColors.purple,
  chartColors.pink, chartColors.teal, chartColors.gold, chartColors.slate];
export const chartPalette = [uiColors.primary, chartColors.blue, chartColors.purple,
  chartColors.orange, chartColors.teal, chartColors.pink, chartColors.gold, chartColors.slate];

export function withAlpha(hex: string, opacity: number) {
  return `${hex}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}

// Keep existing utility names mapped to the same palette during migration.
export const utilityColors = {
  teal: chartColors.teal,
  'light-blue': chartColors.blue,
  violet: chartColors.purple,
  'pink-red': uiColors.primary,
  orange: chartColors.orange,
  yellow: chartColors.gold,
  'light-green': quoteColors.down,
  'lime-green': quoteColors.down,
  grey: uiColors.background,
  black: uiColors.text,
};

export const colorVariables = {
  ...Object.fromEntries(Object.entries(utilityColors).flatMap(([name, color]) => [
    [`--color-${name}`, color], [`--color-${name}-78`, withAlpha(color, 0.78)], [`--color-${name}-56`, withAlpha(color, 0.56)],
  ])),
  '--color-primary': uiColors.primary,
  '--color-primary-text': uiColors.primaryText,
  '--color-primary-soft': uiColors.primarySoft,
  '--color-primary-subtle': uiColors.primarySubtle,
  '--color-surface': uiColors.surface,
  '--color-surface-muted': uiColors.surfaceMuted,
  '--color-border': uiColors.border,
  '--color-border-light': uiColors.borderLight,
  '--text-secondary': uiColors.secondary,
  '--text-muted': uiColors.muted,
  '--text-disabled': uiColors.disabled,
  '--quote-up': quoteColors.up,
  '--quote-up-soft': withAlpha(quoteColors.up, 0.08),
  '--quote-up-border': withAlpha(quoteColors.up, 0.24),
  '--quote-down': quoteColors.down,
  '--quote-flat': quoteColors.flat,
  '--quote-warning': quoteColors.warning,
  '--shadow-soft': withAlpha(uiColors.text, 0.025),
  '--shadow-popup': withAlpha(uiColors.text, 0.08),
  '--border-swatch': withAlpha(uiColors.text, 0.125),
  '--loading-overlay': withAlpha(uiColors.surface, 0.3),
};
