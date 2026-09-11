<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import GlassCard from '@/components/GlassCard.vue';
import EmptyState from '@/components/EmptyState.vue';

interface Log {
  id: number;
  user_id: number;
  user_name: string;
  delta: number;
  source: string;
  note: string;
  creator_name: string | null;
  created_at: number;
}

const logs = ref<Log[]>([]);
const loading = ref(true);
const filterUserId = ref<number | null>(null);
const children = ref<Array<{ id: number; name: string; avatar: string }>>([]);

async function load() {
  loading.value = true;
  try {
    const query = filterUserId.value ? `?userId=${filterUserId.value}` : '';
    const res = await api.get<{ logs: Log[] }>(`/point-logs${query}`);
    logs.value = res.logs;
  } finally {
    loading.value = false;
  }
}

async function loadChildren() {
  const res = await api.get<{ children: Array<{ id: number; name: string; avatar: string }> }>('/children');
  children.value = res.children;
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
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

const sourceLabels: Record<string, string> = {
  daily: '日常',
  adhoc: '临时任务',
  exchange: '兑换',
  adjust: '临时',
};

onMounted(async () => {
  await loadChildren();
  await load();
});
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h1 class="title">积分流水</h1>
    </header>

    <div class="filters">
      <button :class="{ active: filterUserId === null }" @click="filterUserId = null; load()">
        全部
      </button>
      <button
        v-for="c in children"
        :key="c.id"
        :class="{ active: filterUserId === c.id }"
        @click="filterUserId = c.id; load()"
      >
        {{ c.name }}
      </button>
    </div>

    <EmptyState v-if="!loading && logs.length === 0" emoji="📜" text="还没有积分记录哦" />

    <div v-else class="logs">
      <GlassCard v-for="log in logs" :key="log.id" padding="14px 16px" class="log-item">
        <div :class="['delta', log.delta > 0 ? 'gain' : 'loss']">
          {{ log.delta > 0 ? '+' : '' }}{{ log.delta }}
        </div>
        <div class="content">
          <div class="row1">
            <strong>{{ log.user_name }}</strong>
            <span class="note">{{ log.note }}</span>
          </div>
          <div class="row2">
            <span class="tag">{{ sourceLabels[log.source] ?? log.source }}</span>
            <span v-if="log.creator_name" class="op">操作人：{{ log.creator_name }}</span>
            <span class="time">{{ fmtTime(log.created_at) }}</span>
          </div>
        </div>
      </GlassCard>
    </div>

    <button v-if="logs.length > 0" class="btn btn-ghost load-more" @click="load">
      刷新
    </button>
  </div>
</template>

<style scoped>
.page-header { margin-bottom: 16px; }
.title { font-size: 26px; }

.filters {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
}
.filters::-webkit-scrollbar { display: none; }
.filters button {
  padding: 6px 14px;
  border-radius: var(--r-sm);
  background: var(--glass-bg);
  color: var(--text-secondary);
  white-space: nowrap;
  font-size: 13px;
  transition: all 0.2s;
}
.filters button.active {
  background: var(--glass-bg-strong);
  color: var(--text-primary);
}

.logs { display: flex; flex-direction: column; gap: 8px; }

.log-item {
  display: flex;
  align-items: center;
  gap: 14px;
}
.delta {
  width: 60px;
  text-align: center;
  font-family: var(--font-cute);
  font-size: 22px;
  flex-shrink: 0;
}
.delta.gain { color: var(--accent-mint); }
.delta.loss { color: var(--accent-pink); }

.content { flex: 1; min-width: 0; }
.row1 { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.note { color: var(--text-secondary); }

.row2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
}
.tag {
  padding: 1px 8px;
  border-radius: 8px;
  background: var(--glass-bg);
}

.load-more {
  margin: 16px auto 0;
  display: block;
}
</style>
