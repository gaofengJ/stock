---
layout: false
---

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vitepress'

const router = useRouter()

onMounted(() => {
  // 自动跳转到第一篇文章
  router.go('/market-microstructure/chapter1/capital-seat-profile.html')
})
</script>
