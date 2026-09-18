<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import GlassCard from '@/components/GlassCard.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import EmptyState from '@/components/EmptyState.vue';
import Modal from '@/components/Modal.vue';

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
    <!-- 注：早期这里写的是 hoverable（GlassCard 并无此 prop），靠 class 透传「碰巧」生效；
         B6 一并订正为 hover。可访问名显式给出：卡片内含头像 emoji 与多个数字，
         自动推导出的名字是一串杂乱符号，反而读不出「点它能做什么」。 -->
    <GlassCard
      v-if="me"
      class="hero"
      padding="28px 24px"
      hover
      clickable
      :label="`查看积分明细，当前积分 ${me.totalPoints} 分`"
      @click="showDetail = true"
    >
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

    <!-- 明细弹窗（外壳走公共 Modal.vue；playful 变体保留孩子端「更大圆角」的观感） -->
    <Modal
      :model-value="showDetail && !!me"
      variant="playful"
      width="380px"
      aria-label="积分明细"
      @update:model-value="showDetail = $event"
    >
      <div v-if="me" class="detail-stack">
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

        <button class="btn btn-primary modal-close" type="button" @click="showDetail = false">关闭</button>
      </div>
    </Modal>

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
  gap: var(--space-10);
  margin-bottom: var(--space-16);
  cursor: pointer;
}

/* 评级小标签
   ----------------------------------------------------------------------------
   原先 7 档直接用第三方 flat-UI 艳色，其中 **5 档对白底不到 4.5:1**
   （#e74c3c 3.82 / #e67e22 2.87 / #d4a017 2.38 / #2ecc71 2.10 / #95a5a6 2.56），
   另外 r-C / r-D 还各叠了一层 opacity 把它压得更低。

   现改为映射到项目自带的「压暗版」文字色 token：全部 ≥ 5.41:1，
   且色相沿「冷 → 暖」单调推进，正好对应分数由低到高（也符合国内"红=最好"的直觉）。

   同时**去掉 r-C / r-D 上的 opacity**：用透明度表达"差"，对天天看它的孩子是负面暗示，
   而且让本来就不清楚的字更看不清。等级由颜色与文案表达 —— 文案已经是鼓励口吻
   （「加油哦」「一般般」），不必再补一刀。
   ---------------------------------------------------------------------------- */
.rating-tag {
  font-family: var(--font-cute);
  font-size: var(--fs-sm);
  margin-left: var(--space-6);
  /* 原先这里的 opacity: 0.8 会把上面这批刚好达标的颜色又拉回 4.26:1，故移除 */
}
.r-D   { color: var(--text-secondary); } /* 6.84:1 中性暖灰，不褒不贬 */
.r-C   { color: var(--text-on-sky); }    /* 6.62:1 */
.r-B   { color: var(--text-on-mint); }   /* 6.01:1 */
.r-A   { color: var(--text-on-yellow); } /* 5.54:1 */
.r-S   { color: var(--text-on-orange); } /* 5.88:1 */
.r-SS  { color: var(--text-on-pink); }   /* 5.41:1 */
/* 顶级保留一点金色光晕以示区别 —— 实色文字配 text-shadow 是安全的，
   不像渐变文字那样会被"透明填充 + 阴影穿字"的坑反噬 */
.r-SSS { color: var(--text-on-red); text-shadow: 0 0 6px rgba(255, 209, 102, 0.6); } /* 6.21:1 */

.hello {
  font-size: var(--fs-2xl);
  color: var(--text-secondary);
  font-weight: 400;
}
.balance-row {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}
.balance-num {
  font-family: var(--font-cute);
  font-size: var(--fs-8xl);
  line-height: 1;
  /* 兜底：不支持 background-clip:text 时退化为深色实字，避免余额数字整块消失 */
  color: var(--text-on-orange);
  /* ！原先这里有一层 text-shadow: 0 4px 30px rgba(255,209,102,.3) 金色光晕，B7 移除。
     原因不是不好看，而是它与 background-clip:text 有已知的相互作用：阴影画在
     「被裁剪的背景」之后、透明填充的字形之内，于是**光晕会从字里面透出来**。
     在原来的亮金渐变上察觉不到，但换成压暗端点后，这层金色会把字心提亮回约 2.95:1，
     等于把刚做的对比度修复抵消掉。 */
}
@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  .balance-num {
    /* 端点用压暗版（3.63:1 → 4.90:1）：原来的 accent-yellow→orange 只有 1.44–1.76:1，
       64px 大字虽只需 3:1 也差得远。取舍理由见 main.css 的 --grad-num-* 注释。 */
    background: linear-gradient(135deg, var(--grad-num-warm-from), var(--grad-num-warm-to));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}
.balance-emoji {
  font-size: var(--fs-6xl);
  line-height: 1;
}
.balance-label {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  margin-top: calc(-1 * var(--space-6));
}

/* 今日积分栏 */
.today-bar {
  margin-top: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-8);
  font-size: var(--fs-sm);
  padding: var(--space-8) var(--space-16);
  border-radius: var(--r-md);
  background: var(--glass-bg);
}
.today-label {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
.today-net {
  font-family: var(--font-cute);
  font-size: var(--fs-lg);
}
.today-net.gain { color: var(--text-on-mint); }
.today-net.loss { color: var(--text-on-pink); }
.today-detail {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

/* 明细弹窗内容（外壳已迁入公共 Modal.vue，此处只留内容排版） */
.detail-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
}
.modal-title {
  font-family: var(--font-cute);
  font-size: var(--fs-xl);
  text-align: center;
  color: var(--text-primary);
}
.detail-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}
.section-header {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  padding-bottom: var(--space-6);
  border-bottom: 1px solid var(--glass-border);
}
.detail-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-6) var(--space-8);
  border-radius: var(--r-sm);
  background: var(--glass-bg);
}
.dr-label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}
.dr-value {
  font-family: var(--font-cute);
  font-size: var(--fs-md);
}
.dr-value.gain { color: var(--text-on-mint); }
.dr-value.loss { color: var(--text-on-pink); }
.dr-value.exchange { color: var(--text-on-orange); }

.detail-divider {
  height: 1px;
  background: var(--glass-border);
}

.modal-close {
  margin-top: var(--space-4);
}

.hint-card {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-20);
  line-height: 1.5;
}
.hint-card .emoji { font-size: var(--fs-2xl); flex-shrink: 0; }

.section-title {
  font-size: var(--fs-lg);
  margin-bottom: var(--space-12);
}

.logs { display: flex; flex-direction: column; gap: var(--space-8); }

.log-item {
  display: flex;
  align-items: center;
  gap: var(--space-14);
}
.delta {
  width: 56px;
  text-align: center;
  font-family: var(--font-cute);
  font-size: var(--fs-xl);
  flex-shrink: 0;
}
.delta.gain { color: var(--text-on-mint); }
.delta.loss { color: var(--text-on-pink); }

.content { flex: 1; min-width: 0; }
.note { font-size: var(--fs-sm); }
.meta {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  margin-top: var(--space-4);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.tag {
  padding: var(--space-2) var(--space-8);
  border-radius: var(--r-xs);
  background: var(--glass-bg);
}
</style>
