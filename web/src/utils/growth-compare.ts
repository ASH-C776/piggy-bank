/**
 * 家长端「多孩子曲线对比」的纯逻辑（R1）。
 *
 * 为什么要单独抽一层：对比模式的正确性有一半不在 UI 上，而在三条**跟数据有关**的规则：
 *   1. 谁的曲线用哪个颜色（要固定，不能随选中顺序漂）
 *   2. 谁不能进图（**没生日就算不出年龄** —— 这一条最要命，见下）
 *   3. 每个孩子要取哪几个点
 * 这三条都能用纯函数表达，也都能用「定数据 → 断结果」的方式测。而 CDP 截图只能证明
 * "画出来了"，证明不了"画对了"。所以先在这里把规则钉死，UI 只负责渲染。
 *
 * 关于「没生日的孩子必须剔除」：X 轴是按年龄对齐的；没有生日就落不到年龄轴上。
 * 如果静默退化成"按记录序号等距"，会画出一张**看起来正常、其实毫无意义**的对比图
 * （两个孩子各自的第 3 次测量被当成同一时刻），比不画更糟。所以这里直接返回
 * `noBirthday` 名单，由 UI 明确告知家长去补生日。
 */

import { ageInYears, calcBmi } from './growth-standards';
import type { GrowthRecord } from './growth';

export type CompareMetric = 'height' | 'weight' | 'bmi';

export interface ChartPoint {
  date: string;
  value: number;
}

export interface CompareSeries {
  /** 孩子 id，也是图例 key */
  key: number;
  name: string;
  birthday: string;
  color: string;
  /** 线型第二重编码：'' = 实线，其余是 stroke-dasharray */
  dash: string;
  /** 已按日期升序 */
  points: ChartPoint[];
}

export interface ExcludedChild {
  id: number;
  name: string;
}

export interface CompareResult {
  series: CompareSeries[];
  /** 没填生日 → 算不出年龄，**必须**剔除（静默退化会产出错误的对比图） */
  noBirthday: ExcludedChild[];
  /** 有生日、但当前指标下一次都没记过 → 不进图例，但也不该说人家"没填生日" */
  noData: ExcludedChild[];
}

/**
 * 固定色序（按最大色差枚举出来的，**不要改成按声明顺序取色**）。
 *
 * 六个取色都来自全站的 `--text-on-*` 加深版：它们对卡片底实测 5.41–6.84:1，
 * 满足非文字图形 ≥3:1 的要求；而 6 个装饰强调色（`--accent-*`）只有 1.44–2.53:1，全部不达标。
 *
 * 为什么这个**顺序**很重要：这一组色里 橙棕↔橄榄 的 ΔE 只有 15、玫红↔正红只有 14，
 * 直接按声明顺序取色，多到第 2、3 个孩子时细线上就分不清了。枚举 720 个排列后，
 * 下面这个顺序让「前 2 / 3 / 4 个色」的最小色差达到 92 / 66 / 56.5（都安全），
 * 代价是**第 5 个开始掉到 15** —— 这正好是下面 `DASH_GROUP_SIZE` 存在的原因。
 */
export const COMPARE_COLORS = [
  '#1a5f9e', // 深蓝（--text-on-sky）
  '#8a6100', // 橄榄（--text-on-yellow）
  '#b83c68', // 玫红（--text-on-pink）
  '#14705a', // 墨绿（--text-on-mint）
  '#94551a', // 橙棕（--text-on-orange）
  '#b0314a', // 正红（--text-on-red）
];

/**
 * 线型档位：第 1 档实线、第 2 档虚线、第 3 档点线。
 *
 * 与 6 色配合后：颜色周期 6、线型每 4 个槽位换一档 → 前 12 个组合两两不同。
 * 「每 4 个换档」不是随手取的：色差枚举显示**第 5 个颜色（下标 4）**开始与前面的色
 * 撞（ΔE 15），而 4 个一档恰好让第 5、6 个孩子落到虚线上，与撞色的那个实线区分开。
 * 同时这也满足无障碍要求：数据系列不能只靠颜色区分。
 */
export const COMPARE_DASHES = ['', '7 4', '2 4'];

export const DASH_GROUP_SIZE = 4;

/**
 * 第 slot 个槽位（按孩子 id 升序）的颜色与线型。
 *
 * 两个下标都要做一次「先加再取模」的归一化：JS 里负数取模会保留负号
 * （`-1 % 3 === -1`），于是 `COMPARE_DASHES[-1]` 静默返回 `undefined`，
 * `stroke-dasharray: undefined` 不报错、只是不生效 —— 线型第二重编码会无声失效。
 * slot 正常是从 0 起的计数器，这里纯属防御，但这类"负数下标 + undefined"最容易漏。
 */
export function compareStyle(slot: number): { color: string; dash: string } {
  const n = COMPARE_COLORS.length;
  const d = COMPARE_DASHES.length;
  const group = Math.floor(slot / DASH_GROUP_SIZE);
  return {
    color: COMPARE_COLORS[((slot % n) + n) % n],
    dash: COMPARE_DASHES[((group % d) + d) % d],
  };
}

/** 单条记录 → 当前指标下的取值；该指标缺数据时返回 null */
export function valueOfRecord(r: GrowthRecord, metric: CompareMetric): number | null {
  if (metric === 'height') return r.height_cm;
  if (metric === 'weight') return r.weight_kg;
  if (r.height_cm == null || r.weight_kg == null) return null;
  return calcBmi(r.height_cm, r.weight_kg);
}

/** 一个孩子的记录 → 当前指标的 (日期, 数值) 升序点列 */
export function pointsFor(records: GrowthRecord[], metric: CompareMetric): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (const r of records) {
    const v = valueOfRecord(r, metric);
    if (v != null) out.push({ date: r.record_date, value: v });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface CompareEntry {
  child: { id: number; name: string; birthday?: string | null };
  records: GrowthRecord[];
}

/**
 * 把并行取回的 N 份 `{child, records}` 组装成对比序列。
 *
 * - **按 `child.id` 升序分配色槽**（不是按请求完成顺序、也不是按数组顺序）：
 *   否则取消重选、或某个请求先回来，颜色就会跳。
 * - 没生日的进 `noBirthday`，当前指标没数据的进 `noData`；两者都不占色槽
 *   （占掉会让图例出现一个永远不画的颜色）。
 */
export function buildCompareSeries(
  entries: CompareEntry[],
  metric: CompareMetric
): CompareResult {
  const sorted = [...entries].sort((a, b) => a.child.id - b.child.id);
  const series: CompareSeries[] = [];
  const noBirthday: ExcludedChild[] = [];
  const noData: ExcludedChild[] = [];
  let slot = 0;
  for (const e of sorted) {
    const who = { id: e.child.id, name: e.child.name };
    if (!e.child.birthday) {
      noBirthday.push(who);
      continue;
    }
    const points = pointsFor(e.records, metric);
    if (!points.length) {
      noData.push(who);
      continue;
    }
    const st = compareStyle(slot++);
    series.push({
      key: e.child.id,
      name: e.child.name,
      birthday: e.child.birthday,
      color: st.color,
      dash: st.dash,
      points,
    });
  }
  return { series, noBirthday, noData };
}

/** 单条序列的年龄跨度（算不出年龄的点直接跳过），空序列返回 null */
export function ageSpanOf(points: ChartPoint[], birthday: string): [number, number] | null {
  const ages: number[] = [];
  for (const p of points) {
    const a = ageInYears(birthday, p.date);
    if (a != null) ages.push(a);
  }
  if (!ages.length) return null;
  return [Math.min(...ages), Math.max(...ages)];
}
