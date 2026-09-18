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
.page-header { margin-bottom: var(--space-16); }
.title { font-size: var(--fs-3xl); }

.filters {
  display: flex;
  gap: var(--space-6);
  margin-bottom: var(--space-16);
  overflow-x: auto;
  padding-bottom: var(--space-4);
  scrollbar-width: none;
}
.filters::-webkit-scrollbar { display: none; }
.filters button {
  padding: var(--space-6) var(--space-14);
  border-radius: var(--r-sm);
  background: var(--glass-bg);
  color: var(--text-secondary);
  white-space: nowrap;
  font-size: var(--fs-sm);
  transition: all var(--dur-base);
}
.filters button.active {
  background: var(--glass-bg-strong);
  color: var(--text-primary);
}

.logs { display: flex; flex-direction: column; gap: var(--space-8); }

.log-item {
  display: flex;
  align-items: center;
  gap: var(--space-14);
}
.delta {
  width: 60px;
  text-align: center;
  font-family: var(--font-cute);
  font-size: var(--fs-2xl);
  flex-shrink: 0;
}
.delta.gain { color: var(--text-on-mint); }
.delta.loss { color: var(--text-on-pink); }

.content { flex: 1; min-width: 0; }
.row1 { display: flex; align-items: center; gap: var(--space-8); font-size: var(--fs-sm); }
.note { color: var(--text-secondary); }

.row2 {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  margin-top: var(--space-4);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.tag {
  padding: var(--space-2) var(--space-8);
  border-radius: var(--r-xs);
  background: var(--glass-bg);
}

.load-more {
  margin: var(--space-16) auto 0;
  display: block;
}
</style>
