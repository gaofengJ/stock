import type { Config } from 'tailwindcss';
import { EThemeColors } from './src/types/common.enum';

interface Spacing {
  [key: string]: string;
}

const colorsConfig = {
  'primary-default': EThemeColors.colorPinkRed,
  'bg-base': EThemeColors.colorGrey,
  'bg-white': EThemeColors.colorWhite,
  'bg-black': EThemeColors.colorBlack,
  'bg-black78': EThemeColors.colorBlack78,
  'bg-black56': EThemeColors.colorBlack56,
  'bg-pink-red': EThemeColors.colorPinkRed,
  'bg-pink-red78': EThemeColors.colorPinkRed78,
  'bg-pink-red56': EThemeColors.colorPinkRed56,
  'bg-grey': EThemeColors.colorGrey,
  'bg-grey78': EThemeColors.colorGrey78,
  'bg-grey56': EThemeColors.colorGrey56,
  'bg-lime-green': EThemeColors.colorLimeGreen,
  'bg-lime-green78': EThemeColors.colorLimeGreen78,
  'bg-lime-green56': EThemeColors.colorLimeGreen56,

  'text-white': EThemeColors.colorWhite,
  'text-grey': EThemeColors.colorGrey,
  'text-grey78': EThemeColors.colorGrey78,
  'text-grey56': EThemeColors.colorGrey56,
  'text-black': EThemeColors.colorBlack,
  'text-black78': EThemeColors.colorBlack78,
  'text-black56': EThemeColors.colorBlack56,
  'text-pink-red': EThemeColors.colorPinkRed,
  'text-pink-red78': EThemeColors.colorPinkRed78,
  'text-pink-red56': EThemeColors.colorPinkRed56,
};

const config: Config = {
  mode: 'jit', // JIT 模式提供了更高的性能和更小的构建尺寸
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    spacing: Array.from({ length: 1000 }).reduce((map, _, index) => {
      // eslint-disable-next-line no-param-reassign
      (map as Record<string, string>)[index] = `${index}px`;
      return map;
    }, {}) as Spacing,
    extend: {
      fontSize: ({ theme }) => ({
        ...theme('spacing'),
      }),
      lineHeight: ({ theme }) => ({
        ...theme('spacing'),
      }),
      colors: colorsConfig,
    },
    corePlugins: {
      preflight: false, // 是 Tailwind CSS 的一个核心插件，它包含一组基础样式重置和全局样式
    },
  },
  plugins: [],
};
export default config;
