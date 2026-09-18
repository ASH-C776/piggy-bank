<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useDialog } from '@/composables/useDialog';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  title?: string;
  width?: string;
  /** playful = 孩子端：更大圆角与更宽松内边距，观感更活泼 */
  variant?: 'default' | 'playful';
  /** 无 title 时必须给一个可访问名，否则屏幕阅读器只念「对话框」 */
  ariaLabel?: string;
  /** 保存中等情况可置 false，避免误关丢失输入 */
  closeOnEsc?: boolean;
  closeOnMask?: boolean;
}>(), {
  title: '',
  width: '440px',
  variant: 'default',
  ariaLabel: '',
  closeOnEsc: true,
  closeOnMask: true,
});

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
}>();

const panelEl = ref<HTMLElement | null>(null);
const titleId = useId();

function close() {
  emit('update:modelValue', false);
}

useDialog({
  open: computed(() => props.modelValue),
  panel: panelEl,
  close,
  canClose: () => props.closeOnEsc,
});

function onMaskClick() {
  if (props.closeOnMask) close();
}
</script>

<template>
  <!-- Teleport 到 body：弹窗面板带 backdrop-filter，会成为后代 fixed 元素的包含块，
       不传送的话嵌套弹窗（如账号管理→编辑账号）会被限制在父弹窗内并被裁切 -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="modelValue" class="modal-mask" @click.self="onMaskClick">
        <Transition name="slide-up" appear>
          <div
            v-if="modelValue"
            ref="panelEl"
            class="modal-panel glass-strong"
            :class="`variant-${variant}`"
            :style="{ width }"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="title ? titleId : undefined"
            :aria-label="title ? undefined : ariaLabel || undefined"
            tabindex="-1"
            @click.stop
          >
            <header v-if="title" class="modal-header">
              <h3 :id="titleId">{{ title }}</h3>
              <button class="close-btn" type="button" @click="close" aria-label="关闭">✕</button>
            </header>
            <button v-else class="close-btn floating" type="button" @click="close" aria-label="关闭">✕</button>
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
  background: var(--scrim);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-20);
}

.modal-panel {
  max-width: calc(100% - 32px);
  /* dvh：移动端地址栏可见时 100vh 偏大，弹窗底部（含「保存」按钮）会被推出屏幕。
     保留 vh 作旧浏览器回退。 */
  max-height: calc(100vh - 64px);
  max-height: calc(100dvh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  /* 面板自身要能接收焦点（useDialog 在没有可聚焦子元素时把焦点落在它身上） */
  outline: none;
}

/* 孩子端：更大圆角 + 更宽松的内边距 */
.modal-panel.variant-playful {
  border-radius: var(--r-xl);
}
.modal-panel.variant-playful .modal-body {
  padding: var(--space-24) var(--space-20);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-18) var(--space-20) var(--space-12);
  border-bottom: 1px solid rgba(90, 58, 74, 0.08);
}

.modal-header h3 {
  font-family: var(--font-cute);
  font-size: var(--fs-xl);
}

.close-btn {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: var(--r-full);
  background: rgba(90, 58, 74, 0.06);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-md);
  transition: background var(--dur-base);
}
/* 视觉尺寸保持 32px 不变（避免 B1 引入布局位移），
   但把触控热区扩展到 44×44px，达到移动端建议值 */
.close-btn::after {
  content: '';
  position: absolute;
  inset: calc(-1 * var(--space-6));
  border-radius: var(--r-full);
}
.close-btn:hover {
  background: rgba(90, 58, 74, 0.12);
}
.close-btn.floating {
  position: absolute;
  top: var(--space-12);
  right: var(--space-12);
  z-index: 1;
}

.modal-body {
  padding: var(--space-20);
  overflow-y: auto;
  scrollbar-width: thin;
}

.modal-footer {
  padding: var(--space-16) var(--space-20);
  border-top: 1px solid rgba(90, 58, 74, 0.08);
  display: flex;
  justify-content: flex-end;
  gap: var(--space-12);
}
</style>
