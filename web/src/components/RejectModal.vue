<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';

const props = defineProps<{ modelValue: boolean; request: any }>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; done: [] }>();

const toast = useToastStore();
const reason = ref('');
const saving = ref(false);

watch(() => props.modelValue, (open) => {
  if (open) reason.value = '';
});

async function reject() {
  if (!reason.value.trim()) return toast.warning('请填写拒绝原因');
  saving.value = true;
  try {
    await api.post(`/exchange-requests/${props.request.id}/reject`, { reason: reason.value.trim() });
    toast.success('已拒绝');
    emit('done');
  } catch (e: any) { toast.error(e.message); }
  finally { saving.value = false; }
}
</script>

<template>
  <Modal :model-value="modelValue" title="拒绝兑换申请" @update:model-value="emit('update:modelValue', $event)">
    <div class="form">
      <p class="hint">拒绝后，积分将退回给 {{ request.user_name }}</p>
      <textarea v-model="reason" maxlength="100" rows="3" placeholder="如：库存不足 / 不合适的兑换"></textarea>
    </div>
    <template #footer>
      <span style="flex:1"></span>
      <button class="btn btn-ghost" @click="emit('update:modelValue', false)">取消</button>
      <button class="btn btn-danger" @click="reject" :disabled="saving">
        {{ saving ? '处理中...' : '确认拒绝' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 12px; }
.hint { font-size: 13px; color: var(--text-secondary); }
textarea { resize: vertical; min-height: 80px; font-family: inherit; }
</style>
