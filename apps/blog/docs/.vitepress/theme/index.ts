import DefaultTheme from 'vitepress/theme';
import { inBrowser } from 'vitepress';
import { defineComponent, h, onMounted } from 'vue';
import AizaibingchuanArchive from './components/AizaibingchuanArchive';
import './style/var.css';

const PAGEFIND_BASE = '/blog-frame/pagefind/';
const PAGEFIND_ENABLED = true;

const PagefindSearch = defineComponent({
  name: 'PagefindSearch',
  setup() {
    onMounted(() => {
      if (!PAGEFIND_ENABLED || !inBrowser || document.getElementById('pagefind-config')) return;
      const config = document.createElement('pagefind-config');
      config.id = 'pagefind-config';
      config.setAttribute('base-url', '/blog-frame/');
      config.setAttribute('bundle-path', PAGEFIND_BASE);
      config.setAttribute('lang', 'zh-CN');
      const modal = document.createElement('pagefind-modal');
      modal.id = 'pagefind-modal';
      document.body.append(config, modal);
    });
    return () => PAGEFIND_ENABLED
      ? h('pagefind-modal-trigger', { class: 'pagefind-search-trigger' })
      : null;
  },
});

export default {
  ...DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'nav-bar-content-after': () => h(PagefindSearch),
    'sidebar-nav-after': () => h(AizaibingchuanArchive),
  }),
  setup() {
    // 检查是否在浏览器环境中
    if (inBrowser) {
      // 检查 URL 参数或父窗口通信来判断是否是嵌入模式
      // 这里简单地检查是否被 iframe 嵌入
      const isEmbedded = window.self !== window.top;
      
      if (isEmbedded) {
        document.documentElement.classList.add('embedded');
      }
    }
  }
}
