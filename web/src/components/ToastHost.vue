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
    <div class="toast-host">
      <TransitionGroup name="toast" tag="div" class="toast-list">
        <div v-for="t in items" :key="t.id" :class="['toast-item', `t-${t.type}`]" @click="toast.dismiss(t.id)">
          <span class="icon">{{ icon(t.type) }}</span>
          <span class="msg">{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  width: 100%;
  max-width: 480px;
  padding: 0 16px;
  pointer-events: none;
}

.toast-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.toast-item {
  pointer-events: auto;
  padding: 12px 18px;
  border-radius: var(--r-md);
  background: var(--glass-bg-strong);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  cursor: pointer;
  font-size: 14px;
}

.icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  flex-shrink: 0;
}

.t-success .icon { background: rgba(126, 212, 185, 0.25); color: var(--success); }
.t-error .icon   { background: rgba(255, 122, 122, 0.25); color: var(--danger); }
.t-info .icon    { background: rgba(132, 197, 255, 0.25); color: var(--info); }
.t-warning .icon { background: rgba(255, 209, 102, 0.25); color: var(--warning); }

.toast-enter-active, .toast-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
