/**
 * 审核数据层：把「兑换申请」与「任务完成申请」两套接口的返回归一化成同一种形状，
 * 再合并成一条按时间排序的时间线。
 *
 * 为什么单独抽出来：R3 把审核列表从「兑换 / 任务」两个 tab 改成**混排时间线**，
 * 于是"两类数据怎么合并、按什么排、类型标签怎么给"成了这一批最容易悄悄写错的地方
 * （比如按类型分组拼接，看起来也对，但时间顺序全乱了 —— 而这一点在页面上
 * 要等到两类数据同时存在才看得出来）。
 * 抽成纯函数之后可以用 .workbuddy/review-timeline/ 的脚手架定数据直测，不依赖库里的真实数据。
 */

export type ReviewKind = 'exchange' | 'task';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** 两类申请的公共形状；差异字段用可选字段承载，UI 里按 kind 分流渲染 */
export interface ReviewItem {
  /** 列表 key：**必须带类型前缀** —— 兑换与任务的自增 id 各自独立，
      两家都有 id=7 时若直接拿 id 当 key，Vue 会复用错 DOM 节点 */
  key: string;
  kind: ReviewKind;
  id: number;
  user_name: string;
  user_avatar: string;
  status: ReviewStatus;
  created_at: number;
  reviewed_at: number | null;
  reason: string | null;
  /** 兑换类：exType=product 时有 product_*，exType=cash 时有 amount */
  exType?: 'product' | 'cash';
  product_name?: string | null;
  product_icon?: string | null;
  points?: number;
  amount?: number;
  /** 任务类 */
  task_name?: string;
  task_points?: number;
}

/** 已处理列表只展示最近这么多条：再往前的历史没有处理价值，只会把弹窗撑长 */
export const PROCESSED_LIMIT = 30;

export function toExchangeItem(r: any): ReviewItem {
  return {
    key: `exchange:${r.id}`,
    kind: 'exchange',
    id: r.id,
    user_name: r.user_name,
    user_avatar: r.user_avatar,
    status: r.status,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at ?? null,
    reason: r.reason ?? null,
    exType: r.type,
    product_name: r.product_name,
    product_icon: r.product_icon,
    points: r.points,
    amount: r.amount,
  };
}

export function toTaskItem(c: any): ReviewItem {
  return {
    key: `task:${c.id}`,
    kind: 'task',
    id: c.id,
    user_name: c.user_name,
    user_avatar: c.user_avatar,
    status: c.status,
    created_at: c.created_at,
    reviewed_at: c.reviewed_at ?? null,
    reason: c.reason ?? null,
    task_name: c.task_name,
    task_points: c.task_points,
  };
}

export const byCreatedDesc = (a: ReviewItem, b: ReviewItem) => b.created_at - a.created_at;

export const byReviewedDesc = (a: ReviewItem, b: ReviewItem) =>
  (b.reviewed_at ?? b.created_at) - (a.reviewed_at ?? a.created_at);

/**
 * 待审核时间线：两类**混排**后按提交时间倒序。
 * 注意是"先合并再排序"，不是"两类各自排完再首尾相接" —— 后者会把顺序变成
 * 「所有兑换（新的在前）→ 所有任务（新的在前）」，家长就得在两段之间来回找最新的一条。
 */
export function mergePending(exchangeRows: any[], taskRows: any[]): ReviewItem[] {
  return [...exchangeRows.map(toExchangeItem), ...taskRows.map(toTaskItem)].sort(byCreatedDesc);
}

/**
 * 已处理时间线：按处理时间倒序并截断。
 * 后端 `/exchange-requests` 与 `/adhoc-tasks/completions` 的 status 只有
 * pending/approved/rejected 三态、没有 all（都是 `WHERE status = ?`），所以调用方要分别取
 * approved 与 rejected 两次，这里负责接住四个数组。
 * 排序键用 reviewed_at，缺失时退回 created_at（旧数据可能没写 reviewed_at）。
 */
export function mergeProcessed(
  exchangeApproved: any[],
  exchangeRejected: any[],
  taskApproved: any[],
  taskRejected: any[]
): ReviewItem[] {
  return [
    ...exchangeApproved.map(toExchangeItem),
    ...exchangeRejected.map(toExchangeItem),
    ...taskApproved.map(toTaskItem),
    ...taskRejected.map(toTaskItem),
  ]
    .sort(byReviewedDesc)
    .slice(0, PROCESSED_LIMIT);
}

/** 顶部那行汇总文案的数字来源 */
export function summarize(items: ReviewItem[]) {
  return {
    total: items.length,
    exchange: items.filter((i) => i.kind === 'exchange').length,
    task: items.filter((i) => i.kind === 'task').length,
  };
}

/** 类型标签文案：混排之后每条**必须**自带类型标签，否则两类条目长得一样就分不清了 */
export function tagText(it: ReviewItem): string {
  if (it.kind === 'task') return '📋 任务完成';
  return it.exType === 'cash' ? '💵 现金兑换' : '🎁 商品兑换';
}

/** 类型标签的配色档：商品→天空蓝、现金→黄、任务→薄荷 */
export function tagTone(it: ReviewItem): 'product' | 'cash' | 'task' {
  if (it.kind === 'task') return 'task';
  return it.exType === 'cash' ? 'cash' : 'product';
}

/** 已处理条目的一句话摘要（卡片压扁了，不铺两列详情） */
export function summaryOf(it: ReviewItem): string {
  if (it.kind === 'task') return it.task_name || '任务';
  return it.exType === 'cash' ? `${it.amount} 元` : it.product_name || '已删除的商品';
}
