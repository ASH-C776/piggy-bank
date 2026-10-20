<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';
import GlassCard from '@/components/GlassCard.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import EmptyState from '@/components/EmptyState.vue';
import AccountManagerModal from '@/components/AccountManagerModal.vue';
import Modal from '@/components/Modal.vue';
import type { BackupStatus } from '@/api/backup';
import { fmtRelativeTime } from '@/utils/time';

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

// 备份超期提醒：超过 3 天没备份就在总览页顶部挂一条不打扰的提示。
// 家庭用户不会主动点备份，今天数据差点找不回就是没人记得——需要系统提醒。
const backupStatus = ref<BackupStatus | null>(null);
const backupDismissed = ref(false);

const backupStale = computed(() => {
  if (backupDismissed.value) return false;
  const t = backupStatus.value?.lastBackupAt;
  if (!t) return true;
  return Date.now() - t > 3 * 24 * 60 * 60 * 1000;
});

const backupStaleText = computed(() => {
  const t = backupStatus.value?.lastBackupAt;
  if (!t) return '还没有创建过数据备份';
  const days = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
  return `已经 ${days} 天没有备份数据了`;
});

function openBackupModal() {
  window.dispatchEvent(new CustomEvent('backup:open'));
}

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

onMounted(async () => {
  load();
  // 备份状态单独拉：失败不影响总览本身（比如老版本服务端还没有这个接口）
  try {
    const res = await api.get<{ status: BackupStatus }>('/backups/status');
    backupStatus.value = res.status;
  } catch {
    /* ignore */
  }
});
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

    <!-- 备份超期提醒：温和、可关闭、不挡住主要内容 -->
    <div v-if="backupStale" class="backup-banner">
      <span class="bb-text">{{ backupStaleText }}</span>
      <button class="bb-btn" @click="openBackupModal">去备份</button>
      <button class="bb-close" aria-label="忽略提醒" @click="backupDismissed = true">✕</button>
    </div>

    <!-- 今日统计（点击整卡查看积分记录） -->
    <GlassCard v-if="data" class="today-summary" padding="16px 20px" hover clickable @click="goLogs">
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
            今日得分
            <strong class="today-points" :class="{ neg: c.today_points < 0 }">
              {{ c.today_points > 0 ? '+' : '' }}{{ c.today_points }}
            </strong>
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
            <div class="log-time">{{ fmtRelativeTime(log.created_at) }}</div>
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
  margin-bottom: var(--space-20);
  gap: var(--space-12);
}
.title { font-size: var(--fs-3xl); margin-bottom: var(--space-2); }
.subtitle { color: var(--text-secondary); font-size: var(--fs-sm); }

.today-summary {
  margin-bottom: var(--space-24);
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
  gap: var(--space-6);
}
.summary-item .label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.summary-item .value {
  font-size: var(--fs-2xl);
  font-family: var(--font-cute);
}
.gain { color: var(--text-on-mint); }
.loss { color: var(--text-on-pink); }
.divider {
  width: 1px;
  height: 32px;
  background: var(--glass-border);
}

.loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}
.skeleton-card {
  height: 88px;
  border-radius: var(--r-lg);
  background: var(--glass-bg);
  animation: pulse var(--dur-pulse) ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.8; }
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

.rank-card {
  display: flex;
  align-items: center;
  gap: var(--space-14);
}

.info { flex: 1; }
.name { font-size: var(--fs-lg); font-family: var(--font-cute); }
.meta { font-size: var(--fs-xs); color: var(--text-muted); margin-top: var(--space-2); }
.today-points {
  color: var(--text-on-mint);
  font-family: var(--font-cute);
  font-size: var(--fs-sm);
}
.today-points.neg {
  color: var(--text-on-pink);
}

.points {
  text-align: right;
}
.points .num {
  font-size: var(--fs-3xl);
  font-family: var(--font-cute);
  color: var(--text-on-yellow);
}
.points .unit {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-left: var(--space-2);
}

/* 积分记录弹窗 */
.logs-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  max-height: 60vh;
  overflow-y: auto;
  padding-right: var(--space-4);
}
.log-item {
  display: flex;
  align-items: center;
  gap: var(--space-14);
  padding: var(--space-12) var(--space-14);
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
}
.log-delta {
  font-size: var(--fs-xl);
  font-family: var(--font-cute);
  flex-shrink: 0;
  min-width: 72px;
  text-align: right;
}
.log-delta.gain { color: var(--text-on-mint); }
.log-delta.loss { color: var(--text-on-pink); }
.log-body {
  flex: 1;
  min-width: 0;
}
.log-note {
  font-size: var(--fs-sm);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.log-source {
  margin-right: var(--space-4);
  opacity: 0.8;
}
.log-time {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-top: var(--space-2);
}
.logs-loading, .logs-empty {
  padding: var(--space-32) 0;
  text-align: center;
  color: var(--text-muted);
}

/* 备份超期提醒条：琥珀色系（与 --warning 同源），可关闭 */
.backup-banner {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  padding: var(--space-10) var(--space-16);
  border-radius: var(--r-md);
  background: rgba(255, 209, 102, 0.16);
  border: 1px solid rgba(255, 209, 102, 0.45);
  font-size: var(--fs-sm);
  color: #633806;
}
.bb-text {
  flex: 1;
  min-width: 0;
}
.bb-btn {
  padding: var(--space-6) var(--space-16);
  border-radius: var(--r-sm);
  background: var(--accent-yellow);
  color: #633806;
  font-size: var(--fs-xs);
  font-weight: 500;
  white-space: nowrap;
  transition: filter var(--dur-fast);
}
.bb-btn:hover {
  filter: brightness(1.05);
}
.bb-close {
  width: 28px;
  height: 28px;
  border-radius: var(--r-full);
  background: rgba(99, 56, 6, 0.08);
  color: #633806;
  font-size: var(--fs-xs);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.bb-close:hover {
  background: rgba(99, 56, 6, 0.16);
}
</style>
