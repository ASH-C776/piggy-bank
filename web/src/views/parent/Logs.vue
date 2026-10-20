<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/client';
import GlassCard from '@/components/GlassCard.vue';
import EmptyState from '@/components/EmptyState.vue';
import { fmtRelativeTime } from '@/utils/time';

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

const PAGE_SIZE = 20;
const logs = ref<Log[]>([]);
const loading = ref(true);
const filterUserId = ref<number | null>(null);
const dateFrom = ref('');
const dateTo = ref('');
const page = ref(0);
const total = ref(0);
const children = ref<Array<{ id: number; name: string; avatar: string }>>([]);

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

async function load(targetPage = 0) {
  page.value = targetPage;
  loading.value = true;
  try {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(targetPage * PAGE_SIZE));
    if (filterUserId.value) params.set('userId', String(filterUserId.value));
    if (dateFrom.value) params.set('dateFrom', dateFrom.value);
    if (dateTo.value) params.set('dateTo', dateTo.value);
    const res = await api.get<{ logs: Log[]; total: number }>(`/point-logs?${params.toString()}`);
    logs.value = res.logs;
    total.value = res.total ?? 0;
  } finally {
    loading.value = false;
  }
}

// 切换筛选条件时回到第一页
function resetAndLoad() {
  load(0);
}

async function loadChildren() {
  const res = await api.get<{ children: Array<{ id: number; name: string; avatar: string }> }>('/children');
  children.value = res.children;
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
      <button :class="{ active: filterUserId === null }" @click="filterUserId = null; resetAndLoad()">
        全部
      </button>
      <button
        v-for="c in children"
        :key="c.id"
        :class="{ active: filterUserId === c.id }"
        @click="filterUserId = c.id; resetAndLoad()"
      >
        {{ c.name }}
      </button>
    </div>

    <div class="date-row">
      <input type="date" v-model="dateFrom" @change="resetAndLoad" />
      <span class="dash">—</span>
      <input type="date" v-model="dateTo" @change="resetAndLoad" />
      <button
        v-if="dateFrom || dateTo"
        class="btn-ghost-clear"
        @click="dateFrom = ''; dateTo = ''; resetAndLoad()"
      >清除</button>
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
            <span class="time">{{ fmtRelativeTime(log.created_at, { withTime: true }) }}</span>
          </div>
        </div>
      </GlassCard>
    </div>

    <div v-if="logs.length > 0" class="pager">
      <button class="btn btn-ghost" :disabled="page === 0" @click="load(page - 1)">上一页</button>
      <span class="pager-info">第 {{ page + 1 }} / {{ pageCount }} 页 · 共 {{ total }} 条</span>
      <button class="btn btn-ghost" :disabled="page >= pageCount - 1" @click="load(page + 1)">下一页</button>
    </div>
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

.date-row {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  margin: calc(-1 * var(--space-8)) 0 var(--space-16);
}
.date-row input[type='date'] {
  padding: var(--space-6) var(--space-10);
  border-radius: var(--r-sm);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  color: var(--text-primary);
  font-size: var(--fs-sm);
  color-scheme: light;
}
.date-row .dash { color: var(--text-muted); }
.btn-ghost-clear {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  padding: var(--space-6) var(--space-10);
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-12);
  margin-top: var(--space-16);
}
.pager-info {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.pager .btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
