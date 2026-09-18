<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import GlassCard from '@/components/GlassCard.vue';
import EmptyState from '@/components/EmptyState.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import RejectModal from '@/components/RejectModal.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import {
  type ReviewItem,
  mergePending,
  mergeProcessed,
  summarize,
  tagText,
  tagTone,
  summaryOf,
} from '@/utils/review';

/**
 * 审核面板：兑换申请与任务完成申请**混排成一条时间线**。
 *
 * 为什么不再分「兑换 / 任务」两个大 tab：两类申请的家长动作完全一样（看一眼 → 通过 / 拒绝），
 * 拆成两组反而要求家长先判断"这条属于哪一类"再切页。按提交时间倒序混排、每条自带类型标签，
 * 与「待办」的心智模型一致 —— 你要处理的是**一件事**，不是"某一类事"。
 * （合并与排序的规则抽在 utils/review.ts，可用 .workbuddy/review-timeline/ 定数据直测。）
 *
 * 为什么「已处理」默认折叠：它的数据要 4 个请求（后端 status 无 all 选项，
 * 见 server/src/routes/exchange-requests.ts:131 与 adhoc-tasks.ts:181，都是 `WHERE status = ?`），
 * 而绝大多数打开只是来处理待办的。折叠后默认只发 2 个请求，展开才补。
 *
 * 同一份组件同时供「总览页弹窗」与「/parent/review 整页」使用：embedded 时去掉页面级
 * 内边距与标题（弹窗自己已经有标题栏与内边距），其余行为完全一致，避免两处实现漂移。
 */
withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

const toast = useToastStore();

const pending = ref<ReviewItem[]>([]);
const processed = ref<ReviewItem[]>([]);
const loading = ref(true);
const loadingProcessed = ref(false);
const showProcessed = ref(false);
const processingKey = ref<string | null>(null);

const rejectTarget = ref<ReviewItem | null>(null);
const rejectOpen = ref(false);

const confirmOpen = ref(false);
const confirmMessage = ref('');
const confirmAction = ref<(() => Promise<void>) | null>(null);

const summary = computed(() => summarize(pending.value));

async function loadPending() {
  const [ex, tk] = await Promise.all([
    api.get<{ requests: any[] }>('/exchange-requests?status=pending'),
    api.get<{ completions: any[] }>('/adhoc-tasks/completions?status=pending'),
  ]);
  pending.value = mergePending(ex.requests, tk.completions);
}

async function loadProcessed() {
  loadingProcessed.value = true;
  try {
    const [exOk, exNo, tkOk, tkNo] = await Promise.all([
      api.get<{ requests: any[] }>('/exchange-requests?status=approved'),
      api.get<{ requests: any[] }>('/exchange-requests?status=rejected'),
      api.get<{ completions: any[] }>('/adhoc-tasks/completions?status=approved'),
      api.get<{ completions: any[] }>('/adhoc-tasks/completions?status=rejected'),
    ]);
    processed.value = mergeProcessed(exOk.requests, exNo.requests, tkOk.completions, tkNo.completions);
  } finally {
    loadingProcessed.value = false;
  }
}

/** 角标（家长端右下角入口）的数字来自 /dashboard，这里只负责喊它重新拉一次 */
function notifyBadge() {
  window.dispatchEvent(new Event('review:updated'));
}

async function load() {
  loading.value = true;
  try {
    await loadPending();
  } catch (e: any) {
    toast.error(e.message || '加载失败');
  } finally {
    loading.value = false;
    notifyBadge();
  }
}

/** 处理完一条之后：待审核必须重拉；已处理展开着也顺带刷新，否则刚点的那条会消失得莫名其妙 */
async function refresh() {
  await loadPending();
  if (showProcessed.value) await loadProcessed();
  notifyBadge();
}

async function toggleProcessed() {
  showProcessed.value = !showProcessed.value;
  if (showProcessed.value && processed.value.length === 0) {
    try {
      await loadProcessed();
    } catch (e: any) {
      toast.error(e.message || '加载失败');
    }
  }
}

function handleError(e: any) {
  const err = e?.payload?.error;
  if (err === 'already_reviewed') toast.warning('该申请已处理过，正在刷新列表');
  else if (err === 'insufficient_points') toast.error('该小朋友积分不足，兑换未通过');
  else toast.error(e?.message || '操作失败');
}

function askApprove(it: ReviewItem) {
  confirmMessage.value =
    it.kind === 'exchange'
      ? `通过${it.user_name}的兑换申请？将扣除 ${it.points} 积分`
      : `通过${it.user_name}的「${it.task_name}」完成申请？将加 ${it.task_points} 积分`;
  confirmAction.value = () => doApprove(it);
  confirmOpen.value = true;
}

async function doApprove(it: ReviewItem) {
  processingKey.value = it.key;
  try {
    const url =
      it.kind === 'exchange'
        ? `/exchange-requests/${it.id}/approve`
        : `/adhoc-tasks/completions/${it.id}/approve`;
    const res = await api.post<{ ok: boolean; newBalance: number }>(url, {});
    toast.success(
      it.kind === 'exchange'
        ? `已通过，${it.user_name} 剩余 ${res.newBalance} 分`
        : `已通过，${it.user_name} 当前 ${res.newBalance} 分`
    );
    await refresh();
  } catch (e: any) {
    handleError(e);
    // 已处理过的条目还留在列表里，刷新一次让它消失，否则家长会反复点同一个按钮
    if (e?.payload?.error === 'already_reviewed') await refresh();
  } finally {
    processingKey.value = null;
  }
}

function askReject(it: ReviewItem) {
  rejectTarget.value = it;
  rejectOpen.value = true;
}

/**
 * 拒绝原因由 RejectModal 收集后回传。
 * 这里刻意让弹窗只负责"取原因"，请求发往哪个接口由本组件决定 ——
 * 之前的 RejectModal 把兑换接口写死在自己身上，导致任务拒绝只能另走一套
 * ConfirmDialog，而那套里的 taskRejectReason 从未绑定过输入框，
 * 于是**任务拒绝原因恒为空字符串**，小朋友永远看不到为什么被拒。
 */
async function doReject(reason: string) {
  const it = rejectTarget.value;
  if (!it) return;
  processingKey.value = it.key;
  try {
    const url =
      it.kind === 'exchange'
        ? `/exchange-requests/${it.id}/reject`
        : `/adhoc-tasks/completions/${it.id}/reject`;
    await api.post(url, { reason });
    toast.success(
      it.kind === 'exchange' ? '已拒绝，积分已退回' : `已拒绝${it.user_name}的完成申请`
    );
    rejectOpen.value = false;
    await refresh();
  } catch (e: any) {
    handleError(e);
  } finally {
    processingKey.value = null;
  }
}

async function runConfirm() {
  if (confirmAction.value) await confirmAction.value();
  confirmAction.value = null;
}

function fmtTime(ts: number | null) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const diff = Date.now() - ts * 1000;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// 收到新申请推送时，若面板正开着就自动刷新（面板只在弹窗/整页可见时挂载）
function onPush() {
  refresh().catch(() => {});
}

onMounted(() => {
  load();
  window.addEventListener('ws:new_exchange_request', onPush);
  window.addEventListener('ws:task_completion_submitted', onPush);
});

onUnmounted(() => {
  window.removeEventListener('ws:new_exchange_request', onPush);
  window.removeEventListener('ws:task_completion_submitted', onPush);
});
</script>

<template>
  <div :class="embedded ? 'panel' : 'page'">
    <header v-if="!embedded" class="page-header">
      <h1 class="title">审核中心</h1>
      <p class="subtitle">处理小朋友的兑换申请和任务完成申请</p>
    </header>

    <p v-if="!loading && summary.total > 0" class="summary">
      共 <strong>{{ summary.total }}</strong> 条待处理
      <span class="split">兑换 {{ summary.exchange }} · 任务 {{ summary.task }}</span>
    </p>

    <div v-if="loading" class="loading">正在加载…</div>

    <EmptyState
      v-else-if="pending.length === 0"
      emoji="🎉"
      text="没有待审核的申请"
      hint="小朋友提交兑换或完成任务后会出现在这里"
    />

    <!-- 待审核：两类混排，按提交时间倒序 -->
    <div v-else class="list">
      <GlassCard v-for="it in pending" :key="it.key" padding="14px 18px" class="item">
        <div class="head">
          <div class="user">
            <ZodiacAvatar :zodiac="it.user_avatar" :size="44" />
            <div class="who">
              <div class="user-name">{{ it.user_name }}</div>
              <div class="time">{{ fmtTime(it.created_at) }}</div>
            </div>
          </div>
          <span class="tag" :class="tagTone(it)">{{ tagText(it) }}</span>
        </div>

        <div class="detail">
          <template v-if="it.kind === 'exchange'">
            <div class="field">
              <span class="label">{{ it.exType === 'cash' ? '兑换金额' : '商品' }}</span>
              <span v-if="it.exType === 'cash'" class="value cash">{{ it.amount }} 元</span>
              <span v-else class="value with-icon">
                <CategoryIcon :icon="it.product_icon" :size="22" />
                {{ it.product_name || '已删除' }}
              </span>
            </div>
            <div class="field">
              <span class="label">消耗积分</span>
              <span class="value minus">-{{ it.points }} 分</span>
            </div>
          </template>
          <template v-else>
            <div class="field">
              <span class="label">任务</span>
              <span class="value">{{ it.task_name }}</span>
            </div>
            <div class="field">
              <span class="label">奖励积分</span>
              <span class="value plus">+{{ it.task_points }} 分</span>
            </div>
          </template>
        </div>

        <div class="actions">
          <button
            class="btn btn-success small"
            :disabled="processingKey === it.key"
            @click="askApprove(it)"
          >
            {{ processingKey === it.key ? '处理中...' : '✅ 通过' }}
          </button>
          <button
            class="btn btn-danger small"
            :disabled="processingKey === it.key"
            @click="askReject(it)"
          >
            ❌ 拒绝
          </button>
        </div>
      </GlassCard>
    </div>

    <!-- 已处理：默认折叠，展开才请求 -->
    <div class="history">
      <button
        class="history-toggle"
        type="button"
        :aria-expanded="showProcessed ? 'true' : 'false'"
        @click="toggleProcessed"
      >
        <span class="chev" aria-hidden="true">{{ showProcessed ? '▾' : '▸' }}</span>
        {{ showProcessed ? '收起已处理记录' : '查看最近已处理' }}
      </button>

      <div v-if="showProcessed" class="history-body">
        <div v-if="loadingProcessed" class="loading">正在加载…</div>
        <p v-else-if="processed.length === 0" class="empty">还没有已处理的记录</p>
        <div v-else class="list">
          <GlassCard
            v-for="it in processed"
            :key="it.key"
            padding="12px 16px"
            class="item done"
          >
            <div class="head">
              <div class="user">
                <ZodiacAvatar :zodiac="it.user_avatar" :size="36" />
                <div class="who">
                  <div class="user-name">{{ it.user_name }}</div>
                  <div class="time">{{ fmtTime(it.reviewed_at ?? it.created_at) }}</div>
                </div>
              </div>
              <span class="tag" :class="tagTone(it)">{{ tagText(it) }}</span>
            </div>

            <div class="line">
              <span class="what">{{ summaryOf(it) }}</span>
              <span class="pts" :class="it.kind === 'task' ? 'plus' : 'minus'">
                {{ it.kind === 'task' ? '+' : '-' }}{{ it.kind === 'task' ? it.task_points : it.points }} 分
              </span>
            </div>

            <div class="result" :class="it.status">
              <span aria-hidden="true">{{ it.status === 'approved' ? '✅' : '❌' }}</span>
              <span v-if="it.status === 'approved'">已通过</span>
              <span v-else>已拒绝{{ it.reason ? `：${it.reason}` : '（未填原因）' }}</span>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-model="confirmOpen"
      title="确认通过"
      :message="confirmMessage"
      confirmText="通过"
      @confirm="runConfirm"
    />

    <RejectModal
      v-if="rejectTarget"
      v-model="rejectOpen"
      :title="rejectTarget.kind === 'exchange' ? '拒绝兑换申请' : '拒绝任务完成'"
      :hint="
        rejectTarget.kind === 'exchange'
          ? `拒绝后，积分将退回给 ${rejectTarget.user_name}`
          : `拒绝后 ${rejectTarget.user_name} 可以重新提交这个任务`
      "
      :saving="processingKey === rejectTarget.key"
      @submit="doReject"
    />
  </div>
</template>

<style scoped>
.page-header { margin-bottom: var(--space-16); }
.title { font-size: var(--fs-3xl); margin-bottom: var(--space-2); }
.subtitle { color: var(--text-secondary); font-size: var(--fs-sm); }

.summary {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-12);
}
.summary strong {
  color: var(--text-primary);
  font-size: var(--fs-lg);
  font-family: var(--font-cute);
}
.summary .split {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-left: var(--space-8);
}

.loading,
.empty {
  padding: var(--space-24) 0;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.list { display: flex; flex-direction: column; gap: var(--space-12); }

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-10);
  margin-bottom: var(--space-12);
}
.user { display: flex; align-items: center; gap: var(--space-10); min-width: 0; }
.who { min-width: 0; }
.user-name {
  font-family: var(--font-cute);
  font-size: var(--fs-md);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.time { font-size: var(--fs-xs); color: var(--text-muted); }

/* 类型标签：文字一律用 --text-on-*（装饰强调色对白底只有 1.44–2.53:1），
   底色用同色相的浅色 —— 与 B2 定下的「颜色角色不兼职」约定一致 */
.tag {
  flex-shrink: 0;
  padding: var(--space-4) var(--space-10);
  border-radius: var(--r-xs);
  font-size: var(--fs-xs);
  font-weight: 600;
}
.tag.product { background: rgba(132, 197, 255, 0.2); color: var(--text-on-sky); }
.tag.cash { background: rgba(255, 209, 102, 0.2); color: var(--text-on-yellow); }
.tag.task { background: rgba(126, 212, 185, 0.2); color: var(--text-on-mint); }

.detail {
  display: flex;
  gap: var(--space-24);
  padding: var(--space-10) 0;
  border-top: 1px solid var(--glass-border);
  border-bottom: 1px solid var(--glass-border);
  margin-bottom: var(--space-12);
}
.field { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
.label { font-size: var(--fs-xs); color: var(--text-muted); }
.value {
  font-family: var(--font-cute);
  font-size: var(--fs-md);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.value.with-icon { display: inline-flex; align-items: center; gap: var(--space-8); }
.value.cash { color: var(--text-on-yellow); }
.value.minus { color: var(--text-on-red); }
.value.plus { color: var(--text-on-mint); }

.actions { display: flex; gap: var(--space-8); }
.small { padding: var(--space-6) var(--space-14); font-size: var(--fs-sm); }

/* 已处理 */
.history {
  margin-top: var(--space-20);
  padding-top: var(--space-16);
  border-top: 1px solid var(--glass-border);
}
.history-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-8);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  font-weight: 600;
  transition: background var(--dur-fast);
}
.history-toggle:hover { background: var(--glass-bg); }
.chev { font-size: var(--fs-xs); }
.history-body { margin-top: var(--space-12); }

.item.done { opacity: 0.92; }
.line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-12);
  font-size: var(--fs-sm);
}
.what {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pts { font-family: var(--font-cute); font-weight: 700; flex-shrink: 0; }
.pts.plus { color: var(--text-on-mint); }
.pts.minus { color: var(--text-on-red); }

.result {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  font-size: var(--fs-xs);
  padding: var(--space-8) var(--space-12);
  border-radius: var(--r-sm);
  margin-top: var(--space-10);
}
.result.rejected { background: rgba(255, 122, 122, 0.1); color: var(--text-on-red); }
.result.approved { background: rgba(126, 212, 185, 0.1); color: var(--text-on-mint); }
</style>
