<script setup lang="ts">
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

function onConfirm() {
  // 先触发 confirm 再关闭，确保父组件在确认时仍能读取相关状态
  emit('confirm');
  emit('update:modelValue', false);
}
function onCancel() {
  emit('update:modelValue', false);
  emit('cancel');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="modelValue" class="overlay" @click.self="onCancel">
        <div class="dialog glass-strong">
          <div class="icon-circle" :class="props.variant">
            <span v-if="props.variant === 'danger'">⚠️</span>
            <span v-else>❓</span>
          </div>
          <h3 v-if="props.title" class="title">{{ props.title }}</h3>
          <p class="message">{{ props.message }}</p>
          <div class="actions">
            <button class="btn btn-ghost" @click="onCancel">
              {{ props.cancelText ?? '取消' }}
            </button>
            <button
              :class="['btn', props.variant === 'danger' ? 'btn-danger' : 'btn-primary']"
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
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
  padding: 20px;
}
.dialog {
  width: 100%;
  max-width: 340px;
  padding: 28px 24px 20px;
  border-radius: var(--r-lg);
  border: 1px solid var(--glass-border);
  text-align: center;
}
.icon-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-bottom: 14px;
  background: var(--glass-bg);
}
.icon-circle.danger {
  background: rgba(255, 122, 122, 0.15);
}
.title {
  font-family: var(--font-cute);
  font-size: 20px;
  margin-bottom: 8px;
}
.message {
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 24px;
}
.actions {
  display: flex;
  gap: 12px;
}
.actions .btn { flex: 1; }

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
