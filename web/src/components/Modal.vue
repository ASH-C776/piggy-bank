<script setup lang="ts">
import { watch } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  title?: string;
  width?: string;
}>(), {
  title: '',
  width: '440px',
});

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
}>();

function close() {
  emit('update:modelValue', false);
}

watch(() => props.modelValue, (open) => {
  document.body.style.overflow = open ? 'hidden' : '';
});

function onMaskClick() {
  close();
}
</script>

<template>
  <!-- Teleport 到 body：弹窗面板带 backdrop-filter，会成为后代 fixed 元素的包含块，
       不传送的话嵌套弹窗（如账号管理→编辑账号）会被限制在父弹窗内并被裁切 -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="modelValue" class="modal-mask" @click.self="onMaskClick">
        <Transition name="slide-up" appear>
          <div v-if="modelValue" class="modal-panel glass-strong" :style="{ width }" @click.stop>
            <header v-if="title" class="modal-header">
              <h3>{{ title }}</h3>
              <button class="close-btn" @click="close" aria-label="关闭">✕</button>
            </header>
            <button v-else class="close-btn floating" @click="close" aria-label="关闭">✕</button>
            <div class="modal-body">
              <slot />
            </div>
            <footer v-if="$slots.footer" class="modal-footer">
              <slot name="footer" />
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-panel {
  max-width: calc(100% - 32px);
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header h3 {
  font-family: var(--font-cute);
  font-size: 20px;
}

.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: background 0.2s;
}
.close-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}
.close-btn.floating {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
