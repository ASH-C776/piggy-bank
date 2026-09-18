<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useDialog } from '@/composables/useDialog';

const props = defineProps<{
  modelValue: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
}>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  confirm: [];
  cancel: [];
}>();

const panelEl = ref<HTMLElement | null>(null);
const titleId = useId();
const messageId = useId();

function onConfirm() {
  // 先触发 confirm 再关闭，确保父组件在确认时仍能读取相关状态
  emit('confirm');
  emit('update:modelValue', false);
}
function onCancel() {
  emit('update:modelValue', false);
  emit('cancel');
}

useDialog({
  open: computed(() => props.modelValue),
  panel: panelEl,
  close: onCancel,
  // 初始焦点刻意落在「取消」而非「确认」：确认框常用于删除等不可逆操作，
  // 若焦点默认停在确认键上，一次误回车就会真的删掉数据。
  initialFocus: '.btn-cancel',
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="modelValue" class="overlay" @click.self="onCancel">
        <div
          ref="panelEl"
          class="dialog glass-strong"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="props.title ? titleId : undefined"
          :aria-describedby="messageId"
          tabindex="-1"
        >
          <div class="icon-circle" :class="props.variant">
            <span v-if="props.variant === 'danger'">⚠️</span>
            <span v-else>❓</span>
          </div>
          <h3 v-if="props.title" :id="titleId" class="title">{{ props.title }}</h3>
          <p :id="messageId" class="message">{{ props.message }}</p>
          <div class="actions">
            <button class="btn btn-ghost btn-cancel" type="button" @click="onCancel">
              {{ props.cancelText ?? '取消' }}
            </button>
            <button
              :class="['btn', props.variant === 'danger' ? 'btn-danger' : 'btn-primary']"
              type="button"
              @click="onConfirm"
            >
              {{ props.confirmText ?? '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  display: flex;
  align-items: center;
  justify-content: center;
  /* 高于 Modal(1000)：确认框可能开在弹窗内部，必须压在上面 */
  z-index: 1500;
  padding: var(--space-20);
}
.dialog {
  width: 100%;
  max-width: 340px;
  padding: var(--space-28) var(--space-24) var(--space-20);
  border-radius: var(--r-lg);
  border: 1px solid var(--glass-border);
  text-align: center;
  outline: none;
}
.icon-circle {
  width: 56px;
  height: 56px;
  border-radius: var(--r-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-4xl);
  margin-bottom: var(--space-14);
  background: var(--glass-bg);
}
.icon-circle.danger {
  background: rgba(255, 122, 122, 0.15);
}
.title {
  font-family: var(--font-cute);
  font-size: var(--fs-xl);
  margin-bottom: var(--space-8);
}
.message {
  font-size: var(--fs-md);
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: var(--space-24);
}
.actions {
  display: flex;
  gap: var(--space-12);
}
.actions .btn { flex: 1; }

.fade-enter-active, .fade-leave-active {
  transition: opacity var(--dur-base);
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
