<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';

interface Task {
  id: number;
  name: string;
  points: number;
  scope: 'assignee' | 'all';
  assignee_ids?: string | null;
}

interface Child { id: number; name: string; avatar: string }

const props = defineProps<{
  modelValue: boolean;
  task: Task;
  children: Child[];
}>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  done: [];
}>();

const toast = useToastStore();
const selectedUserId = ref<number | null>(null);
const saving = ref(false);

// 任务分配的小孩（响应式计算）
const availableChildren = computed(() => {
  if (!props.task) return [];
  if (props.task.scope === 'all') return props.children;
  const ids = props.task.assignee_ids?.split(',').map(s => s.trim()) ?? [];
  return props.children.filter(c => ids.includes(String(c.id)));
});

// 弹窗打开时重置选择
watch(() => props.modelValue, (open) => {
  if (open) selectedUserId.value = null;
});

async function complete() {
  if (!selectedUserId.value) return toast.warning('请选择完成的小朋友');
  saving.value = true;
  try {
    const res = await api.post<{ ok: boolean; newBalance: number }>(`/adhoc-tasks/${props.task.id}/complete`, {
      userId: selectedUserId.value,
    });
    toast.success(`任务完成！+${props.task.points} 分`);
    emit('done');
  } catch (e: any) {
    if (e.payload?.error === 'already_completed') toast.warning('任务已完成过了');
    else if (e.payload?.error === 'not_assigned') toast.warning('该小朋友未被分配');
    else toast.error(e.message || '操作失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    title="确认完成任务"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="content">
      <div class="task-info">
        <div class="name">{{ task.name }}</div>
        <div class="pts">+{{ task.points }}分</div>
      </div>
      <p class="hint">选择完成此任务的小朋友：</p>
      <div class="child-grid">
        <button
          v-for="c in availableChildren"
          :key="c.id"
          type="button"
          :class="['child-chip', { active: selectedUserId === c.id }]"
          @click="selectedUserId = c.id"
        >
          <ZodiacAvatar :zodiac="c.avatar" :size="60" />
          <span>{{ c.name }}</span>
        </button>
      </div>
      <p v-if="availableChildren.length === 0" class="empty">没有可选的小朋友</p>
    </div>

    <template #footer>
      <span style="flex:1"></span>
      <button class="btn btn-ghost" @click="emit('update:modelValue', false)">取消</button>
      <button class="btn btn-success" @click="complete" :disabled="saving">
        {{ saving ? '处理中...' : '✅ 确认完成' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.content { display: flex; flex-direction: column; gap: var(--space-16); }
.task-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-14) var(--space-16);
  background: var(--glass-bg);
  border-radius: var(--r-md);
}
.task-info .name {
  font-family: var(--font-cute);
  font-size: var(--fs-lg);
}
.task-info .pts {
  color: var(--text-on-yellow);
  font-family: var(--font-cute);
  font-size: var(--fs-xl);
}
.hint {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  padding-left: var(--space-4);
}
.child-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: var(--space-10);
}
.child-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-10) var(--space-6);
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 2px solid transparent;
  transition: all var(--dur-base);
  font-size: var(--fs-sm);
}
.child-chip:hover { background: var(--glass-bg-strong); }
.child-chip.active {
  background: var(--glass-bg-strong);
  border-color: var(--accent-mint);
  box-shadow: 0 0 0 3px rgba(126, 212, 185, 0.15);
}
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: var(--space-20);
}
</style>
