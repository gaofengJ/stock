import type { Config } from 'tailwindcss';

interface Spacing {
  [key: string]: string;
}

const colorsConfig = {
  'quote-up': 'var(--quote-up)',
  'quote-down': 'var(--quote-down)',
  'quote-flat': 'var(--quote-flat)',
  'primary-default': 'var(--color-pink-red)',
  'bg-base': 'var(--color-grey)',
  'bg-white': 'var(--color-surface)',
  'bg-black': 'var(--color-black)',
  'bg-black78': 'var(--color-black-78)',
  'bg-black56': 'var(--color-black-56)',
  'bg-pink-red': 'var(--color-pink-red)',
  'bg-pink-red78': 'var(--color-pink-red-78)',
  'bg-pink-red56': 'var(--color-pink-red-56)',
  'bg-grey': 'var(--color-grey)',
  'bg-grey78': 'var(--color-grey-78)',
  'bg-grey56': 'var(--color-grey-56)',
  'bg-lime-green': 'var(--color-lime-green)',
  'bg-lime-green78': 'var(--color-lime-green-78)',
  'bg-lime-green56': 'var(--color-lime-green-56)',

  'text-white': '#ffffff',
  'text-grey': 'var(--color-grey)',
  'text-grey78': 'var(--color-grey-78)',
  'text-grey56': 'var(--color-grey-56)',
  'text-black': 'var(--color-black)',
  'text-black78': 'var(--color-black-78)',
  'text-black56': 'var(--color-black-56)',
  'text-pink-red': 'var(--color-pink-red)',
  'text-pink-red78': 'var(--color-pink-red-78)',
  'text-pink-red56': 'var(--color-pink-red-56)',
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
