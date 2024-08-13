import type { Config } from 'tailwindcss';
import { EThemeColors } from './src/types/common.enum';

interface Spacing {
  [key: string]: string;
}

const colorsConfig = {
  'primary-default': EThemeColors.colorPinkRed,
  'bg-base': EThemeColors.colorGrey,
  'bg-white': EThemeColors.colorWhite,
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
