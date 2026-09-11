<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import GlassCard from '@/components/GlassCard.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import EmptyState from '@/components/EmptyState.vue';
import PointItemEditor from '@/components/PointItemEditor.vue';
import Modal from '@/components/Modal.vue';

const toast = useToastStore();

interface Child { id: number; name: string; avatar: string; total_points: number }
interface PointItem {
  id: number;
  name: string;
  type: 'gain' | 'loss';
  points: number;
  daily_limit: number;
  enabled: number;
  is_default: number;
  owner_id: number | null;
}

const children = ref<Child[]>([]);
const items = ref<PointItem[]>([]);
const loading = ref(true);
const selectedChildId = ref<number | null>(null);
const tab = ref<'gain' | 'loss'>('gain');

// 编辑器
const editorOpen = ref(false);
const editingItem = ref<PointItem | null>(null);

// 临时加减分弹窗
const adjustOpen = ref(false);
const adjustNote = ref('');
const adjustDelta = ref(5); // 正加分 负扣分
const adjustType = ref<'gain' | 'loss'>('gain');
const adjustSaving = ref(false);

const selectedChild = computed(() =>
  children.value.find((c) => c.id === selectedChildId.value) ?? null
);

// 当前小孩可见的项目：专属项 + 通用项（owner_id 为 null）
const visibleItems = computed(() => {
  if (!selectedChildId.value) return [];
  return items.value.filter(
    (i) => i.type === tab.value && i.enabled && (i.owner_id === null || i.owner_id === selectedChildId.value)
  );
});

async function load() {
  loading.value = true;
  try {
    const childRes = await api.get<{ children: Child[] }>('/children');
    children.value = childRes.children;
    if (selectedChildId.value === null && children.value.length > 0) {
      selectedChildId.value = children.value[0].id;
    }
    await loadItems();
  } finally {
    loading.value = false;
  }
}

async function loadItems() {
  const itemRes = await api.get<{ items: PointItem[] }>('/point-items');
  items.value = itemRes.items;
}

// 切换小孩时刷新数据
watch(selectedChildId, async () => {
  // 刷新小孩最新积分
  try {
    const childRes = await api.get<{ children: Child[] }>('/children');
    children.value = childRes.children;
  } catch {}
});

async function apply(item: PointItem) {
  const c = selectedChild.value;
  if (!c) return;
  try {
    const res = await api.post<{ ok: boolean; newBalance: number; delta: number }>(
      '/point-items/apply',
      { userId: c.id, itemId: item.id }
    );
    c.total_points = res.newBalance;
    toast.success(`${c.name} ${item.name} ${item.points > 0 ? '+' : ''}${item.points} 分`);
  } catch (e: any) {
    if (e.payload?.error === 'daily_limit_reached') {
      toast.warning(`${c.name} 今日「${item.name}」已达上限`);
    } else {
      toast.error(e.message || '操作失败');
    }
  }
}

function openEditor(item?: PointItem) {
  editingItem.value = item ?? null;
  editorOpen.value = true;
}

function openAdjust() {
  adjustNote.value = '';
  adjustDelta.value = 5;
  adjustType.value = 'gain';
  adjustOpen.value = true;
}

async function submitAdjust() {
  const c = selectedChild.value;
  if (!c) return;
  if (!adjustNote.value.trim()) {
    toast.warning('请输入事项');
    return;
  }
  const delta = adjustType.value === 'gain' ? Math.abs(adjustDelta.value) : -Math.abs(adjustDelta.value);
  if (delta === 0) {
    toast.warning('分值不能为0');
    return;
  }
  adjustSaving.value = true;
  try {
    const res = await api.post<{ ok: boolean; newBalance: number; delta: number }>(
      '/point-items/adjust',
      { userId: c.id, delta, note: adjustNote.value.trim() }
    );
    c.total_points = res.newBalance;
    toast.success(`${c.name} ${delta > 0 ? '+' : ''}${delta} 分`);
    adjustOpen.value = false;
  } catch (e: any) {
    toast.error(e.message || '操作失败');
  } finally {
    adjustSaving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="title">积分管理</h1>
        <p class="subtitle">选择小朋友后管理专属加减分项</p>
      </div>
    </header>

    <!-- 小孩选择条 -->
    <div v-if="children.length > 0" class="child-bar">
      <button
        v-for="c in children"
        :key="c.id"
        :class="['child-chip', { active: c.id === selectedChildId }]"
        @click="selectedChildId = c.id"
      >
        <ZodiacAvatar :zodiac="c.avatar" :size="40" />
        <div class="chip-info">
          <span class="chip-name">{{ c.name }}</span>
          <span class="chip-pts">{{ c.total_points }} 分 🌟</span>
        </div>
      </button>
    </div>

    <EmptyState
      v-if="!loading && children.length === 0"
      emoji="🐣"
      text="还没有小朋友"
      hint="去总览页新增一个吧~"
    />

    <template v-else-if="selectedChild">
      <!-- 切换 加分 / 扣分 -->
      <div class="tabs">
        <button :class="{ active: tab === 'gain' }" @click="tab = 'gain'">
          <span class="emoji">🌟</span> 加分项目
        </button>
        <button :class="{ active: tab === 'loss' }" @click="tab = 'loss'">
          <span class="emoji">📉</span> 扣分项目
        </button>
        <button class="add-btn" @click="openEditor()">＋ 自定义项目</button>
      </div>

      <EmptyState
        v-if="visibleItems.length === 0"
        emoji="📭"
        :text="tab === 'gain' ? '还没有加分项' : '还没有扣分项'"
        hint="点击上方「自定义项目」新增"
      />

      <!-- 常规项长条 -->
      <div v-else class="item-list">
        <GlassCard
          v-for="item in visibleItems"
          :key="item.id"
          hover
          padding="10px 14px"
          :class="['item-card', item.type]"
        >
          <div class="item-info" @click="openEditor(item)">
            <span class="item-name">{{ item.name }}</span>
            <span class="item-limit">每日 {{ item.daily_limit === 0 ? '不限' : item.daily_limit + ' 次' }}</span>
          </div>
          <span class="item-edit" @click="openEditor(item)">✏️</span>
          <button
            :class="['apply-btn', item.type]"
            @click="apply(item)"
          >
            {{ item.points > 0 ? '+' : '' }}{{ item.points }}
          </button>
        </GlassCard>
      </div>

      <!-- 底部：临时加减分卡片 -->
      <GlassCard hover padding="16px" class="adjust-card" @click="openAdjust">
        <div class="adjust-inner">
          <span class="adjust-icon">✏️</span>
          <div class="adjust-text">
            <div class="adjust-title">临时加减分</div>
            <div class="adjust-hint">今天临时表现好/不好？记一笔</div>
          </div>
          <span class="adjust-arrow">›</span>
        </div>
      </GlassCard>
    </template>

    <!-- 编辑器 -->
    <PointItemEditor
      v-if="editorOpen"
      v-model="editorOpen"
      :item="editingItem"
      :default-type="tab"
      :owner-id="selectedChildId"
      @saved="loadItems"
    />

    <!-- 临时加减分弹窗 -->
    <Modal
      v-if="adjustOpen"
      :model-value="adjustOpen"
      title="临时加减分"
      @update:model-value="adjustOpen = $event"
    >
      <div class="form">
        <div class="field">
          <label class="label">小朋友</label>
          <div class="selected-child">
            <ZodiacAvatar :zodiac="selectedChild!.avatar" :size="36" />
            <span>{{ selectedChild!.name }}</span>
          </div>
        </div>

        <div class="field">
          <label class="label">类型</label>
          <div class="type-tabs">
            <button type="button" :class="{ active: adjustType === 'gain' }" @click="adjustType = 'gain'">🌟 加分</button>
            <button type="button" :class="{ active: adjustType === 'loss' }" @click="adjustType = 'loss'">📉 扣分</button>
          </div>
        </div>

        <div class="field">
          <label class="label">分值</label>
          <input v-model.number="adjustDelta" type="number" min="1" max="999" />
        </div>

        <div class="field">
          <label class="label">事项</label>
          <input v-model="adjustNote" type="text" maxlength="100" placeholder="如：今天主动洗碗" />
        </div>
      </div>

      <template #footer>
        <span style="flex:1"></span>
        <button class="btn btn-ghost" @click="adjustOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="adjustSaving" @click="submitAdjust">
          {{ adjustSaving ? '提交中...' : '确认' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 16px;
  gap: 12px;
}
.title { font-size: 26px; margin-bottom: 2px; }
.subtitle { color: var(--text-secondary); font-size: 13px; }

.child-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.child-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--r-lg);
  background: var(--glass-bg);
  border: 2px solid transparent;
  transition: all 0.2s;
  flex-shrink: 0;
  cursor: pointer;
}
.child-chip.active {
  border-color: var(--accent-yellow);
  background: rgba(255, 209, 102, 0.15);
}
.chip-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
}
.chip-name {
  font-family: var(--font-cute);
  font-size: 14px;
}
.chip-pts {
  font-size: 11px;
  color: var(--text-muted);
}

.tabs {
  display: flex;
  background: var(--glass-bg);
  border-radius: var(--r-md);
  padding: 4px;
  gap: 4px;
  margin-bottom: 16px;
  align-items: center;
}
.tabs button {
  flex: 1;
  padding: 10px 8px;
  border-radius: var(--r-sm);
  color: var(--text-secondary);
  font-weight: 600;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 14px;
}
.tabs button.active {
  background: var(--glass-bg-strong);
  color: var(--text-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
.tabs .add-btn {
  flex: 0 0 auto;
  background: var(--accent-yellow);
  color: #fff;
  padding: 10px 14px;
  font-size: 13px;
}
.tabs .add-btn:hover {
  filter: brightness(1.05);
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.adjust-card {
  cursor: pointer;
  border: 2px dashed var(--glass-border);
}
.adjust-inner {
  display: flex;
  align-items: center;
  gap: 12px;
}
.adjust-icon {
  font-size: 26px;
}
.adjust-text {
  flex: 1;
}
.adjust-title {
  font-family: var(--font-cute);
  font-size: 16px;
}
.adjust-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.adjust-arrow {
  font-size: 24px;
  color: var(--text-muted);
}
.item-card {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--glass-border);
}
.item-card.gain {
  border-color: rgba(126, 212, 185, 0.35);
  background: linear-gradient(to right, rgba(126, 212, 185, 0.09), #ffffff 50%);
}
.item-card.loss {
  border-color: rgba(255, 155, 176, 0.5);
  background: linear-gradient(to right, rgba(255, 155, 176, 0.12), #ffffff 50%);
}
.item-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  text-align: left;
}
.item-name {
  font-family: var(--font-cute);
  font-size: 15px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-limit {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  display: block;
}
.item-edit {
  font-size: 14px;
  opacity: 0.5;
  cursor: pointer;
  flex-shrink: 0;
}
.apply-btn {
  min-width: 68px;
  padding: 8px 18px;
  border-radius: var(--r-md);
  font-family: var(--font-cute);
  font-size: 18px;
  transition: all 0.15s;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  flex-shrink: 0;
}
.apply-btn:hover { transform: translateY(-1px); }
.apply-btn:active { transform: scale(0.94); }
.apply-btn.gain {
  color: var(--accent-mint);
  background: rgba(126, 212, 185, 0.15);
  border-color: rgba(126, 212, 185, 0.35);
}
.apply-btn.gain:hover {
  background: rgba(126, 212, 185, 0.22);
  box-shadow: 0 6px 18px rgba(126, 212, 185, 0.25);
}
.apply-btn.loss {
  color: var(--accent-pink);
  background: rgba(255, 155, 176, 0.15);
  border-color: rgba(255, 155, 176, 0.35);
}
.apply-btn.loss:hover {
  background: rgba(255, 155, 176, 0.22);
  box-shadow: 0 6px 18px rgba(255, 155, 176, 0.25);
}

.form { display: flex; flex-direction: column; gap: 18px; }
.field { display: flex; flex-direction: column; gap: 8px; }
.label { font-size: 13px; color: var(--text-secondary); padding-left: 4px; }
.selected-child {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--glass-bg);
  border-radius: var(--r-md);
  font-family: var(--font-cute);
}
.type-tabs {
  display: flex;
  background: var(--glass-bg);
  border-radius: var(--r-md);
  padding: 4px;
  gap: 4px;
}
.type-tabs button {
  flex: 1;
  padding: 10px;
  border-radius: var(--r-sm);
  color: var(--text-secondary);
  font-weight: 600;
  transition: all 0.2s;
}
.type-tabs button.active {
  background: var(--glass-bg-strong);
  color: var(--text-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
input {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  font-size: 16px;
  color: var(--text-primary);
  font-family: var(--font-cute);
}
input:focus {
  outline: none;
  border-color: var(--accent-yellow);
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: stretch; }
}
</style>
