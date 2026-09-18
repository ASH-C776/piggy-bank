<script setup lang="ts">
import { computed } from 'vue';
import { getCategory } from '@/utils/categories';

const props = withDefaults(defineProps<{
  icon?: string | null;
  size?: number;
}>(), {
  size: 44,
});

const cat = computed(() => getCategory(props.icon));
const style = computed(() => {
  const s = props.size;
  return {
    width: `${s}px`,
    height: `${s}px`,
    background: `radial-gradient(circle at 32% 26%, #ffffff 0%, ${cat.value.color}33 55%, ${cat.value.color}66 100%)`,
    boxShadow: `0 4px 12px ${cat.value.color}44, inset 0 1px 2px rgba(255,255,255,0.6)`,
  } as Record<string, string>;
});
const svgSize = computed(() => Math.round(props.size * 0.82));

// 扁平可爱风简笔图标统一描边
const LINE = '#5a4a42';
</script>

<template>
  <div class="cat-icon" :style="style" :title="cat.label">
    <svg :width="svgSize" :height="svgSize" viewBox="0 0 24 24" fill="none"
      stroke="#5a4a42" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <!-- 零食：雪糕 -->
      <g v-if="cat.key === 'snack'">
        <rect x="8" y="3.5" width="8" height="11.5" rx="3.5" fill="#ff9bb0" />
        <path d="M12 15v4.2" :stroke="'#b07b52'" stroke-width="1.8" />
        <circle cx="10.6" cy="8.4" r="0.65" :fill="LINE" stroke="none" />
        <circle cx="13.4" cy="8.4" r="0.65" :fill="LINE" stroke="none" />
        <path d="M11 10.3c0.6 0.5 1.4 0.5 2 0" stroke-width="1.1" />
        <path d="M9.3 6.2c0.8-0.7 1.6-0.9 2.4-0.9" stroke="#ffd9e2" stroke-width="1.1" />
      </g>
      <!-- 玩具：小火车 -->
      <g v-else-if="cat.key === 'toy'">
        <rect x="5" y="7.5" width="2.2" height="3.5" rx="0.6" fill="#ff9bb0" />
        <rect x="3" y="11" width="9.5" height="6" rx="1.5" fill="#84c5ff" />
        <rect x="12.5" y="6.5" width="7" height="10.5" rx="1.5" fill="#aed8f8" />
        <rect x="14.4" y="8.8" width="3.2" height="3" rx="0.8" fill="#ffffff" stroke="none" />
        <circle cx="6.5" cy="18.6" r="1.7" fill="#ffffff" />
        <circle cx="11.5" cy="18.6" r="1.7" fill="#ffffff" />
        <circle cx="16.5" cy="18.6" r="1.7" fill="#ffffff" />
        <path d="M5 14.2h5" stroke-width="1.1" />
      </g>
      <!-- 活动：露营帐篷 -->
      <g v-else-if="cat.key === 'activity'">
        <path d="M12 4.5 21 19H3Z" fill="#ffb454" />
        <path d="M12 10.5 16.6 19H7.4Z" fill="#e08f3c" stroke="none" />
        <path d="M12 10.5V19" stroke-width="1.3" />
        <path d="M4.5 19h15" stroke-width="1.2" />
      </g>
      <!-- 游戏：手柄 -->
      <g v-else-if="cat.key === 'game'">
        <path d="M8 8h8c2.8 0 5.5 2 5.5 5.2 0 2.4-1.3 4.8-3.2 4.8-1.3 0-2-1-2.8-2.2H8.5C7.7 17 7 18 5.7 18 3.8 18 2.5 15.6 2.5 13.2 2.5 10 5.2 8 8 8Z" fill="#7ed4b9" />
        <path d="M8 11v4M6 13h4" stroke-width="1.4" />
        <circle cx="15" cy="11.8" r="0.9" :fill="LINE" stroke="none" />
        <circle cx="17.2" cy="14" r="0.9" :fill="LINE" stroke="none" />
      </g>
      <!-- 学习：书本 -->
      <g v-else-if="cat.key === 'study'">
        <rect x="4.5" y="13.6" width="13" height="3.4" rx="1.2" fill="#b39ddb" />
        <rect x="6.5" y="10.1" width="13" height="3.4" rx="1.2" fill="#84c5ff" />
        <rect x="4.5" y="6.6" width="13" height="3.4" rx="1.2" fill="#ffd166" />
        <path d="M6.8 8.3h2.4M8.8 15.3h2.4" stroke-width="1.1" />
      </g>
      <!-- 特权：皇冠 -->
      <g v-else-if="cat.key === 'privilege'">
        <path d="M4.5 17.5V9l4 3 3.5-5 3.5 5 4-3v8.5Z" fill="#ffd166" />
        <circle cx="12" cy="7" r="0.8" :fill="LINE" stroke="none" />
        <circle cx="4.5" cy="9" r="0.8" :fill="LINE" stroke="none" />
        <circle cx="19.5" cy="9" r="0.8" :fill="LINE" stroke="none" />
        <circle cx="12" cy="14.8" r="1" fill="#ff9bb0" stroke-width="1" />
      </g>
      <!-- 美食：汉堡 -->
      <g v-else-if="cat.key === 'food'">
        <path d="M4.5 10c0-3.2 3.4-5.3 7.5-5.3S19.5 6.8 19.5 10Z" fill="#ffcf8e" />
        <path d="M8.5 7.2h0.01M12 6.4h0.01M15.5 7.2h0.01" stroke-width="1.5" />
        <path d="M4.5 12.6c1.2 1 2.4 1 3.7 0 1.2 1 2.4 1 3.7 0 1.2 1 2.4 1 3.7 0 1.2 1 2.4 1 3.7 0" stroke="#7ed4b9" stroke-width="1.5" />
        <rect x="4.5" y="15" width="15" height="2.3" rx="1.15" fill="#b07b52" />
        <path d="M4.5 19.8h15c0-1.3-1-2.1-2.4-2.1H6.9c-1.4 0-2.4 0.8-2.4 2.1Z" fill="#ffcf8e" />
      </g>
      <!-- 其他：神秘礼盒 -->
      <g v-else>
        <rect x="4.5" y="10" width="15" height="9.5" rx="1.5" fill="#e8b4c8" />
        <rect x="3.5" y="7.4" width="17" height="3" rx="1.2" fill="#f6cadd" />
        <circle cx="10.2" cy="6" r="1.6" fill="#ffd166" />
        <circle cx="13.8" cy="6" r="1.6" fill="#ffd166" />
        <path d="M10.7 13.6c0-2 3-2 3 0 0 1.4-1.5 1.3-1.5 2.6" stroke="#ffffff" stroke-width="1.4" />
        <circle cx="12.2" cy="17.8" r="0.8" fill="#ffffff" stroke="none" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.cat-icon {
  border-radius: var(--r-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.7);
}
svg { display: block; }
</style>
