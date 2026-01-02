import DefaultTheme from 'vitepress/theme';
import { inBrowser } from 'vitepress';
import './style/var.css';

export default {
  ...DefaultTheme,
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
