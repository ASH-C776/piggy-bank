<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import { useAuthStore } from '@/stores/auth';
import GlassCard from '@/components/GlassCard.vue';
import EmptyState from '@/components/EmptyState.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import Modal from '@/components/Modal.vue';

const toast = useToastStore();
const auth = useAuthStore();

interface Product { id: number; name: string; cost: number; stock: number; icon: string }
interface Request {
  id: number;
  type: 'product' | 'cash';
  product_name: string | null;
  product_icon: string | null;
  points: number;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  created_at: number;
}

const products = ref<Product[]>([]);
const myRequests = ref<Request[]>([]);
const loading = ref(true);
const myPoints = computed(() => auth.user?.totalPoints ?? 0);
const tab = ref<'shop' | 'records'>('shop');

// 现金兑换弹窗
const cashOpen = ref(false);
const cashPoints = ref(10);
const cashRate = ref(10);
const cashAmount = computed(() => cashPoints.value / cashRate.value);

// 确认弹窗
const confirmOpen = ref(false);
const confirmMessage = ref('');
const confirmAction = ref<(() => Promise<void>) | null>(null);

async function load() {
  loading.value = true;
  try {
    const [p, r, rate] = await Promise.all([
      api.get<{ products: Product[] }>('/products'),
      api.get<{ requests: Request[] }>('/exchange-requests/mine'),
      api.get<{ rate: number }>('/products/cash-rate'),
    ]);
    products.value = p.products;
    myRequests.value = r.requests;
    cashRate.value = rate.rate;
    await auth.refreshMe();
  } finally { loading.value = false; }
}

async function exchangeProduct(p: Product) {
  if (myPoints.value < p.cost) {
    return toast.warning(`积分不足，还差 ${p.cost - myPoints.value} 分`);
  }
  confirmMessage.value = `确认兑换「${p.name}」？消耗 ${p.cost} 分\n（等待家长审核通过后扣分）`;
  confirmAction.value = async () => {
    try {
      await api.post('/exchange-requests', { type: 'product', productId: p.id });
      toast.success('申请已提交，等家长审核哦~');
      await load();
    } catch (e: any) {
      const err = e.payload?.error;
      if (err === 'insufficient_points') toast.error('积分不足');
      else if (err === 'out_of_stock') toast.error('商品已售罄');
      else toast.error(e.message);
    }
  };
  confirmOpen.value = true;
}

function openCash() {
  cashPoints.value = Math.min(cashRate.value, Math.floor(myPoints.value / cashRate.value) * cashRate.value || cashRate.value);
  cashOpen.value = true;
}

async function exchangeCash() {
  if (cashPoints.value % cashRate.value !== 0) return toast.warning(`积分必须是 ${cashRate.value} 的倍数`);
  if (cashPoints.value > myPoints.value) return toast.warning('积分不足');
  confirmMessage.value = `确认兑换 ${cashAmount.value} 元？消耗 ${cashPoints.value} 积分`;
  confirmAction.value = async () => {
    try {
      await api.post('/exchange-requests', { type: 'cash', points: cashPoints.value });
      toast.success(`已申请兑换 ${cashAmount.value} 元，等家长审核`);
      cashOpen.value = false;
      await load();
    } catch (e: any) {
      if (e.payload?.error === 'insufficient_points') toast.error('积分不足');
      else toast.error(e.message);
    }
  };
  confirmOpen.value = true;
}

async function runConfirm() {
  if (confirmAction.value) await confirmAction.value();
  confirmAction.value = null;
}

function fmtTime(ts: number) {
  const d = new Date(ts * 1000);
  const diff = Date.now() - ts * 1000;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const statusText: Record<string, string> = {
  pending: '⏳ 审核中',
  approved: '✅ 已通过',
  rejected: '❌ 已拒绝',
};

// 兑换记录类型图标
const typeIcon: Record<string, string> = {
  cash: '💰 现金',
  product: '商品',
};

onMounted(() => {
  load();
  window.addEventListener('ws:exchange_reviewed', onReviewed);
});

function onReviewed() {
  // 收到审核结果后刷新兑换记录
  load();
}

onUnmounted(() => {
  window.removeEventListener('ws:exchange_reviewed', onReviewed);
});
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="title">积分商城</h1>
        <p class="subtitle">攒积分，换好礼~</p>
      </div>
      <div class="points-box">
        <span class="num">{{ myPoints }}</span>
        <span class="unit">分</span>
        <span class="emoji">🌟</span>
      </div>
    </header>

    <div class="tabs">
      <button :class="{ active: tab === 'shop' }" @click="tab = 'shop'">🎁 商城</button>
      <button :class="{ active: tab === 'records' }" @click="tab = 'records'">📋 我的兑换</button>
    </div>

    <template v-if="tab === 'shop'">
      <!-- 现金兑换入口 -->
      <GlassCard padding="16px 18px" class="cash-entry" clickable label="现金兑换" @click="openCash">
        <div class="cash-left">
          <span class="emoji">💵</span>
          <div>
            <div class="cash-title">现金兑换</div>
          <div class="cash-desc">{{ cashRate }} 🌟 = 1 元</div>
          </div>
        </div>
        <span class="arrow">›</span>
      </GlassCard>

      <EmptyState v-if="!loading && products.length === 0" emoji="🎁" text="商城还没有商品" hint="让爸爸妈妈添加商品吧~" />

      <div v-else class="product-list">
        <GlassCard v-for="p in products" :key="p.id" padding="10px 14px" class="product-row">
          <CategoryIcon :icon="p.icon" :size="40" />
          <div class="p-info">
            <span class="name">{{ p.name }}</span>
            <span class="stock" :class="{ soldout: p.stock === 0 }">
              {{ p.stock === -1 ? '库存不限' : (p.stock === 0 ? '已售罄' : `剩 ${p.stock} 件`) }}
            </span>
          </div>
          <span class="cost">{{ p.cost }} 🌟</span>
          <button
            class="btn btn-primary exchange-btn"
            :disabled="myPoints < p.cost || p.stock === 0"
            @click="exchangeProduct(p)"
          >
            {{ p.stock === 0 ? '售罄' : (myPoints < p.cost ? '🌟不足' : '兑换') }}
          </button>
        </GlassCard>
      </div>
    </template>

    <template v-else>
      <EmptyState v-if="!loading && myRequests.length === 0" emoji="📋" text="还没有兑换记录" />
      <div v-else class="records">
        <GlassCard v-for="r in myRequests" :key="r.id" padding="12px 16px" class="record">
          <div class="r-head">
            <span class="r-type">
              <CategoryIcon v-if="r.type === 'product'" :icon="r.product_icon" :size="24" />
              <span v-else class="r-type-emoji">💰</span>
              <span>{{ typeIcon[r.type] }}</span>
            </span>
            <span class="r-status" :class="r.status">{{ statusText[r.status] }}</span>
          </div>
          <div class="r-detail">
            <span v-if="r.type === 'product'">{{ r.product_name || '已删除商品' }}</span>
            <span v-else>{{ r.amount }} 元</span>
            <span class="r-pts">🌟 -{{ r.points }} 分</span>
          </div>
          <div v-if="r.status === 'rejected' && r.reason" class="r-reason">
            📝 {{ r.reason }}
          </div>
          <div class="r-time">{{ fmtTime(r.created_at) }}</div>
        </GlassCard>
      </div>
    </template>

    <!-- 现金兑换弹窗 -->
    <Modal v-model="cashOpen" title="💵 现金兑换" width="360px">
      <p class="modal-hint">{{ cashRate }} 🌟 = 1 元（必须是 {{ cashRate }} 的倍数）</p>
      <div class="my-points">🌟 当前积分：{{ myPoints }} 分</div>
      <div class="input-row">
        <input v-model.number="cashPoints" type="number" :min="cashRate" :step="cashRate" />
        <span class="suffix">分</span>
      </div>
      <div class="amount-display">
        可兑换 <span class="amount">{{ cashAmount }}</span> 元
      </div>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="cashOpen = false">取消</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="cashPoints % cashRate !== 0 || cashPoints > myPoints"
          @click="exchangeCash"
        >
          确认申请
        </button>
      </template>
    </Modal>

    <ConfirmDialog
      v-model="confirmOpen"
      title="确认操作"
      :message="confirmMessage"
      confirmText="确认"
      @confirm="runConfirm"
    />
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-16);
}
.title { font-size: var(--fs-3xl); margin-bottom: var(--space-2); }
.subtitle { color: var(--text-secondary); font-size: var(--fs-sm); }
.points-box {
  background: linear-gradient(135deg, var(--accent-yellow), var(--accent-orange));
  padding: var(--space-8) var(--space-16);
  border-radius: var(--r-md);
  box-shadow: 0 4px 12px rgba(255, 180, 84, 0.3);
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
}
.points-box .emoji { font-size: var(--fs-md); }
.points-box .num {
  font-family: var(--font-cute);
  font-size: var(--fs-3xl);
  color: #4a2e00;
}
.points-box .unit { font-size: var(--fs-xs); color: #4a2e00; }

.tabs {
  display: flex;
  background: var(--glass-bg);
  border-radius: var(--r-md);
  padding: var(--space-4);
  gap: var(--space-4);
  margin-bottom: var(--space-16);
}
.tabs button {
  flex: 1;
  padding: var(--space-10);
  border-radius: var(--r-sm);
  color: var(--text-secondary);
  font-weight: 600;
  transition: all var(--dur-base);
}
.tabs button.active {
  background: var(--glass-bg-strong);
  color: var(--text-primary);
  box-shadow: var(--shadow-pill);
}

.cash-entry {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-16);
  cursor: pointer;
  background: linear-gradient(135deg, rgba(255, 209, 102, 0.15), rgba(255, 180, 84, 0.08));
}
.cash-left { display: flex; align-items: center; gap: var(--space-12); }
.cash-entry .emoji { font-size: var(--fs-5xl); }
.cash-title { font-family: var(--font-cute); font-size: var(--fs-lg); }
.cash-desc { font-size: var(--fs-xs); color: var(--text-secondary); }
.arrow { font-size: var(--fs-3xl); color: var(--text-muted); }

.product-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
}
.product-row {
  display: flex;
  align-items: center;
  gap: var(--space-12);
}
.p-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.p-info .name {
  font-family: var(--font-cute);
  font-size: var(--fs-md);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.p-info .stock {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.p-info .stock.soldout { color: var(--text-on-red); }
.product-row .cost {
  flex-shrink: 0;
  font-family: var(--font-cute);
  color: var(--text-on-yellow);
  font-size: var(--fs-xl);
}
.exchange-btn {
  flex-shrink: 0;
  min-width: 72px;
  padding: var(--space-8) var(--space-14);
  font-size: var(--fs-sm);
}
.exchange-btn:disabled { opacity: 0.45; }

.records { display: flex; flex-direction: column; gap: var(--space-10); }
.r-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-6); }
.r-type { display: inline-flex; align-items: center; gap: var(--space-6); font-size: var(--fs-sm); font-family: var(--font-cute); }
.r-type-emoji { font-size: var(--fs-xl); line-height: 1; }
.r-status { font-size: var(--fs-xs); padding: var(--space-2) var(--space-8); border-radius: var(--r-2xs); font-weight: 600; }
.r-status.pending { background: rgba(255, 209, 102, 0.2); color: var(--text-on-yellow); }
.r-status.approved { background: rgba(126, 212, 185, 0.2); color: var(--text-on-mint); }
.r-status.rejected { background: rgba(255, 122, 122, 0.2); color: var(--text-on-red); }
.r-detail {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-sm);
  margin-bottom: var(--space-4);
}
.r-pts { color: var(--text-on-red); font-family: var(--font-cute); }
.r-reason { font-size: var(--fs-xs); color: var(--text-on-red); margin-bottom: var(--space-4); }
.r-time { font-size: var(--fs-xs); color: var(--text-muted); }

/* 现金兑换弹窗内容（外壳已迁入公共 Modal.vue） */
.modal-hint { font-size: var(--fs-xs); color: var(--text-secondary); margin-bottom: var(--space-16); }
.my-points { font-size: var(--fs-sm); margin-bottom: var(--space-12); color: var(--text-secondary); }
.input-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-6);
  margin-bottom: var(--space-12);
}
.input-row input { flex: 1; }
.suffix { font-size: var(--fs-sm); color: var(--text-muted); }
.amount-display {
  font-size: var(--fs-md);
  margin-bottom: var(--space-20);
  text-align: center;
}
.amount-display .amount {
  font-family: var(--font-cute);
  color: var(--text-on-yellow);
  font-size: var(--fs-4xl);
}
</style>
