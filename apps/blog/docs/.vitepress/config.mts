import { defineConfig } from 'vitepress';
import navConfig from '../src/nav-config.mts';
import sidebarConfig from '../src/sidebar-config.mts';

export default defineConfig({
  cleanUrls: true,
  lang: 'zh-CN',
  title: "Mufeng's blog",
  description: "木风同学的股票博客",
  head: [
    ['link', { rel: 'icon', href: '/icon/favicon.svg' }],
  ],
  srcDir: './src',
  lastUpdated: true,
  themeConfig: {
    logo: '/imgs/fengye.png',
    nav: navConfig,
    sidebar: sidebarConfig,
    search: {
      provider: 'local',
    },
    socialLinks: [],
    outline: {
      level: 2,
      label: '页面导航',
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    editLink: {
      pattern: '',
      text: 'Edit this page',
    },
  },
})
