<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import GlassCard from '@/components/GlassCard.vue';
import EmptyState from '@/components/EmptyState.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import AdhocTaskEditor from '@/components/AdhocTaskEditor.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

const toast = useToastStore();

// WebSocket 事件自动刷新
function onWsEvent() { load(); }

onMounted(() => {
  window.addEventListener('ws:task_completion_submitted', onWsEvent);
  window.addEventListener('ws:task_review', onWsEvent);
  load();
});

onUnmounted(() => {
  window.removeEventListener('ws:task_completion_submitted', onWsEvent);
  window.removeEventListener('ws:task_review', onWsEvent);
});

interface Task {
  id: number;
  name: string;
  description: string | null;
  points: number;
  deadline: number | null;
  status: string;
  created_at: number;
  completed_at: number | null;
  user_id: number;
  user_name: string;
  user_avatar: string;
  completion_status: 'pending' | 'approved' | 'rejected' | null;
  pending_completion?: { id: number; created_at: number } | null;
}

interface Child {
  id: number;
  name: string;
  avatar: string;
  total_points: number;
}

const tasks = ref<Task[]>([]);
const children = ref<Child[]>([]);
const tab = ref<'active' | 'expired' | 'completed'>('active');
const loading = ref(true);
const editorOpen = ref(false);
const editingTask = ref<Task | null>(null);
const deleteTarget = ref<Task | null>(null);

async function load() {
  loading.value = true;
  try {
    const [taskRes, childRes] = await Promise.all([
      api.get<{ tasks: Task[] }>(`/adhoc-tasks?status=${tab.value}`),
      api.get<{ children: Child[] }>('/children'),
    ]);
    tasks.value = taskRes.tasks;
    children.value = childRes.children;
  } finally {
    loading.value = false;
    window.dispatchEvent(new Event('review:updated'));
  }
}

function openEditor(task?: Task) {
  editingTask.value = task ?? null;
  editorOpen.value = true;
}

async function onSaved() {
  editorOpen.value = false;
  await load();
}

async function remove(task: Task) {
  try {
    await api.delete(`/adhoc-tasks/${task.id}`);
    toast.success('已删除');
    await load();
  } catch (e: any) {
    toast.error(e.message || '删除失败');
  }
}

function fmtDeadline(ts: number | null): string {
  if (!ts) return '无截止';
  const d = new Date(ts * 1000);
  const now = Date.now();
  const diff = ts * 1000 - now;
  if (diff < 0) {
    return `已超时 ${Math.abs(Math.floor(diff / 3600000))}小时`;
  }
  if (diff < 86400000) {
    return `今日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function statusText(t: Task): string {
  if (tab.value === 'completed') return '✅ 已完成';
  if (tab.value === 'expired') return '⏰ 已超时';
  if (t.completion_status === 'pending') return '⏳ 待审核';
  if (t.completion_status === 'rejected') return '❌ 被拒绝';
  return '🟢 进行中';
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="title">任务发布</h1>
        <p class="subtitle">发布任务给小朋友完成</p>
      </div>
      <button class="btn btn-primary" @click="openEditor()">＋ 发布</button>
    </header>

    <div class="tabs">
      <button :class="{ active: tab === 'active' }" @click="tab = 'active'; load()">进行中</button>
      <button :class="{ active: tab === 'expired' }" @click="tab = 'expired'; load()">已超时</button>
      <button :class="{ active: tab === 'completed' }" @click="tab = 'completed'; load()">已完成</button>
    </div>

    <EmptyState
      v-if="!loading && tasks.length === 0"
      :emoji="tab === 'active' ? '📝' : tab === 'expired' ? '⏰' : '✅'"
      :text="tab === 'active' ? '没有进行中的任务' : tab === 'expired' ? '没有超时任务' : '还没有完成的任务'"
      :hint="tab === 'active' ? '点击右上角发布新任务' : ''"
    />

    <div v-else class="task-list">
      <GlassCard v-for="t in tasks" :key="t.id" padding="16px 18px" class="task-card">
        <div class="task-head">
          <div class="user-info">
            <ZodiacAvatar :zodiac="t.user_avatar" :size="40" />
            <span class="user-name">{{ t.user_name }}</span>
          </div>
          <span class="status-badge" :class="tab === 'expired' ? 'expired' : tab === 'completed' ? 'completed' : t.completion_status ?? 'active'">
            {{ statusText(t) }}
          </span>
          <div class="points-tag">+{{ t.points }} 🌟</div>
        </div>

        <h3 class="task-name">{{ t.name }}</h3>
        <p v-if="t.description" class="task-desc">{{ t.description }}</p>

        <div class="task-meta">
          <span class="meta-item">📅 {{ fmtDeadline(t.deadline) }}</span>
        </div>

        <div v-if="t.completion_status === 'rejected'" class="rejected-box">
          <span>📝 上次未通过，小朋友可重新提交</span>
        </div>

        <div class="actions">
          <button v-if="tab !== 'completed'" class="btn btn-ghost small" @click="openEditor(t)">编辑</button>
          <button v-if="tab !== 'completed'" class="btn btn-ghost small danger" @click="deleteTarget = t">删除</button>
          <span v-else class="done-text">🎉 已于 {{ fmtDeadline(t.completed_at) }} 完成</span>
        </div>
      </GlassCard>
    </div>

    <AdhocTaskEditor
      v-if="editorOpen"
      v-model="editorOpen"
      :task="editingTask"
      :children="children"
      @saved="onSaved"
    />

    <ConfirmDialog
      :model-value="deleteTarget !== null"
      title="删除任务"
      :message="deleteTarget ? `确定删除任务「${deleteTarget.name}」？删除后不可恢复哦` : ''"
      confirm-text="确定"
      cancel-text="取消"
      variant="danger"
      @update:model-value="!$event && (deleteTarget = null)"
      @confirm="deleteTarget && remove(deleteTarget)"
    />
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 16px;
  gap: 12px;
}
.title { font-size: 26px; margin-bottom: 2px; }
.subtitle { color: var(--text-secondary); font-size: 13px; }

.tabs {
  display: flex;
  background: var(--glass-bg);
  border-radius: var(--r-md);
  padding: 4px;
  gap: 4px;
  margin-bottom: 16px;
}
.tabs button {
  flex: 1;
  padding: 10px;
  border-radius: var(--r-sm);
  color: var(--text-secondary);
  font-weight: 600;
  transition: all 0.2s;
}
.tabs button.active {
  background: var(--glass-bg-strong);
  color: var(--text-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.task-list { display: flex; flex-direction: column; gap: 12px; }
.task-card { transition: transform 0.15s; }

.task-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.user-name {
  font-family: var(--font-cute);
  font-size: 14px;
}
.status-badge {
  padding: 3px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(126, 212, 185, 0.2);
  color: var(--accent-mint);
}
.status-badge.expired { background: rgba(255, 122, 122, 0.2); color: var(--accent-red); }
.status-badge.completed { background: rgba(126, 212, 185, 0.3); color: var(--accent-mint); }
.status-badge.pending { background: rgba(255, 209, 102, 0.2); color: var(--accent-yellow); }
.status-badge.rejected { background: rgba(255, 122, 122, 0.2); color: var(--accent-red); }
.points-tag {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 14px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(255, 209, 102, 0.28), rgba(255, 209, 102, 0.12));
  border: 1px solid rgba(255, 209, 102, 0.45);
  box-shadow: 0 2px 8px rgba(255, 209, 102, 0.15);
  font-family: var(--font-cute);
  color: var(--accent-yellow);
  font-size: 17px;
  white-space: nowrap;
}

.task-name {
  font-size: 18px;
  margin-bottom: 4px;
  font-family: var(--font-cute);
}
.task-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  line-height: 1.5;
}
.task-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.rejected-box {
  font-size: 12px;
  color: var(--accent-red);
  background: rgba(255, 122, 122, 0.1);
  padding: 6px 10px;
  border-radius: var(--r-sm);
  margin-bottom: 8px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.small {
  padding: 6px 14px;
  font-size: 13px;
}
.danger:hover {
  color: var(--accent-red);
}
.done-text {
  font-size: 13px;
  color: var(--accent-mint);
  font-family: var(--font-cute);
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: stretch; }
}
</style>
