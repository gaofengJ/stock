<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import index from '../aizaibingchuan-sidebar/index.json';
import catalog from '../library-catalog.json';
import { archiveDate, archiveLabel, archiveMonths, filterArchive, type ArchiveItem } from '../archive-utils';
import ReviewList from './ReviewList.vue';

const files = import.meta.glob<{ default: { items: ArchiveItem[] } }>('../aizaibingchuan-sidebar/*.json');
const years = [...index.years].reverse();
const highlights = [...index.highlights].reverse();
const year = ref(years[0]?.year || '');
const month = ref('');
const date = ref('');
const items = ref<ArchiveItem[]>([]);
const busy = ref(true);
const error = ref('');
const limit = ref(20);
const cache = new Map<string, ArchiveItem[]>();
const storageKey = 'stock-blog-archive-filter:v1';
let request = 0;
const months = computed(() => archiveMonths(items.value));
const matches = computed(() => filterArchive(items.value, month.value, date.value));
const articles = computed(() => matches.value.slice(0, limit.value).map(item => ({
  title: item.title || '历史复盘', path: item.link.replace(/\.md$/, ''), date: archiveDate(item),
  variant: archiveLabel(item).slice(10),
})));

async function loadYear(preferLatest = true) {
  const id = ++request;
  const target = year.value;
  busy.value = true;
  error.value = '';
  items.value = [];
  limit.value = 20;
  try {
    const loader = files[`../aizaibingchuan-sidebar/${target}.json`];
    if (!loader) throw new Error('Missing archive');
    if (!cache.has(target)) cache.set(target, (await loader()).default.items);
    if (id !== request) return;
    items.value = cache.get(target)!;
    if (preferLatest) month.value = archiveMonths(items.value)[0]?.month || '';
  } catch {
    if (id === request) error.value = '复盘目录加载失败，请重试。';
  } finally { if (id === request) busy.value = false; }
}
function changeYear() { date.value = ''; month.value = ''; loadYear(); }
function changeMonth() { date.value = ''; limit.value = 20; }
function changeDate() {
  limit.value = 20;
  if (!date.value) return;
  const target = date.value.slice(0, 4);
  month.value = date.value.slice(0, 7);
  if (year.value !== target) { year.value = target; loadYear(false); }
}
function reset() { date.value = ''; month.value = ''; limit.value = 20; }
onMounted(async () => {
  let restored = false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (saved && years.some(item => item.year === saved.year)
      && (saved.month === '' || new RegExp(`^${saved.year}-(0[1-9]|1[0-2])$`).test(saved.month))
      && (saved.date === '' || (archiveDate({text: saved.date, link: ''}) === saved.date && saved.date.startsWith(saved.year)))) {
      year.value = saved.year; month.value = saved.month; date.value = saved.date; restored = true;
    }
  } catch { /* The archive remains usable without browser storage. */ }
  await loadYear(!restored);
  await nextTick();
  if (['#年度精华', '#' + encodeURIComponent('年度精华')].includes(location.hash)) document.getElementById('年度精华')?.scrollIntoView();
});
onBeforeUnmount(() => {
  ++request;
  try { sessionStorage.setItem(storageKey, JSON.stringify({ year: year.value, month: month.value, date: date.value })); }
  catch { /* Browsing still works if storage is disabled. */ }
});
</script>

<template>
  <section class="review-archive" data-pagefind-ignore>
    <div class="library-status"><span>复盘资料截至 <time>{{ catalog.latestDate }}</time></span><span>原文与历史整理资料</span></div>
    <p>按日期回看市场记录，按年份阅读精华整理。这里保存历史资料，并非每日实时更新。</p>
    <nav class="archive-shortcuts" aria-label="复盘资料入口"><a href="#每日复盘">每日复盘</a><a href="#年度精华">年度精华</a><a :href="withBase('/reviews/aizaibingchuan/strategies/')">交易战法</a></nav>
    <section aria-labelledby="每日复盘">
      <h2 id="每日复盘">每日复盘</h2>
      <p class="library-caption">选择年份、月份或具体日期，查找已收录的复盘。日期相同的不同版本分别保留。</p>
      <div class="archive-filters">
        <label>年份<select v-model="year" @change="changeYear"><option v-for="item in years" :key="item.year" :value="item.year">{{ item.year }} 年</option></select></label>
        <label>月份<select v-model="month" @change="changeMonth"><option value="">全年</option><option v-for="group in months" :key="group.month" :value="group.month">{{ Number(group.month.slice(5)) }} 月</option></select></label>
        <label>复盘日期<input v-model="date" type="date" :min="`${years.at(-1)?.year}-01-01`" :max="`${years[0]?.year}-12-31`" @change="changeDate"></label>
        <button v-if="date || month" type="button" class="library-more" @click="reset">查看全年</button>
      </div>
      <div class="archive-results" :aria-busy="busy">
        <p role="status" class="archive-result-status">{{ busy ? '正在加载复盘…' : error || (matches.length ? `${year} 年已筛选 ${matches.length} 篇，当前显示 ${articles.length} 篇。` : '所选日期未收录复盘，请调整日期或查看全年。') }}</p>
        <button v-if="error" type="button" class="library-more" @click="loadYear(false)">重试</button>
        <ReviewList v-if="!busy && !error" :articles="articles" />
        <button v-if="!busy && !error && matches.length > limit" type="button" class="library-more" @click="limit += 20">加载更多复盘</button>
      </div>
    </section>
    <section aria-labelledby="年度精华">
      <h2 id="年度精华">年度精华</h2>
      <p class="library-caption">爱在冰川复盘精华，按年份整理。最新年份优先展示。</p>
      <div class="archive-highlights"><a v-for="item in highlights" :key="item.link" :href="withBase(item.link.replace(/\.md$/, ''))"><strong>{{ item.text }} 年</strong><span>复盘精华</span></a></div>
    </section>
  </section>
</template>
