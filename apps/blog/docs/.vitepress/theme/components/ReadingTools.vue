<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData, useRoute, useRouter, withBase } from 'vitepress';
import { readings, remember, safeArticlePath } from '../reading-storage';
const { page, isDark } = useData();
const route = useRoute();
const router = useRouter();
const zoom = ref<HTMLDialogElement>();
const image = ref('');
const imageAlt = ref('');
const enlarged = ref(false);
const shared = ref('');
const restoring = ref(false);
let timer: ReturnType<typeof setTimeout>;
let activePath = '';
let activeTitle = '';
let parentOrigin = '';
let disposed = false;
let previousBefore: typeof router.onBeforeRouteChange;
const beforeNavigate = async (to: string) => {
  save();
  return previousBefore?.(to);
};
const article = () => page.value.relativePath !== 'index.md' && !page.value.relativePath.endsWith('/index.md');
function save() {
  if (restoring.value || !activePath || !activeTitle) return;
  remember({ path: activePath, title: activeTitle, scroll: window.scrollY, updated: Date.now() });
}
function notify() {
  if (parentOrigin) window.parent.postMessage({ type: 'stock-blog-route', path: location.pathname + location.hash }, parentOrigin);
}
async function changed() {
  activePath = '';
  await nextTick();
  if (disposed) return;
  notify();
  document.querySelectorAll<HTMLImageElement>('.vp-doc img').forEach(img => {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', `放大图片：${img.alt || '正文图片'}`);
    img.decoding = 'async';
  });
  if (!article()) return;
  const path = location.pathname;
  const previous = readings().find(item => item.path === path);
  // Hash links take precedence over the previous scroll position.
  if (previous && !location.hash && previous.scroll > 0) {
    restoring.value = true;
    let target = previous.scroll;
    const until = Date.now() + 4000;
    const restore = () => {
      if (disposed || location.pathname !== path) { restoring.value = false; return; }
      window.scrollTo(0, target);
      if (window.scrollY < target - 8 && Date.now() < until) requestAnimationFrame(restore);
      else restoring.value = false;
    };
    requestAnimationFrame(restore);
  }
  activePath = path;
  activeTitle = page.value.title;
  if (!previous) save();
}
function scroll() { clearTimeout(timer); timer = setTimeout(save, 500); }
function showImage(event: Event) {
  const target = event.target as HTMLElement;
  if (!(target instanceof HTMLImageElement) || !target.closest('.vp-doc') || !target.naturalWidth) return;
  if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  image.value = target.currentSrc || target.src;
  imageAlt.value = target.alt;
  enlarged.value = false;
  zoom.value?.showModal();
}
function receive(event: MessageEvent) {
  if (!parentOrigin || event.origin !== parentOrigin || event.source !== window.parent) return;
  if (event.data?.type === 'stock-blog-theme' && ['light', 'dark'].includes(event.data.mode)) isDark.value = event.data.mode === 'dark';
  if (event.data?.type === 'stock-blog-navigate') {
    const path = withBase(event.data.path || '');
    if (safeArticlePath(path) && path !== location.pathname + location.hash) router.go(path);
  }
}
async function share() {
  const url = new URL('/blog/', location.origin);
  url.searchParams.set('article', location.pathname.replace(/^\/blog-frame/, '') + location.hash);
  try { await navigator.clipboard.writeText(url.href); shared.value = '链接已复制'; }
  catch { shared.value = '请复制浏览器地址分享'; }
}
onMounted(() => {
  disposed = false;
  previousBefore = router.onBeforeRouteChange;
  router.onBeforeRouteChange = beforeNavigate;
  if (window.self !== window.top) {
    document.documentElement.classList.add('embedded');
    try {
      const referrer = new URL(document.referrer);
      if (referrer.hostname === location.hostname) parentOrigin = referrer.origin;
    } catch { /* A standalone page has no parent origin. */ }
    if (parentOrigin) window.parent.postMessage({ type: 'stock-blog-ready' }, parentOrigin);
  }
  changed();
  window.addEventListener('message', receive);
  window.addEventListener('scroll', scroll, { passive: true });
  window.addEventListener('pagehide', save);
  window.addEventListener('hashchange', notify);
  document.addEventListener('click', showImage);
  document.addEventListener('keydown', showImage);
});
watch(() => route.path, () => { clearTimeout(timer); shared.value = ''; changed(); });
onBeforeUnmount(() => {
  save(); disposed = true; clearTimeout(timer);
  if (router.onBeforeRouteChange === beforeNavigate) router.onBeforeRouteChange = previousBefore;
  window.removeEventListener('message', receive);
  window.removeEventListener('scroll', scroll);
  window.removeEventListener('pagehide', save);
  window.removeEventListener('hashchange', notify);
  document.removeEventListener('click', showImage);
  document.removeEventListener('keydown', showImage);
});
</script>

<template>
  <div v-if="page.relativePath !== 'index.md'" class="reading-tools" data-pagefind-ignore>
    <a :href="withBase('/')">资料首页</a>
    <button type="button" @click="share">分享文章</button><span role="status">{{ shared }}</span>
  </div>
  <dialog ref="zoom" class="article-image-dialog" aria-label="正文图片放大" @click="event => { if (event.target === zoom) zoom?.close(); }">
    <div class="library-dialog-header"><button type="button" @click="enlarged = !enlarged">{{ enlarged ? '适应屏幕' : '原图尺寸' }}</button><button type="button" @click="zoom?.close()">关闭图片</button></div>
    <div class="article-image-scroll"><img :src="image || undefined" :alt="imageAlt" :class="{ enlarged }"></div>
  </dialog>
</template>
