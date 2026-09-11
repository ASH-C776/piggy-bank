<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import GlassCard from '@/components/GlassCard.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import EmptyState from '@/components/EmptyState.vue';

const auth = useAuthStore();

interface MeData {
  id: number;
  name: string;
  avatar: string;
  totalPoints: number;
  todayGain: number;
  todayLoss: number;
  todayExchange: number;
  totalGain: number;
  totalLoss: number;
  totalExchange: number;
}

interface Log {
  id: number;
  delta: number;
  note: string;
  source: string;
  creator_name: string | null;
  created_at: number;
}

const me = ref<MeData | null>(null);
const logs = ref<Log[]>([]);
const loading = ref(true);
const showDetail = ref(false);

const sourceLabels: Record<string, string> = {
  daily: '⭐ 日常',
  adhoc: '📋 任务',
  exchange: '🎁 兑换',
  adjust: '✏️ 临时',
};

// 评级规则
const rating = computed(() => {
  if (!me.value) return { text: '加油哦', class: 'r-D' };
  const net = me.value.todayGain + me.value.todayLoss;
  if (net >= 120) return { text: '满分通关', class: 'r-SSS' };
  if (net >= 100) return { text: '超神了', class: 'r-SS' };
  if (net >= 80) return { text: '太棒了', class: 'r-S' };
  if (net >= 60) return { text: '不错哦', class: 'r-A' };
  if (net >= 40) return { text: '还可以', class: 'r-B' };
  if (net >= 20) return { text: '一般般', class: 'r-C' };
  return { text: '加油哦', class: 'r-D' };
});

const todayNet = computed(() => {
  if (!me.value) return 0;
  return me.value.todayGain + me.value.todayLoss;
});

async function load() {
  loading.value = true;
  try {
    const [d, l] = await Promise.all([
      api.get<MeData>('/dashboard/me'),
      api.get<{ logs: Log[] }>('/point-logs/me?limit=20'),
    ]);
    me.value = d;
    logs.value = l.logs;
  } finally {
    loading.value = false;
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
    <GlassCard v-if="me" class="hero" padding="28px 24px" hoverable @click="showDetail = true">
      <ZodiacAvatar :zodiac="me.avatar" :size="96" show-ring />
      <h1 class="hello">你好呀，{{ me.name }}！</h1>

      <div class="balance">
        <div class="balance-row">
          <div class="balance-num">{{ me.totalPoints }}</div>
          <span class="balance-emoji">🌟</span>
        </div>
        <div class="balance-label">当前积分</div>
      </div>

      <div class="today-bar">
        <span class="today-label">今日</span>
        <span :class="['today-net', todayNet >= 0 ? 'gain' : 'loss']">
          {{ todayNet >= 0 ? '+' : '' }}{{ todayNet }} 🌟
        </span>
        <span :class="['rating-tag', rating.class]">{{ rating.text }}</span>
        <span v-if="me.todayLoss < 0" class="today-detail">
          (+{{ me.todayGain }} / {{ me.todayLoss }})
        </span>
      </div>
    </GlassCard>

    <!-- 明细弹窗 -->
    <Transition name="modal">
      <div v-if="showDetail && me" class="modal-mask" @click.self="showDetail = false">
        <div class="modal-box glass">
          <div class="modal-title">积分明细</div>

          <!-- 上栏：今日数据 -->
          <div class="detail-section">
            <div class="section-header">今日数据</div>
            <div class="detail-rows">
              <div class="detail-row">
                <span class="dr-label">加分</span>
                <span class="dr-value gain">+{{ me.todayGain }} 🌟</span>
              </div>
              <div class="detail-row">
                <span class="dr-label">扣分</span>
                <span class="dr-value loss">{{ me.todayLoss }} 🌟</span>
              </div>
              <div class="detail-row">
                <span class="dr-label">兑换</span>
                <span class="dr-value exchange">{{ me.todayExchange }} 🌟</span>
              </div>
            </div>
          </div>

          <div class="detail-divider"></div>

          <!-- 下栏：历史累计 -->
          <div class="detail-section">
            <div class="section-header">历史累计</div>
            <div class="detail-rows">
              <div class="detail-row">
                <span class="dr-label">累计加分</span>
                <span class="dr-value gain">+{{ me.totalGain }} 🌟</span>
              </div>
              <div class="detail-row">
                <span class="dr-label">累计扣分</span>
                <span class="dr-value loss">{{ me.totalLoss }} 🌟</span>
              </div>
              <div class="detail-row">
                <span class="dr-label">已兑换</span>
                <span class="dr-value exchange">{{ me.totalExchange }} 🌟</span>
              </div>
            </div>
          </div>

          <button class="btn btn-primary modal-close" @click="showDetail = false">关闭</button>
        </div>
      </div>
    </Transition>

    <!-- 提示语 -->
    <GlassCard class="hint-card" padding="16px 18px">
      <span class="emoji">💡</span>
      <span>找爸爸妈妈给你加分吧！攒够了积分可以去兑换礼物哦~</span>
    </GlassCard>

    <!-- 最近记录 -->
    <h2 class="section-title">最近记录</h2>

    <EmptyState v-if="!loading && logs.length === 0" emoji="📜" text="还没有积分记录" hint="让爸爸妈妈给你加分吧~" />

    <div v-else class="logs">
      <GlassCard v-for="log in logs" :key="log.id" padding="12px 14px" class="log-item">
        <div :class="['delta', log.delta > 0 ? 'gain' : 'loss']">
          {{ log.delta > 0 ? '+' : '' }}{{ log.delta }} 🌟
        </div>
        <div class="content">
          <div class="note">{{ log.note }}</div>
          <div class="meta">
            <span class="tag">{{ sourceLabels[log.source] ?? log.source }}</span>
            <span class="time">{{ fmtTime(log.created_at) }}</span>
          </div>
        </div>
      </GlassCard>
    </div>
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  cursor: pointer;
}

/* 评级小标签 */
.rating-tag {
  font-family: var(--font-cute);
  font-size: 13px;
  margin-left: 6px;
  opacity: 0.8;
}
.r-SSS { color: #e74c3c; text-shadow: 0 0 4px rgba(255,215,0,0.4); }
.r-SS  { color: #e67e22; }
.r-S   { color: #d4a017; }
.r-A   { color: #2ecc71; }
.r-B   { color: #8e44ad; }
.r-C   { color: #9b59b6; opacity: 0.6; }
.r-D   { color: #95a5a6; opacity: 0.5; }

.hello {
  font-size: 22px;
  color: var(--text-secondary);
  font-weight: 400;
}
.balance-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.balance-num {
  font-family: var(--font-cute);
  font-size: 64px;
  line-height: 1;
  background: linear-gradient(135deg, var(--accent-yellow), var(--accent-orange));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 4px 30px rgba(255, 209, 102, 0.3);
}
.balance-emoji {
  font-size: 40px;
  line-height: 1;
}
.balance-label {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: -6px;
}

/* 今日积分栏 */
.today-bar {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  padding: 8px 16px;
  border-radius: var(--r-md);
  background: var(--glass-bg);
}
.today-label {
  color: var(--text-muted);
  font-size: 12px;
}
.today-net {
  font-family: var(--font-cute);
  font-size: 18px;
}
.today-net.gain { color: var(--accent-mint); }
.today-net.loss { color: var(--accent-pink); }
.today-detail {
  font-size: 11px;
  color: var(--text-muted);
}

/* 弹窗 */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}
.modal-box {
  width: 100%;
  max-width: 380px;
  border-radius: var(--r-xl);
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.modal-title {
  font-family: var(--font-cute);
  font-size: 20px;
  text-align: center;
  color: var(--text-primary);
}
.detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.section-header {
  font-size: 13px;
  color: var(--text-muted);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--glass-border);
}
.detail-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  border-radius: var(--r-sm);
  background: var(--glass-bg);
}
.dr-label {
  font-size: 13px;
  color: var(--text-secondary);
}
.dr-value {
  font-family: var(--font-cute);
  font-size: 16px;
}
.dr-value.gain { color: var(--accent-mint); }
.dr-value.loss { color: var(--accent-pink); }
.dr-value.exchange { color: var(--accent-orange); }

.detail-divider {
  height: 1px;
  background: var(--glass-border);
}

.modal-close {
  margin-top: 4px;
}

/* 弹窗动画 */
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.25s ease;
}
.modal-enter-active .modal-box, .modal-leave-active .modal-box {
  transition: transform 0.25s ease;
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-box, .modal-leave-to .modal-box {
  transform: scale(0.9);
}

.hint-card {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 20px;
  line-height: 1.5;
}
.hint-card .emoji { font-size: 22px; flex-shrink: 0; }

.section-title {
  font-size: 18px;
  margin-bottom: 12px;
}

.logs { display: flex; flex-direction: column; gap: 8px; }

.log-item {
  display: flex;
  align-items: center;
  gap: 14px;
}
.delta {
  width: 56px;
  text-align: center;
  font-family: var(--font-cute);
  font-size: 20px;
  flex-shrink: 0;
}
.delta.gain { color: var(--accent-mint); }
.delta.loss { color: var(--accent-pink); }

.content { flex: 1; min-width: 0; }
.note { font-size: 14px; }
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
}
.tag {
  padding: 1px 8px;
  border-radius: 8px;
  background: var(--glass-bg);
}
</style>
