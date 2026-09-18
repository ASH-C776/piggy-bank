<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';

interface Child { id: number; name: string; avatar: string }

const props = defineProps<{
  modelValue: boolean;
  task?: any;
  children: Child[];
}>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  saved: [];
}>();

const toast = useToastStore();
const isEdit = computed(() => !!props.task);

const name = ref('');
const description = ref('');
const points = ref(10);
const assigneeIds = ref<number[]>([]);
const deadlineEnabled = ref(false);
const deadlineDate = ref('');
const deadlineTime = ref('22:00');
const saving = ref(false);

watch(() => props.modelValue, (open) => {
  if (open) {
    if (props.task) {
      name.value = props.task.name;
      description.value = props.task.description ?? '';
      points.value = props.task.points;
      // 编辑时单条任务的 user_id
      assigneeIds.value = props.task.user_id ? [props.task.user_id] : [];
      if (props.task.deadline) {
        deadlineEnabled.value = true;
        const d = new Date(props.task.deadline * 1000);
        deadlineDate.value = d.toISOString().slice(0, 10);
        deadlineTime.value = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      } else {
        deadlineEnabled.value = false;
      }
    } else {
      name.value = '';
      description.value = '';
      points.value = 10;
      assigneeIds.value = [];
      deadlineEnabled.value = false;
      const now = new Date();
      deadlineDate.value = now.toISOString().slice(0, 10);
      deadlineTime.value = '22:00';
    }
  }
});

function toggleAssignee(id: number) {
  const idx = assigneeIds.value.indexOf(id);
  if (idx >= 0) assigneeIds.value.splice(idx, 1);
  else assigneeIds.value.push(id);
}

async function save() {
  if (!name.value.trim()) return toast.warning('请输入任务名称');
  if (!isEdit.value && assigneeIds.value.length === 0) {
    return toast.warning('请至少选择一个小朋友');
  }

  let deadline: number | null | undefined;
  if (deadlineEnabled.value && deadlineDate.value) {
    const dt = new Date(`${deadlineDate.value}T${deadlineTime.value}:00`);
    deadline = Math.floor(dt.getTime() / 1000);
  } else if (!isEdit.value) {
    deadline = undefined;
  } else {
    deadline = null;
  }

  saving.value = true;
  try {
    if (isEdit.value) {
      await api.patch(`/adhoc-tasks/${props.task.id}`, {
        name: name.value.trim(),
        description: description.value.trim() || null,
        points: points.value,
        deadline: deadline ?? null,
      });
      toast.success('已更新任务');
    } else {
      await api.post('/adhoc-tasks', {
        name: name.value.trim(),
        description: description.value.trim() || undefined,
        points: points.value,
        deadline,
        assigneeIds: assigneeIds.value,
      });
      toast.success(`任务发布成功，共 ${assigneeIds.value.length} 条 🎉`);
    }
    emit('saved');
  } catch (e: any) {
    toast.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="isEdit ? '编辑任务' : '任务发布'"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="form">
      <template v-if="!isEdit">
        <div class="field">
          <label class="label">选择小朋友（可多选，每人生成一条任务）</label>
          <div class="child-grid">
            <button
              v-for="c in children"
              :key="c.id"
              type="button"
              :class="['child-chip', { active: assigneeIds.includes(c.id) }]"
              @click="toggleAssignee(c.id)"
            >
              <ZodiacAvatar :zodiac="c.avatar" :size="56" />
              <span>{{ c.name }}</span>
              <span v-if="assigneeIds.includes(c.id)" class="check">✓</span>
            </button>
          </div>
          <p v-if="children.length === 0" class="hint">还没有小朋友，先去总览页创建</p>
        </div>
      </template>

      <div class="field">
        <label class="label">任务名称</label>
        <input v-model="name" type="text" maxlength="50" placeholder="如：整理书桌" />
      </div>

      <div class="field">
        <label class="label">任务描述（可选）</label>
        <textarea v-model="description" maxlength="200" rows="2" placeholder="任务详情..."></textarea>
      </div>

      <div class="field">
        <label class="label">奖励积分 🌟</label>
        <input v-model.number="points" type="number" min="1" max="999" />
      </div>

      <div class="field">
        <label class="label">
          <input v-model="deadlineEnabled" type="checkbox" class="checkbox" />
          截止时间
        </label>
        <div v-if="deadlineEnabled" class="deadline-row">
          <input v-model="deadlineDate" type="date" class="date-input" />
          <input v-model="deadlineTime" type="time" class="time-input" />
        </div>
        <p v-if="deadlineEnabled" class="hint">超时后任务会显示"已超时"，但仍可提交完成申请</p>
      </div>
    </div>

    <template #footer>
      <span style="flex:1"></span>
      <button class="btn btn-ghost" @click="emit('update:modelValue', false)">取消</button>
      <button class="btn btn-primary" @click="save" :disabled="saving">
        {{ saving ? '保存中...' : (isEdit ? '保存' : '发布') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--space-18); }
.field { display: flex; flex-direction: column; gap: var(--space-8); }
.label { font-size: var(--fs-sm); color: var(--text-secondary); padding-left: var(--space-4); display: flex; align-items: center; gap: var(--space-6); }
.hint { font-size: var(--fs-xs); color: var(--text-muted); padding-left: var(--space-4); }
.checkbox { width: auto; }

textarea { resize: vertical; min-height: 60px; font-family: inherit; }

.child-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-8);
}
.child-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-10) var(--space-4);
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 2px solid transparent;
  transition: all var(--dur-base);
  position: relative;
  cursor: pointer;
}
.child-chip span { font-size: var(--fs-xs); font-family: var(--font-cute); }
.child-chip.active {
  border-color: var(--accent-yellow);
  background: rgba(255, 209, 102, 0.15);
}
.child-chip .check {
  position: absolute;
  top: var(--space-4);
  right: var(--space-6);
  color: var(--text-on-yellow);
  font-size: var(--fs-sm);
  font-weight: bold;
}

.deadline-row { display: flex; gap: var(--space-8); }
.date-input, .time-input { flex: 1; }
</style>
