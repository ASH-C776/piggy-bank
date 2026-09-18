<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import GlassCard from '@/components/GlassCard.vue';
import EmptyState from '@/components/EmptyState.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

const toast = useToastStore();

interface Task {
  id: number;
  name: string;
  description: string | null;
  points: number;
  deadline: number | null;
  status: string;
  created_at: number;
  completion_status: 'pending' | 'approved' | 'rejected' | null;
  completion_reason: string | null;
  display_status: 'active' | 'pending' | 'expired' | 'completed';
}

const tasks = ref<Task[]>([]);
const loading = ref(true);
const processing = ref<number | null>(null);

// 确认弹窗
const confirmOpen = ref(false);
const confirmMessage = ref('');
const confirmAction = ref<(() => Promise<void>) | null>(null);

// 拒绝弹窗
const rejectOpen = ref(false);

async function load() {
  loading.value = true;
  try {
    const res = await api.get<{ tasks: Task[] }>('/adhoc-tasks/mine');
    tasks.value = res.tasks;
  } finally { loading.value = false; }
}

function submitCompletion(t: Task) {
  confirmMessage.value = `提交「${t.name}」完成申请？`;
  confirmAction.value = async () => {
    processing.value = t.id;
    try {
      await api.post(`/adhoc-tasks/${t.id}/submit-completion`);
      toast.success('已提交完成申请，等爸爸妈妈审核~');
      await load();
    } catch (e: any) {
      const err = e.payload?.error;
      if (err === 'already_pending') toast.warning('已经提交过了，请耐心等待');
      else if (err === 'already_approved') toast.warning('这个任务已完成');
      else toast.error(e.message);
    } finally { processing.value = null; }
  };
  confirmOpen.value = true;
}

async function runConfirm() {
  if (confirmAction.value) await confirmAction.value();
  confirmAction.value = null;
}

function fmtDeadline(ts: number | null): string {
  if (!ts) return '无截止';
  const d = new Date(ts * 1000);
  const now = Date.now();
  const diff = ts * 1000 - now;
  if (diff < 0) return `已超时 ${Math.abs(Math.floor(diff / 3600000))}小时`;
  if (diff < 86400000) return `今日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function onWsEvent() { load(); }
onMounted(() => {
  load();
  window.addEventListener('ws:task_review', onWsEvent);
});
onUnmounted(() => {
  window.removeEventListener('ws:task_review', onWsEvent);
});
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h1 class="title">我的任务</h1>
      <p class="subtitle">完成任务可以赚积分哦~</p>
    </header>

    <EmptyState
      v-if="!loading && tasks.length === 0"
      emoji="🎉"
      text="暂无任务"
      hint="爸爸妈妈发布任务后这里会显示哦~"
    />

    <div v-else class="task-list">
      <GlassCard v-for="t in tasks" :key="t.id" padding="18px 20px" class="task-card">
        <div class="head">
          <span v-if="t.display_status === 'expired'" class="status expired">⏰ 已超时</span>
          <span v-else-if="t.completion_status === 'pending'" class="status review">⏳ 待审核</span>
          <span v-else-if="t.completion_status === 'approved'" class="status completed">✅ 已完成</span>
          <span v-else class="status active">🟢 进行中</span>
          <div class="reward">+{{ t.points }} 🌟</div>
        </div>
        <h3 class="name">{{ t.name }}</h3>
        <p v-if="t.description" class="desc">{{ t.description }}</p>
        <div class="meta">
          <span>📅 {{ fmtDeadline(t.deadline) }}</span>
        </div>

        <!-- 拒绝原因 -->
        <div v-if="t.completion_status === 'rejected'" class="rejected-box">
          <span class="emoji">📝</span>
          <span>上次未通过：{{ t.completion_reason || '原因未说明' }}</span>
        </div>

        <!-- 操作区 -->
        <div class="actions">
          <!-- 待审核 -->
          <div v-if="t.completion_status === 'pending'" class="hint">
            <span class="emoji">💡</span>
            <span>已提交完成申请，等待爸爸妈妈审核~</span>
          </div>
          <!-- 已完成 -->
          <div v-else-if="t.completion_status === 'approved'" class="hint done">
            <span class="emoji">🎉</span>
            <span>任务完成！已获得 {{ t.points }} 积分</span>
          </div>
          <!-- 可提交完成（进行中或被拒绝） -->
          <button
            v-else
            class="btn btn-success big"
            :disabled="processing === t.id"
            @click="submitCompletion(t)"
          >
            {{ processing === t.id ? '提交中...' : '📤 提交完成' }}
          </button>
        </div>
      </GlassCard>
    </div>

    <ConfirmDialog
      v-model="confirmOpen"
      message=""
      :custom-message="confirmMessage"
      confirm-text="确认提交"
      @confirm="runConfirm"
    />
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: var(--space-16);
}
.title { font-size: var(--fs-3xl); margin-bottom: var(--space-2); }
.subtitle { color: var(--text-secondary); font-size: var(--fs-sm); }

.task-list { display: flex; flex-direction: column; gap: var(--space-12); }

.task-card {
  transition: transform var(--dur-fast);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-8);
}
.status {
  padding: var(--space-4) var(--space-10);
  border-radius: var(--r-xs);
  font-size: var(--fs-xs);
  font-weight: 600;
}
.status.active { background: rgba(126, 212, 185, 0.2); color: var(--text-on-mint); }
.status.review { background: rgba(255, 209, 102, 0.2); color: var(--text-on-yellow); }
.status.completed { background: rgba(126, 212, 185, 0.3); color: var(--text-on-mint); }
.status.expired { background: rgba(255, 122, 122, 0.2); color: var(--text-on-red); }

.reward {
  font-family: var(--font-cute);
  color: var(--text-on-yellow);
  font-size: var(--fs-2xl);
}

.name {
  font-size: var(--fs-lg);
  margin-bottom: var(--space-4);
  font-family: var(--font-cute);
}
.desc {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-8);
  line-height: 1.5;
}
.meta {
  display: flex;
  gap: var(--space-16);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-12);
}

.rejected-box {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  font-size: var(--fs-xs);
  color: var(--text-on-red);
  background: rgba(255, 122, 122, 0.1);
  padding: var(--space-8) var(--space-12);
  border-radius: var(--r-sm);
  margin-bottom: var(--space-12);
}

.actions {
  display: flex;
  gap: var(--space-8);
}
.big {
  flex: 1;
  padding: var(--space-12);
  font-size: var(--fs-md);
  font-family: var(--font-cute);
}
.hint {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-12);
  background: var(--glass-bg);
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}
.hint.done {
  color: var(--text-on-mint);
  background: rgba(126, 212, 185, 0.1);
}
.hint .emoji { font-size: var(--fs-lg); }
</style>
