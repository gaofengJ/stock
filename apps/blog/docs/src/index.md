---
layout: false
---

<script setup>
import { onMounted } from 'vue'
import { useRouter, withBase } from 'vitepress'

const router = useRouter()

onMounted(() => {
  // 自动跳转到第一篇文章
  router.go(withBase('/trading-rules/fluctuation-regulation/abnormal-fluctuation-rules'))
})
</script>
