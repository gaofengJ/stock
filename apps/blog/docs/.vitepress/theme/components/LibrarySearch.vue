<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
const dialog = ref<HTMLDialogElement>();
const field = ref<HTMLInputElement>();
const query = ref('');
const category = ref('');
const year = ref('');
const categories = ref<string[]>([]);
const years = ref<string[]>([]);
const results = ref<any[]>([]);
const total = ref(0);
const busy = ref(false);
const error = ref('');
const limit = ref(20);
let engine: any;
let pendingEngine: Promise<any> | undefined;
let requestId = 0;
let timer: ReturnType<typeof setTimeout>;
async function loadEngine() {
  const moduleUrl = new URL('/blog-frame/pagefind/pagefind.js', window.location.href).href;
  if (!pendingEngine) pendingEngine = import(/* @vite-ignore */ moduleUrl).then(async module => {
    await module.options({ baseUrl: '/blog-frame/' });
    const filters = await module.filters();
    categories.value = Object.keys(filters['分类'] || {});
    years.value = Object.keys(filters['年份'] || {}).sort((a, b) => a === '未标注' ? 1 : b === '未标注' ? -1 : b.localeCompare(a));
    return module;
  }).catch(e => { pendingEngine = undefined; throw e; });
  return pendingEngine;
}
async function search() {
  const id = ++requestId;
  busy.value = true;
  error.value = '';
  try {
    engine = await loadEngine();
    const filters: Record<string, string> = {};
    if (category.value) filters['分类'] = category.value;
    if (year.value) filters['年份'] = year.value;
    if (!query.value.trim() && !Object.keys(filters).length) {
      if (id === requestId) { results.value = []; total.value = 0; }
      return;
    }
    const response = await engine.search(query.value.trim() || null, { filters });
    const items = await Promise.all(response.results.slice(0, limit.value).map((item: any) => item.data()));
    if (id !== requestId) return;
    results.value = items;
    total.value = response.results.length;
  } catch {
    if (id === requestId) { results.value = []; total.value = 0; error.value = '搜索暂不可用，请稍后重试。'; }
  } finally { if (id === requestId) busy.value = false; }
}
async function open() {
  dialog.value?.showModal();
  await nextTick();
  field.value?.focus();
  search();
}
function schedule() {
  clearTimeout(timer);
  ++requestId;
  limit.value = 20;
  results.value = [];
  total.value = 0;
  busy.value = true;
  timer = setTimeout(search, 250);
}
watch([query, category, year], schedule);
onBeforeUnmount(() => { clearTimeout(timer); ++requestId; });
</script>

<template>
  <button type="button" class="library-search-button" @click="open">搜索</button>
  <dialog ref="dialog" class="library-search-dialog" aria-labelledby="library-search-title" @click="event => { if (event.target === dialog) dialog?.close(); }">
    <div class="library-dialog-header"><strong id="library-search-title">搜索资料</strong><button type="button" aria-label="关闭搜索" @click="dialog?.close()">关闭</button></div>
    <input ref="field" v-model="query" type="search" placeholder="搜索标题或正文" aria-label="搜索标题或正文">
    <div class="library-search-filters">
      <label>分类<select v-model="category"><option value="">全部分类</option><option v-for="item in categories" :key="item">{{ item }}</option></select></label>
      <label>年份<select v-model="year"><option value="">全部年份</option><option v-for="item in years" :key="item">{{ item }}</option></select></label>
    </div>
    <p role="status">{{ busy ? '正在搜索…' : error || (query || category || year ? `找到 ${total} 篇资料` : '输入关键词，或选择分类、年份。') }}</p>
    <button v-if="error && !busy" type="button" class="library-more" @click="search">重试搜索</button>
    <ul class="library-search-results" :aria-busy="busy">
      <li v-for="item in results" :key="item.url">
        <a :href="item.url" @click="dialog?.close()">{{ item.meta.title }}</a>
        <div class="search-result-meta"><small>{{ item.meta.category }}</small><small>{{ item.meta.date }}</small><small>{{ item.meta.source?.replace(/\s*·\s*/g, ' / ') }}</small></div>
        <p>{{ item.excerpt.replace(/<[^>]*>/g, '') }}</p>
      </li>
    </ul>
    <button v-if="results.length < total && !busy && !error" type="button" class="library-more" @click="limit += 20; search()">加载更多</button>
  </dialog>
</template>
