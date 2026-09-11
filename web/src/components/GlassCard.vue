<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'normal' | 'strong';
  padding?: string;
  hover?: boolean;
}>(), {
  variant: 'normal',
  padding: '20px',
  hover: false,
});
</script>

<template>
  <div
    class="glass-card"
    :class="[variant === 'strong' ? 'glass-strong' : 'glass', { hoverable: hover }]"
    :style="{ padding }"
  >
    <slot />
  </div>
</template>

<style scoped>
.glass-card {
  position: relative;
  overflow: hidden;
}

.hoverable {
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: pointer;
}
.hoverable:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
.hoverable:active {
  transform: translateY(0) scale(0.99);
}
</style>
