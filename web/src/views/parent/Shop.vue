<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import GlassCard from '@/components/GlassCard.vue';
import EmptyState from '@/components/EmptyState.vue';
import ProductEditor from '@/components/ProductEditor.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';

const toast = useToastStore();

interface Product {
  id: number;
  name: string;
  cost: number;
  stock: number;
  icon: string;
  status: string;
  created_at: number;
}

const products = ref<Product[]>([]);
const loading = ref(true);
const editorOpen = ref(false);
const editing = ref<Product | null>(null);

// 现金兑换汇率
const cashRate = ref(10);
const rateOpen = ref(false);
const rateInput = ref(10);
const rateSaving = ref(false);

// 删除确认弹窗
const confirmOpen = ref(false);
const pendingDelete = ref<Product | null>(null);

// 竖三点操作菜单
const openMenuId = ref<number | null>(null);
function toggleMenu(id: number) {
  openMenuId.value = openMenuId.value === id ? null : id;
}
function closeMenu() {
  openMenuId.value = null;
}
function onDocClick() {
  closeMenu();
}
onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));

async function load() {
  loading.value = true;
  try {
    const [res, rate] = await Promise.all([
      api.get<{ products: Product[] }>('/products'),
      api.get<{ rate: number }>('/products/cash-rate'),
    ]);
    products.value = res.products;
    cashRate.value = rate.rate;
  } finally { loading.value = false; }
}

function openRateEditor() {
  rateInput.value = cashRate.value;
  rateOpen.value = true;
}

async function saveRate() {
  if (!Number.isInteger(rateInput.value) || rateInput.value <= 0) {
    toast.warning('汇率必须是正整数');
    return;
  }
  rateSaving.value = true;
  try {
    await api.put('/products/cash-rate', { rate: rateInput.value });
    cashRate.value = rateInput.value;
    rateOpen.value = false;
    toast.success(`已设置 ${rateInput.value} 积分 = 1 元`);
  } catch (e: any) {
    toast.error(e.message);
  } finally {
    rateSaving.value = false;
  }
}

function openEditor(p?: Product) {
  closeMenu();
  editing.value = p ?? null;
  editorOpen.value = true;
}

async function onSaved() {
  editorOpen.value = false;
  await load();
}

async function toggleStatus(p: Product) {
  closeMenu();
  try {
    const next = p.status === 'active' ? 'inactive' : 'active';
    await api.patch(`/products/${p.id}`, { status: next });
    toast.success(next === 'active' ? '已上架' : '已下架');
    await load();
  } catch (e: any) { toast.error(e.message); }
}

function remove(p: Product) {
  closeMenu();
  pendingDelete.value = p;
  confirmOpen.value = true;
}

async function doDelete() {
  if (!pendingDelete.value) return;
  try {
    await api.delete(`/products/${pendingDelete.value.id}`);
    toast.success('已删除');
    await load();
  } catch (e: any) { toast.error(e.message); }
  pendingDelete.value = null;
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h1 class="title">积分商城</h1>
      <button class="btn btn-primary add-btn" @click="openEditor()">＋ 新增</button>
    </header>

    <GlassCard padding="14px 18px" class="cash-card clickable" @click="openRateEditor">
      <span class="emoji">💵</span>
      <div class="cash-info">
        <div class="cash-title">现金兑换</div>
        <div class="cash-desc">{{ cashRate }} 积分 = 1 元，点击设置兑换比例</div>
      </div>
      <span class="edit-arrow">⚙️</span>
    </GlassCard>

    <EmptyState
      v-if="!loading && products.length === 0"
      emoji="🎁"
      text="还没有商品"
      hint="点击右上角「新增」添加商品"
    />

    <div v-else class="product-list">
      <div
        v-for="p in products"
        :key="p.id"
        class="product-row glass"
        :class="{ inactive: p.status === 'inactive', 'menu-open': openMenuId === p.id }"
      >
        <CategoryIcon :icon="p.icon" :size="42" />
        <div class="row-name">
          <span class="name-text">{{ p.name }}</span>
          <span v-if="p.status === 'inactive'" class="tag off">已下架</span>
        </div>
        <div class="row-cost">
          <span class="cost-num">{{ p.cost }}</span><span class="unit">分</span>
        </div>
        <div class="row-stock">
          <span v-if="p.stock === -1">库存 不限</span>
          <span v-else>库存 <span :class="{ low: p.stock <= 3 }">{{ p.stock }}</span></span>
        </div>
        <div class="row-menu">
          <button
            class="dots-btn"
            :class="{ active: openMenuId === p.id }"
            title="更多操作"
            @click.stop="toggleMenu(p.id)"
          >⋮</button>
          <div v-if="openMenuId === p.id" class="popup-menu glass-strong" @click.stop>
            <button class="menu-item" @click="openEditor(p)">
              <span class="mi-icon">✏️</span> 编辑
            </button>
            <button class="menu-item" @click="toggleStatus(p)">
              <span class="mi-icon">{{ p.status === 'active' ? '📥' : '📤' }}</span>
              {{ p.status === 'active' ? '下架' : '上架' }}
            </button>
            <button class="menu-item danger" @click="remove(p)">
              <span class="mi-icon">🗑️</span> 删除
            </button>
          </div>
        </div>
      </div>
    </div>

    <ProductEditor v-if="editorOpen" v-model="editorOpen" :product="editing" @saved="onSaved" />

    <!-- 汇率设置弹窗 -->
    <div v-if="rateOpen" class="modal-overlay" @click.self="rateOpen = false">
      <div class="modal glass-strong">
        <h3 class="modal-title">💵 兑换比例设置</h3>
        <p class="modal-hint">设置多少积分兑换 1 元</p>
        <div class="rate-input-row">
          <input v-model.number="rateInput" type="number" min="1" step="1" class="rate-input" />
          <span class="rate-suffix">积分 = 1 元</span>
        </div>
        <div class="rate-preview">
          预览：{{ rateInput }} 积分可兑 {{ (1 / rateInput).toFixed(2) }} 元
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="rateOpen = false">取消</button>
          <button class="btn btn-primary" :disabled="rateSaving || !Number.isInteger(rateInput) || rateInput <= 0" @click="saveRate">
            {{ rateSaving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-model="confirmOpen"
      title="删除商品"
      :message="`确认删除「${pendingDelete?.name}」？删除后不可恢复`"
      confirmText="删除"
      variant="danger"
      @confirm="doDelete"
    />
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}
.title { font-size: 26px; }
.add-btn { white-space: nowrap; flex-shrink: 0; }

.cash-card {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
  background: linear-gradient(135deg, rgba(255, 209, 102, 0.15), rgba(255, 180, 84, 0.08));
  transition: filter 0.15s;
}
.cash-card.clickable { cursor: pointer; }
.cash-card.clickable:hover { filter: brightness(1.1); }
.cash-card .emoji { font-size: 36px; }
.cash-title { font-family: var(--font-cute); font-size: 18px; margin-bottom: 2px; }
.cash-desc { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
.edit-arrow { margin-left: auto; font-size: 22px; opacity: 0.6; }

/* 汇率设置弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}
.modal {
  width: 100%;
  max-width: 360px;
  padding: 24px;
  border-radius: var(--r-lg);
  border: 1px solid var(--glass-border);
}
.modal-title { font-family: var(--font-cute); font-size: 22px; margin-bottom: 8px; }
.modal-hint { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; }
.rate-input-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
}
.rate-input { width: 100px; }
.rate-suffix { font-size: 14px; color: var(--text-muted); }
.rate-preview {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 20px;
  padding: 10px 14px;
  border-radius: var(--r-sm);
  background: var(--glass-bg);
}
.modal-actions { display: flex; gap: 10px; }
.modal-actions .btn { flex: 1; }

/* 商品行式列表 */
.product-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.product-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: var(--r-md);
  overflow: visible; /* 让弹出菜单不被裁切 */
  transition: opacity 0.2s;
}
.product-row.inactive { opacity: 0.55; }
/* 菜单打开时该行浮到其他卡片之上，避免弹出菜单被后面的卡片遮挡 */
.product-row.menu-open { z-index: 50; }

.row-name {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.name-text {
  font-family: var(--font-cute);
  font-size: 17px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tag.off {
  flex-shrink: 0;
  background: rgba(255, 122, 122, 0.2);
  color: var(--danger);
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 6px;
}

.row-cost {
  flex-shrink: 0;
  font-family: var(--font-cute);
  color: var(--accent-yellow);
  font-size: 28px;
  min-width: 84px;
  text-align: right;
  line-height: 1;
}
.unit { font-size: 14px; margin-left: 3px; color: var(--text-muted); }

.row-stock {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--text-muted);
  min-width: 80px;
}
.row-stock .low { color: var(--danger); font-weight: 600; }

/* 竖三点菜单 */
.row-menu {
  position: relative;
  flex-shrink: 0;
}
.dots-btn {
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  background: var(--glass-bg-strong);
  font-size: 20px;
  line-height: 1;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.dots-btn:hover,
.dots-btn.active {
  background: var(--glass-bg);
  color: var(--text-primary);
}
.popup-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 100;
  min-width: 128px;
  padding: 6px;
  border-radius: var(--r-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  animation: menu-pop 0.15s ease-out;
}
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(-6px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: var(--r-sm);
  font-size: 14px;
  text-align: left;
  white-space: nowrap;
  transition: background 0.12s;
}
.menu-item:hover { background: var(--glass-bg); }
.menu-item.danger { color: var(--danger); }
.mi-icon { font-size: 14px; width: 18px; text-align: center; }

@media (max-width: 480px) {
  .product-row { gap: 10px; padding: 12px 14px; }
  .row-cost { min-width: 64px; font-size: 23px; }
  .row-stock { min-width: 64px; font-size: 13px; }
}
</style>
