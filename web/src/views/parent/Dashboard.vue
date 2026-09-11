<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';
import GlassCard from '@/components/GlassCard.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import EmptyState from '@/components/EmptyState.vue';
import AccountManagerModal from '@/components/AccountManagerModal.vue';
import Modal from '@/components/Modal.vue';

const router = useRouter();

interface ChildCard {
  id: number;
  name: string;
  avatar: string;
  total_points: number;
  today_points: number;
}

interface Dashboard {
  children: ChildCard[];
  todaySummary: { gain: number; loss: number; count: number };
}

interface Log {
  id: number;
  delta: number;
  note: string;
  source: string;
  creator_name: string | null;
  created_at: number;
}

const data = ref<Dashboard | null>(null);
const loading = ref(true);
const accountOpen = ref(false);

// 积分记录弹窗
const logsOpen = ref(false);
const logsChild = ref<ChildCard | null>(null);
const logs = ref<Log[]>([]);
const logsLoading = ref(false);

const sortedChildren = computed(() => {
  const list = data.value?.children ?? [];
  return [...list].sort((a, b) => b.total_points - a.total_points);
});

const sourceLabels: Record<string, string> = {
  daily: '⭐ 日常',
  adhoc: '📋 任务',
  exchange: '🎁 兑换',
  adjust: '✏️ 调整',
};

async function load() {
  loading.value = true;
  try {
    data.value = await api.get<Dashboard>('/dashboard');
  } finally {
    loading.value = false;
  }
}

// 点击今日统计卡片 → 积分记录页
function goLogs() {
  router.push('/parent/logs');
}

async function openLogs(c: ChildCard) {
  logsChild.value = c;
  logsOpen.value = true;
  logsLoading.value = true;
  try {
    const res = await api.get<{ logs: Log[] }>(`/point-logs?userId=${c.id}&limit=30`);
    logs.value = res.logs;
  } finally {
    logsLoading.value = false;
  }
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (d.toDateString() === now.toDateString()) {
    return `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="title">总览</h1>
        <p class="subtitle">家庭积分排行</p>
      </div>
      <button class="btn btn-primary" @click="accountOpen = true">
        账号管理
      </button>
    </header>

    <!-- 今日统计（点击整卡查看积分记录） -->
    <GlassCard v-if="data" class="today-summary" padding="16px 20px" hover @click="goLogs">
      <div class="summary-grid">
        <div class="summary-item">
          <span class="label">今日加分</span>
          <span class="value gain">+{{ data.todaySummary.gain }}</span>
        </div>
        <div class="divider"></div>
        <div class="summary-item">
          <span class="label">今日扣分</span>
          <span class="value loss">{{ data.todaySummary.loss }}</span>
        </div>
        <div class="divider"></div>
        <div class="summary-item">
          <span class="label">今日操作</span>
          <span class="value">{{ data.todaySummary.count }} 次</span>
        </div>
      </div>
    </GlassCard>

    <!-- 排行榜 -->
    <div v-if="loading" class="loading">
      <div v-for="i in 3" :key="i" class="skeleton-card"></div>
    </div>

    <EmptyState
      v-else-if="sortedChildren.length === 0"
      emoji="🐣"
      text="还没有小朋友呢"
      hint="点击右上角新增一个吧~"
    />

    <div v-else class="rank-list">
      <GlassCard
        v-for="c in sortedChildren"
        :key="c.id"
        hover
        padding="18px 20px"
        class="rank-card"
        @click="openLogs(c)"
      >
        <ZodiacAvatar :zodiac="c.avatar" :size="72" show-ring />
        <div class="info">
          <div class="name">{{ c.name }}</div>
          <div class="meta">
            今日得分 <strong class="today-points">+{{ c.today_points }}</strong>
          </div>
        </div>
        <div class="points">
          <span class="num">{{ c.total_points }}</span>
          <span class="unit">分</span>
        </div>
      </GlassCard>
    </div>

    <AccountManagerModal
      v-model="accountOpen"
      @changed="load"
    />

    <!-- 积分记录弹窗 -->
    <Modal
      v-model="logsOpen"
      :title="logsChild ? `${logsChild.name} 的积分记录` : '积分记录'"
      width="480px"
    >
      <div v-if="logsLoading" class="logs-loading">加载中...</div>
      <div v-else-if="logs.length === 0" class="logs-empty">暂无积分记录</div>
      <div v-else class="logs-list">
        <div v-for="log in logs" :key="log.id" class="log-item">
          <div :class="['log-delta', log.delta > 0 ? 'gain' : 'loss']">
            {{ log.delta > 0 ? '+' : '' }}{{ log.delta }} 🌟
          </div>
          <div class="log-body">
            <div class="log-note">
              <span class="log-source">{{ sourceLabels[log.source] || log.source }}</span>
              <span v-if="log.note">· {{ log.note }}</span>
            </div>
            <div class="log-time">{{ fmtTime(log.created_at) }}</div>
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
  gap: 12px;
}
.title { font-size: 26px; margin-bottom: 2px; }
.subtitle { color: var(--text-secondary); font-size: 13px; }

.today-summary {
  margin-bottom: 24px;
}
.summary-grid {
  display: flex;
  align-items: center;
  justify-content: space-around;
}
.summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.summary-item .label {
  font-size: 12px;
  color: var(--text-muted);
}
.summary-item .value {
  font-size: 22px;
  font-family: var(--font-cute);
}
.gain { color: var(--accent-mint); }
.loss { color: var(--accent-pink); }
.divider {
  width: 1px;
  height: 32px;
  background: var(--glass-border);
}

.loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skeleton-card {
  height: 88px;
  border-radius: var(--r-lg);
  background: var(--glass-bg);
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.8; }
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rank-card {
  display: flex;
  align-items: center;
  gap: 14px;
}

.info { flex: 1; }
.name { font-size: 17px; font-family: var(--font-cute); }
.meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.today-points {
  color: var(--accent-mint);
  font-family: var(--font-cute);
  font-size: 14px;
}

.points {
  text-align: right;
}
.points .num {
  font-size: 26px;
  font-family: var(--font-cute);
  color: var(--accent-yellow);
}
.points .unit {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 2px;
}

/* 积分记录弹窗 */
.logs-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;
}
.log-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
}
.log-delta {
  font-size: 20px;
  font-family: var(--font-cute);
  flex-shrink: 0;
  min-width: 72px;
  text-align: right;
}
.log-delta.gain { color: var(--accent-mint); }
.log-delta.loss { color: var(--accent-pink); }
.log-body {
  flex: 1;
  min-width: 0;
}
.log-note {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.log-source {
  margin-right: 4px;
  opacity: 0.8;
}
.log-time {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}
.logs-loading, .logs-empty {
  padding: 30px 0;
  text-align: center;
  color: var(--text-muted);
}
</style>
