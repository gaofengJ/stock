<script setup lang="ts">
import { withBase } from 'vitepress';
import { reviewTitle } from '../archive-utils';
defineProps<{ articles: Array<{ title: string; path: string; date: string; variant?: string }> }>();
</script>

<template>
  <ul class="library-latest">
    <li v-for="article in articles" :key="article.path">
      <time :datetime="article.date">{{ article.date }}</time>
      <a :href="withBase(article.path)" :title="article.title">{{ reviewTitle(article.title) }}</a>
      <span v-if="article.variant" class="review-variant">{{ article.variant }}</span>
    </li>
  </ul>
</template>
