<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import { useWsStore } from '@/stores/ws';
import GlassCard from '@/components/GlassCard.vue';
import EmptyState from '@/components/EmptyState.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import RejectModal from '@/components/RejectModal.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';

const toast = useToastStore();
const ws = useWsStore();

interface Request {
  id: number;
  user_id: number;
  user_name: string;
  user_avatar: string;
  type: 'product' | 'cash';
  product_id: number | null;
  product_name: string | null;
  product_icon: string | null;
  points: number;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  created_at: number;
  reviewed_at: number | null;
}

interface TaskCompletion {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  user_avatar: string;
  task_name: string;
  task_points: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  created_at: number;
  reviewed_at: number | null;
}

// 顶部大 tab：兑换 / 任务
const mainTab = ref<'exchange' | 'task'>('exchange');

const requests = ref<Request[]>([]);
const completions = ref<TaskCompletion[]>([]);
const loading = ref(true);
const tab = ref<'pending' | 'approved' | 'rejected'>('pending');
const rejecting = ref<Request | null>(null);
const rejectOpen = ref(false);
const processing = ref<number | null>(null);

// 任务审核拒绝
const taskRejecting = ref<TaskCompletion | null>(null);
const taskRejectOpen = ref(false);
const taskRejectReason = ref('');

// 通过操作的确认弹窗
const confirmOpen = ref(false);
const confirmMessage = ref('');
const confirmAction = ref<(() => Promise<void>) | null>(null);

async function load() {
  loading.value = true;
  try {
    if (mainTab.value === 'exchange') {
      const res = await api.get<{ requests: Request[] }>(`/exchange-requests?status=${tab.value}`);
      requests.value = res.requests;
    } else {
      const res = await api.get<{ completions: TaskCompletion[] }>(`/adhoc-tasks/completions?status=${tab.value}`);
      completions.value = res.completions;
    }
  } finally {
    loading.value = false;
    // 通知 Layout 刷新审核数字小标
    window.dispatchEvent(new Event('review:updated'));
  }
}

function switchMainTab(t: 'exchange' | 'task') {
  mainTab.value = t;
  tab.value = 'pending';
  load();
}

function switchStatus(t: 'pending' | 'approved' | 'rejected') {
  tab.value = t;
  load();
}

// 兑换通过
function approve(r: Request) {
  confirmMessage.value = `通过${r.user_name}的兑换申请？将扣除 ${r.points} 积分`;
  confirmAction.value = async () => {
    processing.value = r.id;
    try {
      const res = await api.post<{ ok: boolean; newBalance: number }>(`/exchange-requests/${r.id}/approve`, {});
      toast.success(`已通过，${r.user_name} 剩余 ${res.newBalance} 分`);
      ws.decPending();
      await load();
    } catch (e: any) {
      const err = e.payload?.error;
      if (err === 'already_reviewed') toast.warning('该申请已处理过');
      else if (err === 'insufficient_points') toast.error(`${r.user_name} 积分不足`);
      else toast.error(e.message);
    } finally { processing.value = null; }
  };
  confirmOpen.value = true;
}

// 任务完成通过
function approveTask(c: TaskCompletion) {
  confirmMessage.value = `通过${c.user_name}的「${c.task_name}」完成申请？将加 ${c.task_points} 积分`;
  confirmAction.value = async () => {
    processing.value = c.id;
    try {
      const res = await api.post<{ ok: boolean; newBalance: number }>(`/adhoc-tasks/completions/${c.id}/approve`, {});
      toast.success(`已通过，${c.user_name} 当前 ${res.newBalance} 分`);
      await load();
    } catch (e: any) {
      const err = e.payload?.error;
      if (err === 'already_reviewed') toast.warning('该申请已处理过');
      else toast.error(e.message);
    } finally { processing.value = null; }
  };
  confirmOpen.value = true;
}

async function runConfirm() {
  if (confirmAction.value) await confirmAction.value();
  confirmAction.value = null;
}

function openReject(r: Request) {
  rejecting.value = r;
  rejectOpen.value = true;
}

function openTaskReject(c: TaskCompletion) {
  taskRejecting.value = c;
  taskRejectReason.value = '';
  taskRejectOpen.value = true;
}

async function submitTaskReject() {
  if (!taskRejecting.value) return;
  const c = taskRejecting.value;
  processing.value = c.id;
  try {
    await api.post(`/adhoc-tasks/completions/${c.id}/reject`, { reason: taskRejectReason.value });
    toast.success(`已拒绝${c.user_name}的完成申请`);
    taskRejectOpen.value = false;
    await load();
  } catch (e: any) {
    const err = e.payload?.error;
    if (err === 'already_reviewed') toast.warning('该申请已处理过');
    else toast.error(e.message);
  } finally { processing.value = null; }
}

async function onRejected() {
  rejectOpen.value = false;
  await load();
}

function fmtTime(ts: number) {
  const d = new Date(ts * 1000);
  const now = Date.now();
  const diff = now - ts * 1000;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// 收到新兑换申请推送时，若当前在待审核 tab 则自动刷新
function onNewRequest() {
  if (mainTab.value === 'exchange' && tab.value === 'pending') load();
}

// 收到任务完成申请推送
function onTaskSubmitted() {
  if (mainTab.value === 'task' && tab.value === 'pending') load();
  else toast.info('有新的任务完成申请待审核');
}

onMounted(() => {
  load();
  window.addEventListener('ws:new_exchange_request', onNewRequest);
  window.addEventListener('ws:task_completion_submitted', onTaskSubmitted);
});

onUnmounted(() => {
  window.removeEventListener('ws:new_exchange_request', onNewRequest);
  window.removeEventListener('ws:task_completion_submitted', onTaskSubmitted);
});
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h1 class="title">审核中心</h1>
      <p class="subtitle">处理小朋友的兑换申请和任务完成申请</p>
    </header>

    <!-- 顶部大 tab：兑换 / 任务 -->
    <div class="main-tabs">
      <button :class="{ active: mainTab === 'exchange' }" @click="switchMainTab('exchange')">
        🎁 兑换审核
        <span v-if="mainTab === 'exchange' && tab === 'pending' && requests.length" class="badge">{{ requests.length }}</span>
      </button>
      <button :class="{ active: mainTab === 'task' }" @click="switchMainTab('task')">
        📋 任务审核
        <span v-if="mainTab === 'task' && tab === 'pending' && completions.length" class="badge">{{ completions.length }}</span>
      </button>
    </div>

    <!-- 状态子 tab -->
    <div class="tabs">
      <button :class="{ active: tab === 'pending' }" @click="switchStatus('pending')">
        待审核
        <span v-if="mainTab === 'exchange' && tab === 'pending' && requests.length" class="badge-num">{{ requests.length }}</span>
        <span v-else-if="mainTab === 'task' && tab === 'pending' && completions.length" class="badge-num">{{ completions.length }}</span>
      </button>
      <button :class="{ active: tab === 'approved' }" @click="switchStatus('approved')">已通过</button>
      <button :class="{ active: tab === 'rejected' }" @click="switchStatus('rejected')">已拒绝</button>
    </div>

    <!-- 兑换审核列表 -->
    <template v-if="mainTab === 'exchange'">
      <EmptyState
        v-if="!loading && requests.length === 0"
        :emoji="tab === 'pending' ? '📭' : tab === 'approved' ? '✅' : '❌'"
        :text="tab === 'pending' ? '没有待审核申请' : tab === 'approved' ? '还没有通过记录' : '还没有拒绝记录'"
      />

      <div v-else class="list">
        <GlassCard v-for="r in requests" :key="r.id" padding="14px 18px" class="card">
          <div class="head">
            <div class="user">
              <ZodiacAvatar :zodiac="r.user_avatar" :size="48" />
              <div>
                <div class="user-name">{{ r.user_name }}</div>
                <div class="time">{{ fmtTime(r.created_at) }}</div>
              </div>
            </div>
            <div class="type-tag" :class="r.type">
              <span v-if="r.type === 'product'">🎁 商品兑换</span>
              <span v-else>💵 现金兑换</span>
            </div>
          </div>

          <div class="detail">
            <div class="item">
              <span class="label" v-if="r.type === 'product'">商品</span>
              <span class="label" v-else>兑换金额</span>
              <span class="value product" v-if="r.type === 'product'">
                <CategoryIcon :icon="r.product_icon" :size="24" />
                {{ r.product_name || '已删除' }}
              </span>
              <span class="value cash" v-else>{{ r.amount }} 元</span>
            </div>
            <div class="item">
              <span class="label">消耗积分</span>
              <span class="value points">-{{ r.points }} 分</span>
            </div>
          </div>

          <div v-if="r.status === 'rejected' && r.reason" class="reason">
            <span class="emoji">📝</span>
            <span>拒绝原因：{{ r.reason }}</span>
          </div>

          <div v-if="r.status === 'approved' && r.reviewed_at" class="reason ok">
            <span class="emoji">✅</span>
            <span>已于 {{ fmtTime(r.reviewed_at) }} 通过</span>
          </div>

          <div v-if="r.status === 'pending'" class="actions">
            <button class="btn btn-success small" @click="approve(r)" :disabled="processing === r.id">
              {{ processing === r.id ? '处理中...' : '✅ 通过' }}
            </button>
            <button class="btn btn-danger small" @click="openReject(r)">❌ 拒绝</button>
          </div>
        </GlassCard>
      </div>
    </template>

    <!-- 任务审核列表 -->
    <template v-else>
      <EmptyState
        v-if="!loading && completions.length === 0"
        :emoji="tab === 'pending' ? '📭' : tab === 'approved' ? '✅' : '❌'"
        :text="tab === 'pending' ? '没有待审核任务' : tab === 'approved' ? '还没有通过记录' : '还没有拒绝记录'"
      />

      <div v-else class="list">
        <GlassCard v-for="c in completions" :key="c.id" padding="14px 18px" class="card">
          <div class="head">
            <div class="user">
              <ZodiacAvatar :zodiac="c.user_avatar" :size="48" />
              <div>
                <div class="user-name">{{ c.user_name }}</div>
                <div class="time">{{ fmtTime(c.created_at) }}</div>
              </div>
            </div>
            <div class="type-tag task">
              <span>📋 任务完成</span>
            </div>
          </div>

          <div class="detail">
            <div class="item">
              <span class="label">任务</span>
              <span class="value">{{ c.task_name }}</span>
            </div>
            <div class="item">
              <span class="label">奖励积分</span>
              <span class="value gain">+{{ c.task_points }} 🌟</span>
            </div>
          </div>

          <div v-if="c.status === 'rejected' && c.reason" class="reason">
            <span class="emoji">📝</span>
            <span>拒绝原因：{{ c.reason }}</span>
          </div>

          <div v-if="c.status === 'approved' && c.reviewed_at" class="reason ok">
            <span class="emoji">✅</span>
            <span>已于 {{ fmtTime(c.reviewed_at) }} 通过</span>
          </div>

          <div v-if="c.status === 'pending'" class="actions">
            <button class="btn btn-success small" @click="approveTask(c)" :disabled="processing === c.id">
              {{ processing === c.id ? '处理中...' : '✅ 通过' }}
            </button>
            <button class="btn btn-danger small" @click="openTaskReject(c)">❌ 拒绝</button>
          </div>
        </GlassCard>
      </div>
    </template>

    <RejectModal v-if="rejecting" :model-value="rejectOpen" :request="rejecting" @update:model-value="rejectOpen = $event" @done="onRejected" />

    <!-- 任务拒绝弹窗 -->
    <ConfirmDialog
      v-if="taskRejectOpen"
      v-model="taskRejectOpen"
      title="拒绝任务完成"
      :message="taskRejecting ? `拒绝${taskRejecting.user_name}的「${taskRejecting.task_name}」完成申请？` : ''"
      confirmText="拒绝"
      @confirm="submitTaskReject"
    />

    <ConfirmDialog
      v-model="confirmOpen"
      title="确认通过"
      :message="confirmMessage"
      confirmText="通过"
      @confirm="runConfirm"
    />
  </div>
</template>

<style scoped>
.page-header { margin-bottom: 16px; }
.title { font-size: 26px; margin-bottom: 2px; }
.subtitle { color: var(--text-secondary); font-size: 13px; }

.main-tabs {
  display: flex;
  background: var(--glass-bg-strong);
  border-radius: var(--r-md);
  padding: 4px;
  gap: 4px;
  margin-bottom: 8px;
  position: relative;
}
.main-tabs button {
  flex: 1;
  padding: 12px;
  border-radius: var(--r-sm);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 15px;
  transition: all 0.2s;
  position: relative;
}
.main-tabs button.active {
  background: var(--glass-bg-strong);
  color: var(--text-primary);
  box-shadow: 0 4px 12px rgba(255, 140, 170, 0.25);
}

.tabs {
  display: flex;
  background: var(--glass-bg);
  border-radius: var(--r-md);
  padding: 4px;
  gap: 4px;
  margin-bottom: 16px;
  position: relative;
}
.tabs button {
  flex: 1;
  padding: 10px;
  border-radius: var(--r-sm);
  color: var(--text-secondary);
  font-weight: 600;
  transition: all 0.2s;
  position: relative;
}
.tabs button.active {
  background: var(--glass-bg-strong);
  color: var(--text-primary);
  box-shadow: 0 4px 12px rgba(255, 140, 170, 0.15);
}
.badge {
  display: inline-block;
  margin-left: 4px;
  background: var(--accent-red);
  color: white;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
}
.badge-num {
  display: inline-block;
  margin-left: 4px;
  background: var(--accent-red);
  color: white;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
}

.list { display: flex; flex-direction: column; gap: 12px; }

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.user { display: flex; align-items: center; gap: 10px; }
.user-name { font-family: var(--font-cute); font-size: 16px; }
.time { font-size: 11px; color: var(--text-muted); }
.type-tag {
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
}
.type-tag.product { background: rgba(132, 197, 255, 0.2); color: #84c5ff; }
.type-tag.cash { background: rgba(255, 209, 102, 0.2); color: var(--accent-yellow); }
.type-tag.task { background: rgba(126, 212, 185, 0.2); color: var(--success); }

.detail {
  display: flex;
  gap: 24px;
  padding: 10px 0;
  border-top: 1px solid var(--glass-border);
  border-bottom: 1px solid var(--glass-border);
  margin-bottom: 12px;
}
.item { display: flex; flex-direction: column; gap: 4px; }
.label { font-size: 11px; color: var(--text-muted); }
.value { font-family: var(--font-cute); font-size: 16px; }
.value.product { display: inline-flex; align-items: center; gap: 8px; }
.value.cash { color: var(--accent-yellow); }
.value.points { color: var(--danger); }
.value.gain { color: var(--success); }

.reason, .reason.ok {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 8px 12px;
  background: rgba(255, 122, 122, 0.1);
  border-radius: var(--r-sm);
  color: var(--danger);
  margin-bottom: 12px;
}
.reason.ok {
  background: rgba(126, 212, 185, 0.1);
  color: var(--success);
}

.actions { display: flex; gap: 8px; }
.small { padding: 6px 14px; font-size: 13px; }
</style>
