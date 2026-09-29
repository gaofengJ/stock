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
  success: '#4c9c48',
  error: '#f44838',
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
// Reference screenshot: MA5 / MA10 / MA20 / MA30 / MA60 / MA120 / MA250.
export const movingAverageColors = ['#d6d6d6', '#d942a6', '#edc14a', '#339bd0', '#a65326', '#319878', '#df6288'];
export const lightMovingAverageColors = ['#697386', '#c73591', '#ac810a', '#2587b6', '#a65326', '#278166', '#cc4d75'];
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

export const darkUiColors = {
  ...uiColors,
  primaryText: '#ff7899',
  primarySoft: '#35212b',
  primarySubtle: '#241c23',
  text: '#e6e8ed',
  secondary: '#a5adba',
  muted: '#8892a2',
  disabled: '#626b79',
  background: '#111318',
  surface: '#1b1e25',
  surfaceMuted: '#232730',
  border: '#353b47',
  borderLight: '#2c313c',
};

export const candlePanelColors = {
  text: darkUiColors.text,
  muted: darkUiColors.muted,
  grid: darkUiColors.borderLight,
  axis: darkUiColors.disabled,
  selection: darkUiColors.border,
};

function variablesFor(colors: typeof uiColors) {
  const utilities = { ...utilityColors, grey: colors.background, black: colors.text };
  return {
    ...Object.fromEntries(Object.entries(utilities).flatMap(([name, color]) => [
      [`--color-${name}`, color], [`--color-${name}-78`, withAlpha(color, 0.78)], [`--color-${name}-56`, withAlpha(color, 0.56)],
    ])),
    '--color-primary': colors.primary,
    '--color-primary-text': colors.primaryText,
    '--color-primary-soft': colors.primarySoft,
    '--color-primary-subtle': colors.primarySubtle,
    '--color-surface': colors.surface,
    '--color-surface-muted': colors.surfaceMuted,
    '--color-border': colors.border,
    '--color-border-light': colors.borderLight,
    '--text-secondary': colors.secondary,
    '--text-muted': colors.muted,
    '--text-disabled': colors.disabled,
    '--quote-up': quoteColors.up,
    '--quote-up-soft': withAlpha(quoteColors.up, 0.08),
    '--quote-up-border': withAlpha(quoteColors.up, 0.24),
    '--quote-down': quoteColors.down,
    '--quote-flat': colors.secondary,
    '--quote-warning': quoteColors.warning,
    '--shadow-soft': withAlpha(colors.text, 0.025),
    '--shadow-popup': withAlpha(colors.text, 0.08),
    '--border-swatch': withAlpha(colors.text, 0.125),
    '--loading-overlay': withAlpha(colors.surface, 0.3),
  };
}
export const colorVariables = variablesFor(uiColors);
export const darkColorVariables = variablesFor(darkUiColors);
const cssVariables = (variables: Record<string, string>) => Object.entries(variables).map(([name, value]) => `${name}:${value}`).join(';');
export const themeVariablesCss = `:root{${cssVariables(colorVariables)};color-scheme:light}html[data-theme="dark"]{${cssVariables(darkColorVariables)};color-scheme:dark}`;
