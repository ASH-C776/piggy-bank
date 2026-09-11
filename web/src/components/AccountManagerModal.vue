<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import ChildEditorModal from '@/components/ChildEditorModal.vue';
import EmptyState from '@/components/EmptyState.vue';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  changed: [];
}>();

interface Child {
  id: number;
  name: string;
  avatar: string;
  total_points: number;
}

const toast = useToastStore();

const children = ref<Child[]>([]);
const loading = ref(false);

// 新增/编辑弹窗
const editorOpen = ref(false);
const editingChild = ref<Child | null>(null);

// 删除确认
const confirmOpen = ref(false);
const deletingChild = ref<Child | null>(null);
const deleting = ref(false);

watch(() => props.modelValue, (open) => {
  if (open) load();
});

async function load() {
  loading.value = true;
  try {
    const res = await api.get<{ children: Child[] }>('/children');
    children.value = res.children;
  } catch (e: any) {
    toast.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function openAdd() {
  editingChild.value = null;
  editorOpen.value = true;
}

function openEdit(c: Child) {
  editingChild.value = c;
  editorOpen.value = true;
}

async function onSaved() {
  editorOpen.value = false;
  await load();
  emit('changed');
}

function askDelete(c: Child) {
  deletingChild.value = c;
  confirmOpen.value = true;
}

async function doDelete() {
  if (!deletingChild.value) return;
  const target = deletingChild.value;
  deleting.value = true;
  try {
    await api.delete(`/children/${target.id}`);
    toast.success(`已删除「${target.name}」`);
    deletingChild.value = null;
    await load();
    emit('changed');
  } catch (e: any) {
    toast.error(e.message || '删除失败');
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    title="账号管理"
    width="460px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="loading" class="loading">加载中...</div>

    <EmptyState
      v-else-if="children.length === 0"
      emoji="🐣"
      text="还没有小朋友账号"
      hint="点击下方按钮新增一个吧~"
    />

    <div v-else class="account-list">
      <div v-for="c in children" :key="c.id" class="account-item">
        <ZodiacAvatar :zodiac="c.avatar" :size="48" show-ring />
        <div class="info">
          <div class="name">{{ c.name }}</div>
          <div class="points">{{ c.total_points }} 分</div>
        </div>
        <div class="actions">
          <button class="icon-btn edit" title="编辑账号" @click="openEdit(c)">✏️</button>
          <button class="icon-btn del" title="删除账号" @click="askDelete(c)">🗑️</button>
        </div>
      </div>
    </div>

    <button class="btn btn-primary add-btn" @click="openAdd">
      <span>＋</span> 新增账号
    </button>

    <ChildEditorModal
      v-if="editorOpen"
      v-model="editorOpen"
      :child="editingChild"
      @saved="onSaved"
    />

    <ConfirmDialog
      v-model="confirmOpen"
      variant="danger"
      title="删除账号"
      :message="`确定删除「${deletingChild?.name ?? ''}」吗？该账号的积分、任务、兑换记录都会一并删除，且无法恢复。`"
      confirm-text="确认删除"
      @confirm="doDelete"
    />
  </Modal>
</template>

<style scoped>
.loading {
  padding: 30px 0;
  text-align: center;
  color: var(--text-muted);
}

.account-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
  max-height: 50vh;
  overflow-y: auto;
  padding-right: 4px;
}

.account-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
}

.info {
  flex: 1;
  min-width: 0;
}
.name {
  font-size: 15px;
  font-family: var(--font-cute);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.points {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--r-sm);
  background: var(--glass-bg-strong);
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.icon-btn:hover {
  transform: scale(1.08);
}
.icon-btn.del:hover {
  background: rgba(255, 107, 107, 0.18);
}

.add-btn {
  width: 100%;
}
</style>
