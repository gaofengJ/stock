import { defineConfig } from 'vitepress';
import navConfig from '../src/nav-config.mts';
import sidebarConfig from '../src/sidebar-config.mts';
import articlePlugin from './article-plugin';

export default defineConfig({
  cleanUrls: true,
  base: '/blog-frame/',
  lang: 'zh-CN',
  title: '市场那些事',
  description: '交易知识与历史复盘资料库',
  head: [
    ['link', { rel: 'icon', href: '/blog-frame/imgs/fengye.png' }],
  ],
  srcDir: './src',
  lastUpdated: true,
  markdown: { image: { lazyLoading: true }, config: md => md.use(articlePlugin) },
  themeConfig: {
    logo: '/imgs/fengye.png',
    nav: navConfig,
    sidebar: sidebarConfig,
    socialLinks: [],
    outline: {
      level: 2,
      label: '页面导航',
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    lastUpdated: { text: '页面修改于', formatOptions: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' } },
  },
})
