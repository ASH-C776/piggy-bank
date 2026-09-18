/**
 * 成长模块共用的类型与纯计算。
 *
 * 为什么单独抽出来：家长端成长页把「记一次测量」表单和「奖励规则」搬进了两个弹窗（R2），
 * 于是同一份数据要跨 3 个文件流转。如果各自定义一遍接口、各自算一遍「预计得多少分」，
 * 迟早出现「弹窗里预告 +12 分、后端实际发 +10 分」这类算法漂移 —— 家长看到的是预告，
 * 孩子拿到的是另一个数，最难查。所以类型、默认值、区间、纯计算都收敛到这里，只留一个真相。
 */

export interface GrowthChild {
  id: number;
  name: string;
  avatar: string;
  total_points: number;
  birthday?: string | null;
  sex?: string | null;
}

export interface GrowthRecord {
  id: number;
  record_date: string;
  height_cm: number | null;
  weight_kg: number | null;
  grow_cm: number | null;
  awarded: number | null;
  note: string | null;
  created_at: number;
}

/** 成长奖励规则，对应后端 GET/PUT /growth/settings */
export interface GrowthSettings {
  growth_record_reward: number;
  growth_reward_per_cm: number;
}

/** 与后端默认值保持一致；接口读不到时用它兜底，不让页面白等 */
export const DEFAULT_GROWTH_SETTINGS: GrowthSettings = {
  growth_record_reward: 2,
  growth_reward_per_cm: 10,
};

/** 合法区间：录入校验与实时预告共用，避免两处各写一个数 */
export const HEIGHT_MIN = 30;
export const HEIGHT_MAX = 250;
export const WEIGHT_MIN = 2;
export const WEIGHT_MAX = 200;

export function isValidHeight(h: number): boolean {
  return !Number.isNaN(h) && h >= HEIGHT_MIN && h <= HEIGHT_MAX;
}

export function isValidWeight(w: number): boolean {
  return !Number.isNaN(w) && w >= WEIGHT_MIN && w <= WEIGHT_MAX;
}

/** 已保存记录里日期早于 date 的那一条有效身高，也就是「上次量的」 */
export function previousHeightRecord(
  records: GrowthRecord[],
  date: string
): GrowthRecord | null {
  const prev = records
    .filter((r) => r.height_cm != null && r.record_date < date)
    .sort((a, b) => b.record_date.localeCompare(a.record_date))[0];
  return prev ?? null;
}

/**
 * 录入前的实时核算预告：比上次长高多少、这次预计加减多少分。
 * 算法要跟后端对齐：每次记录都给固定分，长高的部分按每厘米算，矮了按同比例扣回。
 * 没有可比的上次记录、或身高不在合法区间时返回 null，UI 就不显示预告。
 */
export function previewGrowthAward(
  height: number | null,
  date: string,
  records: GrowthRecord[],
  settings: GrowthSettings
): { grow: number; award: number } | null {
  if (height == null || !isValidHeight(height)) return null;
  const prev = previousHeightRecord(records, date);
  if (!prev) return null;
  const grow = Number((height - (prev.height_cm as number)).toFixed(1));
  const perCm = Number(settings.growth_reward_per_cm) || 0;
  const perRec = Number(settings.growth_record_reward) || 0;
  const award = perRec + (grow !== 0 ? Math.round(grow * perCm) : 0);
  return { grow, award };
}

/** 同一天已经记过 → 再保存属于覆盖重算，UI 要提前说清楚 */
export function sameDayRecord(
  records: GrowthRecord[],
  date: string
): GrowthRecord | null {
  return records.find((r) => r.record_date === date) ?? null;
}

/** 2026-09-17 → 9月17日 */
export function fmtGrowthDate(s: string): string {
  const [, m, d] = s.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

/**
 * 年龄轴刻度文案：0.5 → 「6月」，1.25 → 「1岁3月」。
 *
 * 原先这段逻辑写在 `GrowthChart.vue` 内部。R1 做多孩子对比时，家长端还要用它
 * 写「这条对比覆盖 0~2岁6月」这类说明，两处各写一遍必然漂移（一个取整方式不同，
 * 图和文案就对不上）。所以提到这里，图和文案共用同一个真相。
 */
export function fmtAgeLabel(v: number): string {
  if (v < 1) return `${Math.max(0, Math.round(v * 12))}月`;
  const y = Math.floor(v);
  const m = Math.round((v - y) * 12);
  if (m >= 12) return `${y + 1}岁`;
  return m === 0 ? `${y}岁` : `${y}岁${m}月`;
}

/** 本地日期 yyyy-mm-dd（不用 toISOString：那是 UTC，东八区晚上会差一天） */
export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
