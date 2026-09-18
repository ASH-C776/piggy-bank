<script setup lang="ts">
import { computed } from 'vue';
import { getZodiac } from '@/utils/zodiac';

const props = withDefaults(defineProps<{
  zodiac?: string;
  size?: number;
  showRing?: boolean;
}>(), {
  size: 64,
  showRing: false,
});

const z = computed(() => getZodiac(props.zodiac));
const style = computed(() => {
  const s = props.size;
  const fontSize = Math.floor(s * 0.78);
  return {
    width: `${s}px`,
    height: `${s}px`,
    fontSize: `${fontSize}px`,
    background: `radial-gradient(circle at 30% 25%, #ffffff 0%, ${z.value.color} 60%, ${z.value.color}cc 100%)`,
    boxShadow: props.showRing
      ? `0 0 0 4px #ffffffaa, 0 0 0 7px ${z.value.color}aa, 0 8px 24px ${z.value.color}66`
      : `0 4px 16px ${z.value.color}55, inset 0 1px 2px rgba(255,255,255,0.5)`,
  } as Record<string, string>;
});
</script>

<template>
  <div class="zodiac-avatar" :style="style">
    <span class="emoji">{{ z.emoji }}</span>
  </div>
</template>

<style scoped>
.zodiac-avatar {
  border-radius: var(--r-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.7);
  position: relative;
  transition: transform var(--dur-base);
}
.zodiac-avatar:hover {
  transform: scale(1.05);
}
.emoji {
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Twemoji Mozilla', sans-serif;
  /* 同 B1 的判据：纯黑在粉调玻璃上发脏，改用主文字色相 */
  filter: drop-shadow(0 1px 2px rgba(90, 58, 74, 0.22));
}
</style>
