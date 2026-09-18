<script setup lang="ts">
import ReviewPanel from '@/components/ReviewPanel.vue';

/**
 * `/parent/review` 整页版。
 *
 * R3 之后审核的主入口已经变成「总览页右下角按钮 → 弹窗」，但这条路由**保留**：
 * 它是可深链、可收藏、可被外部跳转的稳定地址，删掉省不下什么，却会让任何残留引用
 * （含视觉验收脚本的页面扫描）静默失效。所以这里只是一个薄壳，行为与弹窗内完全一致。
 */
</script>

<template>
  <ReviewPanel />
</template>
