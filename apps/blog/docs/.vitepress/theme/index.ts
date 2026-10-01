import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import AizaibingchuanArchive from './components/AizaibingchuanArchive';
import LibrarySearch from './components/LibrarySearch.vue';
import ReadingTools from './components/ReadingTools.vue';
import './style/var.css';

export default {
  ...DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'nav-bar-content-after': () => h(LibrarySearch),
    'sidebar-nav-after': () => h(AizaibingchuanArchive),
    'doc-before': () => h(ReadingTools),
  }),
};
