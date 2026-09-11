<script setup lang="ts">
defineProps<{ emoji?: string; text: string; hint?: string }>();
</script>

<template>
  <div class="empty-state">
    <span class="emoji">{{ emoji ?? '📭' }}</span>
    <div class="text">{{ text }}</div>
    <div v-if="hint" class="hint">{{ hint }}</div>
  </div>
</template>

<style scoped>
.text {
  font-size: 16px;
  margin-bottom: 4px;
}
.hint {
  font-size: 13px;
  color: var(--text-muted);
  font-family: var(--font-body);
}
</style>
