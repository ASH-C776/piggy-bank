<script setup lang="ts">
import { useToastStore } from '@/stores/toast';
import { computed } from 'vue';

const toast = useToastStore();
const items = computed(() => toast.toasts);

function icon(type: string): string {
  return { success: '✓', error: '✕', info: 'ⓘ', warning: '!' }[type] || 'ⓘ';
}
</script>

<template>
  <Teleport to="body">
    <!--
      live region 必须落在「自始至终存在」的节点上：屏幕阅读器只在**已经存在**
      的区域内部发生内容变化时才播报；如果连区域本身都是随 toast 一起新建的
      （比如把 role="status" 挂到 .toast-item 上），新增节点不会触发播报。
      这里 .toast-host 由 Teleport 无条件渲染，常驻 DOM，故选它。
      aria-atomic="false" 覆盖 role="status" 隐含的 atomic=true：否则每次有
      新 toast 进来、或有一条被移除，阅读器会把整叠 toast 从头念一遍。
    -->
    <div class="toast-host" role="status" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast" tag="div" class="toast-list">
        <!--
          点击可提前关闭，但**刻意不设 tabindex / role="button"**：
          toast 3.5s 后自动消失，提前关闭只是便利而非唯一入口（不存在只能靠
          点击才能完成的事），因此不构成键盘可达性缺口。反过来，若让它可聚焦，
          Tab 会走进这些转瞬即逝的元素，且 toast 卸载时焦点会掉回 body ——
          键盘用户会当场丢失位置，弊大于利。
        -->
        <div v-for="t in items" :key="t.id" :class="['toast-item', `t-${t.type}`]" @click="toast.dismiss(t.id)">
          <!-- 图标是 ✓ ✕ ⓘ ! 这类符号，会被念成「对勾 / 叉号 / 信息」，
               在消息正文之前制造噪音；真正的语义由文案承担。 -->
          <span class="icon" aria-hidden="true">{{ icon(t.type) }}</span>
          <span class="msg">{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: var(--space-16);
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  width: 100%;
  max-width: 480px;
  padding: 0 var(--space-16);
  pointer-events: none;
}

.toast-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  align-items: center;
}

.toast-item {
  pointer-events: auto;
  padding: var(--space-12) var(--space-18);
  border-radius: var(--r-md);
  background: var(--glass-bg-strong);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow-float);
  display: inline-flex;
  align-items: center;
  gap: var(--space-10);
  max-width: 100%;
  cursor: pointer;
  font-size: var(--fs-sm);
}

.icon {
  width: 24px;
  height: 24px;
  border-radius: var(--r-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  flex-shrink: 0;
}

.t-success .icon { background: rgba(126, 212, 185, 0.25); color: var(--text-on-mint); }
.t-error .icon   { background: rgba(255, 122, 122, 0.25); color: var(--text-on-red); }
.t-info .icon    { background: rgba(132, 197, 255, 0.25); color: var(--text-on-sky); }
.t-warning .icon { background: rgba(255, 209, 102, 0.25); color: var(--text-on-yellow); }

.toast-enter-active, .toast-leave-active {
  transition: all var(--dur-slow) cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}
</style>
