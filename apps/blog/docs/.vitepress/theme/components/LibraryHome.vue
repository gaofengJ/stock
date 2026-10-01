<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import catalog from '../library-catalog.json';
import { readings, type Reading } from '../reading-storage';
const previous = ref<Reading>();
onMounted(() => { previous.value = readings()[0]; });
</script>

<template>
  <section class="library-home" data-pagefind-ignore>
    <p class="library-status">历史资料库 · {{ catalog.total }} 篇 · 最新复盘日期 {{ catalog.latestDate || '暂无' }}</p>
    <p>按主题阅读交易知识，按年份查阅历史复盘。资料并非每日实时更新。</p>
    <p v-if="catalog.importFailures" role="status">历史导入报告记录 {{ catalog.importFailures }} 篇失败，已收录内容仍可阅读。</p>
    <a v-if="previous" class="library-resume" :href="previous.path">继续上次阅读：{{ previous.title }}</a>
    <div class="library-categories">
      <a v-for="category in catalog.categories" :key="category.key" :href="withBase(`/${category.key}/`)">
        <strong>{{ category.name }}</strong><span>{{ category.count }} 篇</span>
      </a>
    </div>
    <h2>最新收录复盘</h2>
    <ul class="library-latest">
      <li v-for="article in catalog.latest" :key="article.path">
        <a :href="withBase(article.path)">{{ article.title }}</a>
        <span>{{ article.date }} · {{ article.source }}</span>
      </li>
    </ul>
  </section>
</template>
