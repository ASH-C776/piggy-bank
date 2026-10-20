<script setup lang="ts">
import { ref, watch } from 'vue';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';

/**
 * 拒绝理由弹窗（兑换申请 / 任务完成申请共用）。
 *
 * 它**只负责收集原因**，收集到就 emit('submit', reason)，请求发往哪个接口由调用方决定。
 * 之前这一层把 `/exchange-requests/:id/reject` 写死在自己身上，于是任务拒绝只能另起一套
 * ConfirmDialog —— 而那套里的 taskRejectReason 从未绑定过任何输入框，导致
 * **任务拒绝原因恒为空字符串**（后端 `reason ?? ''` 不报错，小朋友就永远看不到原因）。
 * 让弹窗与接口解耦之后，两类申请共用同一条「填原因 → 提交」路径。
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    /** 一句后果说明，如"拒绝后积分将退回给 XX" */
    hint?: string;
    placeholder?: string;
    /** 调用方提交中：禁用按钮，避免重复提交 */
    saving?: boolean;
  }>(),
  {
    title: '拒绝申请',
    hint: '',
    placeholder: '如：库存不足 / 不合适的兑换',
    saving: false,
  }
);

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  submit: [reason: string];
}>();

const toast = useToastStore();
const reason = ref('');

// immediate：本弹窗由调用方以 v-if + v-model 挂载时，组件创建那一刻 modelValue 已经是 true，
// 不加 immediate 这条回调永不触发（ChildEditorModal 上踩过一次）。
watch(
  () => props.modelValue,
  (open) => {
    if (open) reason.value = '';
  },
  { immediate: true }
);

function submit() {
  const v = reason.value.trim();
  if (!v) {
    toast.warning('请填写拒绝原因');
    return;
  }
  emit('submit', v);
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="title"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="form">
      <p v-if="hint" class="hint">{{ hint }}</p>
      <label class="field-label" for="reject-reason">拒绝原因（会告诉小朋友）</label>
      <textarea
        id="reject-reason"
        v-model="reason"
        maxlength="100"
        rows="3"
        :placeholder="placeholder"
      ></textarea>
    </div>
    <template #footer>
      <span style="flex: 1"></span>
      <button class="btn btn-ghost" @click="emit('update:modelValue', false)">取消</button>
      <button class="btn btn-danger" :disabled="saving" @click="submit">
        {{ saving ? '处理中...' : '确认拒绝' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--space-10); }
.hint { font-size: var(--fs-sm); color: var(--text-secondary); }
.field-label { font-size: var(--fs-xs); color: var(--text-muted); }
textarea { resize: vertical; min-height: 80px; font-family: inherit; }
</style>
