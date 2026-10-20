// 中国儿童青少年生长标准（离线内置，无需联网）
//
// 数据来源：
//   1. WS/T 423—2022《7 岁以下儿童生长标准》
//      0~7 岁（<84 月龄）身高 / 体重 / BMI 的 P3~P97 七档百分位，见 growth-standards-07.ts
//   2. WS/T 612—2018《7岁~18岁儿童青少年身高发育等级评价》
//      给出 -2SD / -1SD / 中位数 / +1SD / +2SD，按整岁，男女分表（附录A 表A.1 / 表A.2）
//   3. WS/T 586—2018《学龄儿童青少年超重与肥胖筛查》
//      给出 6.0~18.0 岁半岁一档的 BMI「超重」「肥胖」界值点，男女分列
//
// 注意：
//   - WS/T 612 只覆盖身高（不含 BMI），肥胖筛查必须用 WS/T 586。
//   - 7 岁是两份身高标准的分界（<7 岁用 423，>=7 岁用 612）。两者抽样不同、
//     离散度有差异（423 隐含 SD≈4.8，612 隐含 SD≈6.0），因此 P97 曲线在 7 岁处
//     会有约 5cm 的抬升。这是真实存在的标准差异，代码未做平滑，以保持数据原貌。
//   - 中国没有公开的 7~18 岁体重百分位标准（WS/T 612 只有身高），
//     故 weightPercentile 仅对 <7 岁有效。

import {
  HEIGHT_PCT_0_7,
  WEIGHT_PCT_0_7,
  BMI_PCT_0_7,
  type PctRow,
} from './growth-standards-07';

export type Sex = 'male' | 'female';

/** 身高标准的分界年龄：<7 岁用 WS/T 423，>=7 岁用 WS/T 612 */
export const HEIGHT_STANDARD_SPLIT_AGE = 7;

/** 正态分布下常用百分位对应的 z 值 */
const Z_P3 = -1.880794;
const Z_P10 = -1.281552;
const Z_P25 = -0.67449;
const Z_P50 = 0;
const Z_P75 = 0.67449;
const Z_P90 = 1.281552;
const Z_P97 = 1.880794;

export const PERCENTILE_Z: Array<{ p: number; z: number }> = [
  { p: 3, z: Z_P3 },
  { p: 10, z: Z_P10 },
  { p: 25, z: Z_P25 },
  { p: 50, z: Z_P50 },
  { p: 75, z: Z_P75 },
  { p: 90, z: Z_P90 },
  { p: 97, z: Z_P97 },
];

// ---------------------------------------------------------------------------
// WS/T 612—2018 身高发育等级（单位 cm）
// 每行：[年龄(岁), -2SD, -1SD, 中位数, +1SD, +2SD]
// ---------------------------------------------------------------------------

type HeightSdRow = [number, number, number, number, number, number];

const HEIGHT_SD: Record<Sex, HeightSdRow[]> = {
  male: [
    [7, 113.51, 119.49, 125.48, 131.47, 137.46],
    [8, 118.35, 124.53, 130.72, 136.90, 143.08],
    [9, 122.74, 129.27, 135.81, 142.35, 148.88],
    [10, 126.79, 133.77, 140.76, 147.75, 154.74],
    [11, 130.39, 138.20, 146.01, 153.82, 161.64],
    [12, 134.48, 143.33, 152.18, 161.03, 169.89],
    [13, 143.01, 151.60, 160.19, 168.78, 177.38],
    [14, 150.22, 157.93, 165.63, 173.34, 181.05],
    [15, 155.25, 162.14, 169.02, 175.91, 182.79],
    [16, 157.72, 164.15, 170.58, 177.01, 183.44],
    [17, 158.76, 165.07, 171.39, 177.70, 184.01],
    [18, 158.81, 165.12, 171.42, 177.73, 184.03],
  ],
  female: [
    [7, 112.29, 118.21, 124.13, 130.05, 135.97],
    [8, 116.83, 123.09, 129.34, 135.59, 141.84],
    [9, 121.31, 128.11, 134.91, 141.71, 148.51],
    [10, 126.38, 133.78, 141.18, 148.57, 155.97],
    [11, 132.09, 139.72, 147.36, 154.99, 162.63],
    [12, 138.11, 145.26, 152.41, 159.56, 166.71],
    [13, 143.75, 149.91, 156.07, 162.23, 168.39],
    [14, 146.18, 151.98, 157.78, 163.58, 169.38],
    [15, 147.02, 152.74, 158.47, 164.19, 169.91],
    [16, 147.59, 153.26, 158.93, 164.60, 170.27],
    [17, 147.82, 153.50, 159.18, 164.86, 170.54],
    [18, 148.54, 154.28, 160.01, 165.74, 171.48],
  ],
};

// ---------------------------------------------------------------------------
// WS/T 586—2018 BMI 超重/肥胖筛查界值（单位 kg/m²）
// 每行：[年龄(岁), 超重界值, 肥胖界值]，半岁一档
// ---------------------------------------------------------------------------

type BmiCutoffRow = [number, number, number];

const BMI_CUTOFF: Record<Sex, BmiCutoffRow[]> = {
  male: [
    [6.0, 16.4, 17.7], [6.5, 16.7, 18.1], [7.0, 17.0, 18.7], [7.5, 17.4, 19.2],
    [8.0, 17.8, 19.7], [8.5, 18.1, 20.3], [9.0, 18.5, 20.8], [9.5, 18.9, 21.4],
    [10.0, 19.2, 21.9], [10.5, 19.6, 22.5], [11.0, 19.9, 23.0], [11.5, 20.3, 23.6],
    [12.0, 20.7, 24.1], [12.5, 21.0, 24.7], [13.0, 21.4, 25.2], [13.5, 21.9, 25.7],
    [14.0, 22.3, 26.1], [14.5, 22.6, 26.4], [15.0, 22.9, 26.6], [15.5, 23.1, 26.9],
    [16.0, 23.3, 27.1], [16.5, 23.5, 27.4], [17.0, 23.7, 27.6], [17.5, 23.8, 27.8],
    [18.0, 24.0, 28.0],
  ],
  female: [
    [6.0, 16.2, 17.5], [6.5, 16.5, 18.0], [7.0, 16.8, 18.5], [7.5, 17.2, 19.0],
    [8.0, 17.6, 19.4], [8.5, 18.1, 19.9], [9.0, 18.5, 20.4], [9.5, 19.0, 21.0],
    [10.0, 19.5, 21.5], [10.5, 20.0, 22.1], [11.0, 20.5, 22.7], [11.5, 21.1, 23.3],
    [12.0, 21.5, 23.9], [12.5, 21.9, 24.5], [13.0, 22.2, 25.0], [13.5, 22.6, 25.6],
    [14.0, 22.8, 25.9], [14.5, 23.0, 26.3], [15.0, 23.2, 26.6], [15.5, 23.4, 26.9],
    [16.0, 23.6, 27.1], [16.5, 23.7, 27.4], [17.0, 23.8, 27.6], [17.5, 23.9, 27.8],
    [18.0, 24.0, 28.0],
  ],
};

// ---------------------------------------------------------------------------
// 基础数学工具
// ---------------------------------------------------------------------------

/** 误差函数近似（Abramowitz & Stegun 7.1.26），用于正态分布 CDF */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** 标准正态分布累积函数 Φ(z) */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// 百分位表（WS/T 423—2022）插值工具：在 z 空间做插值，比在百分位空间线性插值
// 更符合正态假设
// ---------------------------------------------------------------------------

const PCT_Z: number[] = PERCENTILE_Z.map((e) => e.z);

/** 月龄序列上插值出该月龄的 7 个百分位值（P3~P97） */
function interpPctRow(rows: readonly PctRow[], months: number): number[] | null {
  if (!rows.length) return null;
  const first = rows[0];
  if (months <= first[0]) return Array.from(first).slice(1) as number[];
  const last = rows[rows.length - 1];
  if (months >= last[0]) return Array.from(last).slice(1) as number[];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (months >= a[0] && months <= b[0]) {
      const t = (months - a[0]) / (b[0] - a[0]);
      const out: number[] = [];
      for (let c = 1; c <= 7; c++) out.push(lerp(a[c], b[c], t));
      return out;
    }
  }
  return null;
}

/**
 * 取某年龄（岁）在 0~7 岁表中的百分位行；超出覆盖范围返回 null。
 * inclusive=true 时允许取到 7 岁整（表末档为 81 月，7 岁按末档数值延伸）。
 * 仅体重/BMI 用它——这两项 7 岁以上没有替代标准，曲线延伸到 7 岁才能和身高曲线
 * 在 X 轴上对齐；身高本身在 7 岁要切到 WS/T 612，所以走 false。
 */
function rowUnder7(
  sex: Sex,
  ageYears: number,
  table: Record<'male' | 'female', readonly PctRow[]>,
  inclusive = false
): number[] | null {
  if (ageYears < 0) return null;
  const limit = HEIGHT_STANDARD_SPLIT_AGE;
  if (inclusive ? ageYears > limit : ageYears >= limit) return null;
  return interpPctRow(table[sex], ageYears * 12);
}

/** 由 7 档百分位值按 z 求测量值；z 超出 P3~P97 时用端点斜率外推 */
function valueAtZ(row7: number[], z: number): number {
  if (z <= PCT_Z[0]) {
    return row7[0] + (row7[1] - row7[0]) * ((z - PCT_Z[0]) / (PCT_Z[1] - PCT_Z[0]));
  }
  if (z >= PCT_Z[6]) {
    return row7[6] + (row7[6] - row7[5]) * ((z - PCT_Z[6]) / (PCT_Z[6] - PCT_Z[5]));
  }
  for (let i = 0; i < PCT_Z.length - 1; i++) {
    if (z >= PCT_Z[i] && z <= PCT_Z[i + 1]) {
      return lerp(row7[i], row7[i + 1], (z - PCT_Z[i]) / (PCT_Z[i + 1] - PCT_Z[i]));
    }
  }
  return row7[3];
}

/** 由测量值反查 z（valueAtZ 的逆运算） */
function zAtValue(row7: number[], v: number): number {
  if (v <= row7[0]) {
    return PCT_Z[0] + (PCT_Z[1] - PCT_Z[0]) * ((v - row7[0]) / (row7[1] - row7[0]));
  }
  if (v >= row7[6]) {
    return PCT_Z[6] + (PCT_Z[6] - PCT_Z[5]) * ((v - row7[6]) / (row7[6] - row7[5]));
  }
  for (let i = 0; i < row7.length - 1; i++) {
    if (v >= row7[i] && v <= row7[i + 1]) {
      return lerp(PCT_Z[i], PCT_Z[i + 1], (v - row7[i]) / (row7[i + 1] - row7[i]));
    }
  }
  return 0;
}

/** 在有序表上按 x 线性插值出整行（除首列外） */
function interpRow(rows: number[][], x: number): number[] | null {
  if (!rows.length) return null;
  if (x <= rows[0][0]) return rows[0].slice(1);
  const last = rows[rows.length - 1];
  if (x >= last[0]) return last.slice(1);
  for (let i = 0; i < rows.length - 1; i++) {
    const cur = rows[i];
    const next = rows[i + 1];
    if (x >= cur[0] && x <= next[0]) {
      const t = (x - cur[0]) / (next[0] - cur[0]);
      const out: number[] = [];
      for (let c = 1; c < cur.length; c++) out.push(lerp(cur[c], next[c], t));
      return out;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 年龄计算
// ---------------------------------------------------------------------------

/** 计算周岁（含小数），birthday 与 onDate 均为 YYYY-MM-DD */
export function ageInYears(birthday: string, onDate: string): number | null {
  const b = new Date(`${birthday}T00:00:00`);
  const d = new Date(`${onDate}T00:00:00`);
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null;
  const years = d.getFullYear() - b.getFullYear();
  const months = d.getMonth() - b.getMonth();
  const days = d.getDate() - b.getDate();
  // 以月为单位的粗略周岁，足够生长曲线使用（误差 < 0.02 岁）
  const totalMonths = years * 12 + months + (days >= 0 ? 0 : -1) + (days >= 0 ? days / 30 : 1 + days / 30);
  return totalMonths / 12;
}

/** 计算月龄（含小数），WS/T 423—2022 的表格按月龄分档 */
export function ageInMonths(birthday: string, onDate: string): number | null {
  const y = ageInYears(birthday, onDate);
  return y === null ? null : y * 12;
}

// ---------------------------------------------------------------------------
// 身高：WS/T 612—2018
// ---------------------------------------------------------------------------

const SD_LEVELS = [-2, -1, 0, 1, 2];

/** 某年龄的 5 档 SD 身高值 [-2SD, -1SD, 中位, +1SD, +2SD]，仅 7~18 岁 */
function heightSdRow(sex: Sex, ageYears: number): number[] | null {
  if (ageYears < HEIGHT_STANDARD_SPLIT_AGE) return null;
  return interpRow(HEIGHT_SD[sex] as unknown as number[][], ageYears);
}

/**
 * 给定 z 值，求对应身高。0~7 岁用 WS/T 423 百分位表，7~18 岁用 WS/T 612 标准差表。
 * 6.75~7 岁之间 423 表已到末档（81 月），按末档数值延伸。
 */
export function heightAtZ(sex: Sex, ageYears: number, z: number): number | null {
  if (ageYears < HEIGHT_STANDARD_SPLIT_AGE) {
    const r = rowUnder7(sex, ageYears, HEIGHT_PCT_0_7);
    return r ? valueAtZ(r, z) : null;
  }
  const row = heightSdRow(sex, ageYears);
  if (!row) return null;
  if (z <= -2) return row[0];
  if (z >= 2) return row[4];
  for (let i = 0; i < SD_LEVELS.length - 1; i++) {
    if (z >= SD_LEVELS[i] && z <= SD_LEVELS[i + 1]) {
      const t = (z - SD_LEVELS[i]) / (SD_LEVELS[i + 1] - SD_LEVELS[i]);
      return lerp(row[i], row[i + 1], t);
    }
  }
  return null;
}

/** 给定身高，反查 z 值 */
export function zOfHeight(sex: Sex, ageYears: number, heightCm: number): number | null {
  if (ageYears < HEIGHT_STANDARD_SPLIT_AGE) {
    const r = rowUnder7(sex, ageYears, HEIGHT_PCT_0_7);
    return r ? zAtValue(r, heightCm) : null;
  }
  const row = heightSdRow(sex, ageYears);
  if (!row) return null;
  if (heightCm <= row[0]) return -2;
  if (heightCm >= row[4]) return 2;
  for (let i = 0; i < row.length - 1; i++) {
    if (heightCm >= row[i] && heightCm <= row[i + 1]) {
      const t = (heightCm - row[i]) / (row[i + 1] - row[i]);
      return lerp(SD_LEVELS[i], SD_LEVELS[i + 1], t);
    }
  }
  return null;
}

/** 身高百分位（0~100），0~18 岁全覆盖 */
export function heightPercentile(sex: Sex, ageYears: number, heightCm: number): number | null {
  const z = zOfHeight(sex, ageYears, heightCm);
  if (z === null) return null;
  return normalCdf(z) * 100;
}

/**
 * 体重百分位。仅 0~7 岁有效——国内没有公开的 7~18 岁体重百分位标准
 * （WS/T 612 只含身高），7 岁以上返回 null。
 */
export function weightPercentile(sex: Sex, ageYears: number, weightKg: number): number | null {
  const r = rowUnder7(sex, ageYears, WEIGHT_PCT_0_7, true);
  return r ? normalCdf(zAtValue(r, weightKg)) * 100 : null;
}

/** BMI 百分位（WS/T 423—2022 表 A.9 / A.10），仅 0~7 岁有效 */
export function bmiPercentile(sex: Sex, ageYears: number, bmi: number): number | null {
  const r = rowUnder7(sex, ageYears, BMI_PCT_0_7, true);
  return r ? normalCdf(zAtValue(r, bmi)) * 100 : null;
}

/** 给定百分位，反查体重视准值（图表画参考带用），仅 0~7 岁 */
export function weightAtPercentile(sex: Sex, ageYears: number, percentile: number): number | null {
  const e = PERCENTILE_Z.find((x) => x.p === percentile);
  const r = rowUnder7(sex, ageYears, WEIGHT_PCT_0_7, true);
  return e && r ? valueAtZ(r, e.z) : null;
}

/** 给定百分位，反查 BMI 标准值（图表画参考带用），仅 0~7 岁 */
export function bmiAtPercentile(sex: Sex, ageYears: number, percentile: number): number | null {
  const e = PERCENTILE_Z.find((x) => x.p === percentile);
  const r = rowUnder7(sex, ageYears, BMI_PCT_0_7, true);
  return e && r ? valueAtZ(r, e.z) : null;
}

// ---------------------------------------------------------------------------
// BMI：WS/T 586—2018
// ---------------------------------------------------------------------------

export type BmiCutoffs = { overweight: number; obesity: number };

/** 某年龄的 BMI 超重/肥胖界值 */
export function bmiCutoffs(sex: Sex, ageYears: number): BmiCutoffs | null {
  if (ageYears < 6) return null;
  const row = interpRow(BMI_CUTOFF[sex] as unknown as number[][], ageYears);
  if (!row) return null;
  return { overweight: row[0], obesity: row[1] };
}

/**
 * BMI 分级。WS/T 586 只定义「超重」「肥胖」两条界值，没有消瘦线，
 * 因此低于超重界值一律归为 normal——不臆造标准，也不对孩子做消瘦定性。
 */
export type BmiLevel = 'normal' | 'overweight' | 'obese';

export function bmiLevel(sex: Sex, ageYears: number, bmi: number): BmiLevel | null {
  const cut = bmiCutoffs(sex, ageYears);
  if (!cut) return null;
  if (bmi >= cut.obesity) return 'obese';
  if (bmi >= cut.overweight) return 'overweight';
  return 'normal';
}

export function calcBmi(heightCm: number, weightKg: number): number | null {
  if (!heightCm || !weightKg || heightCm <= 0) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

// ---------------------------------------------------------------------------
// 供图表使用：生成标准参考曲线采样点
// ---------------------------------------------------------------------------

export type CurvePoint = { age: number; value: number };

/**
 * 生成某条身高百分位曲线在 [ageFrom, ageTo] 区间的采样点，覆盖 0~18 岁。
 * 注意：7 岁处会从 WS/T 423 切到 WS/T 612，两条曲线在此处不连续（真实差异，未平滑）。
 */
export function percentileCurve(
  sex: Sex,
  percentile: number,
  ageFrom: number,
  ageTo: number,
  steps = 60
): CurvePoint[] {
  const zEntry = PERCENTILE_Z.find((e) => e.p === percentile);
  if (!zEntry) return [];
  const from = Math.max(ageFrom, 0);
  const to = Math.min(ageTo, 18);
  if (to < from) return [];
  const out: CurvePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const age = lerp(from, to, i / steps);
    const v = heightAtZ(sex, age, zEntry.z);
    if (v !== null) out.push({ age, value: v });
  }
  return out;
}

/** 体重百分位曲线，仅 0~7 岁 */
export function weightPercentileCurve(
  sex: Sex,
  percentile: number,
  ageFrom: number,
  ageTo: number,
  steps = 60
): CurvePoint[] {
  if (!PERCENTILE_Z.some((x) => x.p === percentile)) return [];
  const from = Math.max(ageFrom, 0);
  const to = Math.min(ageTo, HEIGHT_STANDARD_SPLIT_AGE);
  if (to < from) return [];
  const out: CurvePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const age = lerp(from, to, i / steps);
    const v = weightAtPercentile(sex, age, percentile);
    if (v !== null) out.push({ age, value: v });
  }
  return out;
}

/** BMI 百分位曲线，仅 0~7 岁 */
export function bmiPercentileCurve(
  sex: Sex,
  percentile: number,
  ageFrom: number,
  ageTo: number,
  steps = 60
): CurvePoint[] {
  if (!PERCENTILE_Z.some((x) => x.p === percentile)) return [];
  const from = Math.max(ageFrom, 0);
  const to = Math.min(ageTo, HEIGHT_STANDARD_SPLIT_AGE);
  if (to < from) return [];
  const out: CurvePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const age = lerp(from, to, i / steps);
    const v = bmiAtPercentile(sex, age, percentile);
    if (v !== null) out.push({ age, value: v });
  }
  return out;
}

/** 生成 BMI 超重/肥胖界值曲线（台阶按半岁档） */
export function bmiCutoffCurve(
  sex: Sex,
  kind: 'overweight' | 'obesity',
  ageFrom: number,
  ageTo: number
): CurvePoint[] {
  const idx = kind === 'overweight' ? 1 : 2;
  const rows = BMI_CUTOFF[sex];
  const out: CurvePoint[] = [];
  for (const r of rows) {
    if (r[0] < ageFrom || r[0] > ageTo) continue;
    out.push({ age: r[0], value: r[idx] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 文案（孩子端措辞刻意温和，不做胖瘦定性）
// ---------------------------------------------------------------------------

export function heightPercentileText(percentile: number): string {
  const p = Math.round(percentile);
  return `第 ${p} 百分位`;
}

export function heightLevelText(percentile: number): string {
  if (percentile >= 97) return '长得特别高';
  if (percentile >= 75) return '偏高';
  if (percentile >= 25) return '中等';
  if (percentile >= 3) return '偏矮一点';
  return '需要关注';
}

export function bmiLevelText(level: BmiLevel): string {
  switch (level) {
    case 'normal':
      return '很匀称';
    case 'overweight':
      return '有点超重';
    case 'obese':
      return '超出健康范围';
  }
}

/**
 * 0~7 岁 BMI 百分位的「大白话」写法（家长端用）。
 * 6 岁以下国内没有官方的超重/肥胖界值线，只能按百分位描述，
 * 但「第 N 百分位」对家长不友好，这里直接翻译成胖瘦说法。
 */
export function bmiPercentilePlainText(percentile: number): string {
  if (percentile >= 97) return '偏胖';
  if (percentile >= 85) return '有点壮实';
  if (percentile >= 20) return '匀称';
  if (percentile >= 3) return '偏瘦一点';
  return '偏瘦';
}

/** 把百分位翻译成一句人话：「100 个同龄小朋友里，有 N 个比你瘦」 */
export function percentilePlainSentence(percentile: number, subject = '你'): string {
  const n = Math.round(percentile);
  return `100 个同龄小朋友里，有 ${n} 个比${subject}瘦`;
}

/**
 * 孩子端措辞：不做胖瘦定性。
 * 数据照常展示（家长已选择全开放），但不用「超重/超标」这类评判词；
 * 具体界值与建议只出现在家长端。
 */
export function bmiLevelTextChild(level: BmiLevel): string {
  switch (level) {
    case 'normal':
      return '很匀称';
    case 'overweight':
      return '壮壮的';
    case 'obese':
      return '和爸爸妈妈聊聊吧';
  }
}

/** 孩子端身高描述：同样避开「偏矮」这类负面词 */
export function heightLevelTextChild(percentile: number): string {
  if (percentile >= 97) return '长得特别高';
  if (percentile >= 75) return '高高哒';
  if (percentile >= 25) return '中等个子';
  if (percentile >= 3) return '还在慢慢长';
  return '继续加油长高高';
}
