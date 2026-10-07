<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import catalog from '../library-catalog.json';
import { readings, type Reading } from '../reading-storage';
import ReviewList from './ReviewList.vue';
const previous = ref<Reading>();
const reviewCategory = catalog.categories.find(item => item.key === 'reviews');
const knowledge = catalog.categories.filter(item => item.key !== 'reviews');
const descriptions: Record<string, string> = {
  'trading-rules': '交易制度与市场规则', technical: '走势分析与交易方法',
  thematic: '题材挖掘与逻辑梳理', 'sentiment-cycle': '市场情绪与周期判断', 'risk-management': '仓位管理与风险应对',
};
onMounted(() => { previous.value = readings()[0]; });
</script>

<template>
  <section class="library-home" data-pagefind-ignore>
    <div class="library-status"><span>历史资料库</span><span>已收录 {{ catalog.total.toLocaleString('zh-CN') }} 篇</span><span>复盘资料截至 <time>{{ catalog.latestDate || '暂无' }}</time></span></div>
    <p>按主题阅读交易知识，按年份查阅历史复盘。资料并非每日实时更新。</p>
    <p v-if="catalog.importFailures" role="status">历史导入报告记录 {{ catalog.importFailures }} 篇失败，已收录内容仍可阅读。</p>
    <a v-if="previous" class="library-resume" :href="previous.path">继续上次阅读：{{ previous.title }}</a>
    <section class="library-feature">
      <div><span class="library-eyebrow">历史复盘</span><h2>复盘文档</h2><p>{{ reviewCategory?.count.toLocaleString('zh-CN') }} 篇资料，按日期查阅每日复盘，按年份阅读精华整理。</p></div>
      <div class="library-actions"><a class="library-primary" :href="withBase('/reviews/')">查阅每日复盘</a><a :href="withBase('/reviews/#年度精华')">阅读年度精华</a></div>
    </section>
    <h2>交易知识</h2>
    <div class="library-categories">
      <a v-for="category in knowledge" :key="category.key" :href="withBase(`/${category.key}/`)">
        <div><strong>{{ category.name }}</strong><span>{{ category.count }} 篇</span></div><p>{{ descriptions[category.key] }}</p>
      </a>
    </div>
    <div class="library-section-heading"><h2>最新收录复盘</h2><a :href="withBase('/reviews/')">查看全部复盘</a></div>
    <ReviewList :articles="catalog.latest" />
  </section>
</template>
