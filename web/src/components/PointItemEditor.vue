<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

const props = defineProps<{
  modelValue: boolean;
  item?: any;
  defaultType?: 'gain' | 'loss';
  ownerId?: number | null; // 当前选中的小孩id，新增时传入
}>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  saved: [];
}>();

const toast = useToastStore();
const isEdit = computed(() => !!props.item);

const name = ref('');
const type = ref<'gain' | 'loss'>('gain');
const points = ref(10);
const dailyLimit = ref(1);
const saving = ref(false);
const deleteOpen = ref(false);

watch(() => props.modelValue, (open) => {
  if (open) {
    if (props.item) {
      name.value = props.item.name;
      type.value = props.item.type;
      points.value = Math.abs(props.item.points);
      dailyLimit.value = props.item.daily_limit;
    } else {
      name.value = '';
      type.value = props.defaultType ?? 'gain';
      points.value = 10;
      dailyLimit.value = 1;
    }
  }
});

async function save() {
  if (!name.value.trim()) return toast.warning('请输入项目名称');
  if (points.value <= 0) return toast.warning('分值必须大于0');

  saving.value = true;
  try {
    const body: any = {
      name: name.value.trim(),
      type: type.value,
      points: points.value,
      daily_limit: dailyLimit.value,
    };
    if (!isEdit.value && props.ownerId !== undefined) {
      body.ownerId = props.ownerId;
    }
    if (isEdit.value) {
      await api.patch(`/point-items/${props.item.id}`, body);
      toast.success('已更新');
    } else {
      await api.post('/point-items', body);
      toast.success('新增成功');
    }
    emit('update:modelValue', false);
    emit('saved');
  } catch (e: any) {
    toast.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.item) return;
  try {
    await api.delete(`/point-items/${props.item.id}`);
    toast.success('已删除');
    emit('update:modelValue', false);
    emit('saved');
  } catch (e: any) {
    if (e.payload?.error === 'cannot_delete_default') {
      toast.error('默认项目不可删除，但可编辑或禁用');
    } else {
      toast.error(e.message || '删除失败');
    }
  }
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="isEdit ? '编辑项目' : '新增项目'"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="form">
      <div class="field">
        <label class="label">类型</label>
        <div class="type-tabs">
          <button type="button" :class="{ active: type === 'gain' }" @click="type = 'gain'">🌟 加分</button>
          <button type="button" :class="{ active: type === 'loss' }" @click="type = 'loss'">📉 扣分</button>
        </div>
      </div>

      <div class="field">
        <label class="label">项目名称</label>
        <input v-model="name" type="text" maxlength="30" placeholder="如：阅读30分钟" />
      </div>

      <div class="row">
        <div class="field">
          <label class="label">{{ type === 'gain' ? '奖励' : '扣除' }}分值</label>
          <input v-model.number="points" type="number" min="1" max="999" />
        </div>
        <div class="field">
          <label class="label">每日上限</label>
          <input v-model.number="dailyLimit" type="number" min="0" max="999" />
          <p class="hint">0 = 不限</p>
        </div>
      </div>
    </div>

    <template #footer>
      <button v-if="isEdit" class="btn btn-danger" @click="deleteOpen = true" :disabled="saving">删除</button>
      <span style="flex:1"></span>
      <button class="btn btn-ghost" @click="emit('update:modelValue', false)">取消</button>
      <button class="btn btn-primary" @click="save" :disabled="saving">
        {{ saving ? '保存中...' : '保存' }}
      </button>
    </template>
  </Modal>

  <ConfirmDialog
    v-model="deleteOpen"
    title="删除项目"
    :message="item ? `确定删除项目「${item.name}」？` : ''"
    confirm-text="确定"
    cancel-text="取消"
    variant="danger"
    @confirm="remove"
  />
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--space-18); }
.field { display: flex; flex-direction: column; gap: var(--space-8); }
.row { display: flex; gap: var(--space-14); }
.row .field { flex: 1; }
.label { font-size: var(--fs-sm); color: var(--text-secondary); padding-left: var(--space-4); }
.hint { font-size: var(--fs-xs); color: var(--text-muted); padding-left: var(--space-4); }

.type-tabs {
  display: flex;
  background: var(--glass-bg);
  border-radius: var(--r-md);
  padding: var(--space-4);
  gap: var(--space-4);
}
.type-tabs button {
  flex: 1;
  padding: var(--space-10);
  border-radius: var(--r-sm);
  color: var(--text-secondary);
  font-weight: 600;
  transition: all var(--dur-base);
}
.type-tabs button.active {
  background: var(--glass-bg-strong);
  color: var(--text-primary);
  box-shadow: var(--shadow-pill);
}
</style>
