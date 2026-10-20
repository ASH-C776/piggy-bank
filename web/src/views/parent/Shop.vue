<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import GlassCard from '@/components/GlassCard.vue';
import EmptyState from '@/components/EmptyState.vue';
import ProductEditor from '@/components/ProductEditor.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import Modal from '@/components/Modal.vue';

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

    <GlassCard padding="14px 18px" class="cash-card" clickable label="设置现金兑换比例" @click="openRateEditor">
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
    <Modal v-model="rateOpen" title="💵 兑换比例设置" width="360px">
      <p class="modal-hint">设置多少积分兑换 1 元</p>
      <div class="rate-input-row">
        <input v-model.number="rateInput" type="number" min="1" step="1" class="rate-input" />
        <span class="rate-suffix">积分 = 1 元</span>
      </div>
      <div class="rate-preview">
        预览：{{ rateInput }} 积分可兑 {{ (1 / rateInput).toFixed(2) }} 元
      </div>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="rateOpen = false">取消</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="rateSaving || !Number.isInteger(rateInput) || rateInput <= 0"
          @click="saveRate"
        >
          {{ rateSaving ? '保存中...' : '保存' }}
        </button>
      </template>
    </Modal>

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
  margin-bottom: var(--space-16);
  gap: var(--space-12);
}
.title { font-size: var(--fs-3xl); }
.add-btn { white-space: nowrap; flex-shrink: 0; }

.cash-card {
  display: flex;
  align-items: center;
  gap: var(--space-14);
  margin-bottom: var(--space-16);
  background: linear-gradient(135deg, rgba(255, 209, 102, 0.15), rgba(255, 180, 84, 0.08));
  transition: filter var(--dur-fast);
}
/* 手型光标由 GlassCard 的 .glass-card[tabindex] 统一提供（B5），此处不再重复；
   hover 高亮改挂在 .cash-card 上，B6 去掉了靠 class 透传的 .clickable 标记。 */
.cash-card:hover { filter: brightness(1.1); }
.cash-card .emoji { font-size: var(--fs-5xl); }
.cash-title { font-family: var(--font-cute); font-size: var(--fs-lg); margin-bottom: var(--space-2); }
.cash-desc { font-size: var(--fs-xs); color: var(--text-secondary); line-height: 1.5; }
.edit-arrow { margin-left: auto; font-size: var(--fs-2xl); opacity: 0.6; }

/* 汇率设置弹窗内容（外壳已迁入公共 Modal.vue） */
.modal-hint { font-size: var(--fs-sm); color: var(--text-secondary); margin-bottom: var(--space-16); }
.rate-input-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-8);
  margin-bottom: var(--space-12);
}
.rate-input { width: 100px; }
.rate-suffix { font-size: var(--fs-sm); color: var(--text-muted); }
.rate-preview {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-20);
  padding: var(--space-10) var(--space-14);
  border-radius: var(--r-sm);
  background: var(--glass-bg);
}

/* 商品行式列表 */
.product-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
}
.product-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-14);
  padding: var(--space-14) var(--space-18);
  border-radius: var(--r-md);
  overflow: visible; /* 让弹出菜单不被裁切 */
  transition: opacity var(--dur-base);
}
.product-row.inactive { opacity: 0.55; }
/* 菜单打开时该行浮到其他卡片之上，避免弹出菜单被后面的卡片遮挡 */
.product-row.menu-open { z-index: 50; }

.row-name {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-8);
}
.name-text {
  font-family: var(--font-cute);
  font-size: var(--fs-lg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tag.off {
  flex-shrink: 0;
  background: rgba(255, 122, 122, 0.2);
  color: var(--text-on-red);
  font-size: var(--fs-2xs);
  padding: var(--space-2) var(--space-8);
  border-radius: var(--r-2xs);
}

.row-cost {
  flex-shrink: 0;
  font-family: var(--font-cute);
  color: var(--text-on-yellow);
  font-size: var(--fs-4xl);
  min-width: 84px;
  text-align: right;
  line-height: 1;
}
.unit { font-size: var(--fs-sm); margin-left: var(--space-4); color: var(--text-muted); }

.row-stock {
  flex-shrink: 0;
  font-size: var(--fs-sm);
  color: var(--text-muted);
  min-width: 80px;
}
.row-stock .low { color: var(--text-on-red); font-weight: 600; }

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
  font-size: var(--fs-xl);
  line-height: 1;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--dur-fast);
}
.dots-btn:hover,
.dots-btn.active {
  background: var(--glass-bg);
  color: var(--text-primary);
}
.popup-menu {
  position: absolute;
  right: 0;
  top: calc(100% + var(--space-6));
  z-index: 100;
  min-width: 128px;
  padding: var(--space-6);
  border-radius: var(--r-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  box-shadow: var(--shadow-pop);
  animation: menu-pop var(--dur-fast) ease-out;
}
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(-6px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-10) var(--space-12);
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
  text-align: left;
  white-space: nowrap;
  transition: background var(--dur-fast);
}
.menu-item:hover { background: var(--glass-bg); }
.menu-item.danger { color: var(--text-on-red); }
.mi-icon { font-size: var(--fs-sm); width: 18px; text-align: center; }

@media (max-width: 480px) {
  .product-row { gap: var(--space-10); padding: var(--space-12) var(--space-14); }
  .row-cost { min-width: 64px; font-size: var(--fs-2xl); }
  .row-stock { min-width: 64px; font-size: var(--fs-sm); }
}
</style>
