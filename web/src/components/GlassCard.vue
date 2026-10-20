<script setup lang="ts">
const props = withDefaults(defineProps<{
  variant?: 'normal' | 'strong';
  padding?: string;
  hover?: boolean;
  /**
   * 整卡充当按钮（弹窗入口、页面跳转入口）。
   *
   * 这类卡片是 div，默认**不可聚焦** —— 键盘与辅助技术用户根本打不开它们背后的
   * 弹窗，于是「弹窗支持 Esc 关闭」也就失去意义。clickable 补上 tabindex，
   * 并把 Enter/Space 转发为根元素的原生 click，从而复用调用点已有的 @click，
   * 调用方无需重复写键盘处理。
   *
   * 同时补 role="button"（B6）：只有 tabindex 而无声明的 div 虽然可聚焦，
   * 但屏幕阅读器只会念出里面的文字，不会告诉用户「这里可以按」。
   *
   * ！不要做成 role="button" 里再套一个 role="button" —— 交互元素嵌套会让
   *   阅读器念两遍、也让 Tab 顺序出现两个同义停靠点。图表这类自带按钮语义的
   *   子组件在被本组件包裹时需显式关掉自身语义（见 GrowthChart 的 interactive）。
   */
  clickable?: boolean;
  /**
   * 显式可访问名。不传时用卡片内的文本自动推导 —— 内容是「今日加分 +5」这类
   * 数据摘要时，自动推导反而比一句「查看记录」信息量更大，是更好的选择。
   * 需要显式指定的两种情形：
   *   1. 内容含装饰 emoji 或大段图形（SVG 图表会把自己轴刻度上的文字也算进
   *      可访问名），自动推导出来的名字又长又乱；
   *   2. 卡片内文字是纯展示数据、而点击做的是另一件事（如「12 🌟 = 1 元」→ 设置汇率）。
   */
  label?: string;
}>(), {
  variant: 'normal',
  padding: '20px',
  hover: false,
  clickable: false,
  label: '',
});

function onKeydown(e: KeyboardEvent) {
  if (!props.clickable) return;
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).click();
}
</script>

<template>
  <div
    class="glass-card"
    :class="[variant === 'strong' ? 'glass-strong' : 'glass', { hoverable: hover }]"
    :style="{ padding }"
    :tabindex="clickable ? 0 : undefined"
    :role="clickable ? 'button' : undefined"
    :aria-label="clickable && label ? label : undefined"
    @keydown="onKeydown"
  >
    <slot />
  </div>
</template>

<style scoped>
.glass-card {
  position: relative;
  overflow: hidden;
}

/* clickable 的卡片必须同时给出手型光标 */
.glass-card[tabindex] {
  cursor: pointer;
}

.hoverable {
  transition: transform var(--dur-base), box-shadow var(--dur-base);
  cursor: pointer;
}
.hoverable:hover {
  transform: translateY(-3px);
  box-shadow: var(--glass-shadow-hover);
}
.hoverable:active {
  transform: translateY(0) scale(0.99);
}
</style>
