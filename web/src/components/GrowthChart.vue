<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ageInYears,
  heightPercentile,
  weightPercentile,
  bmiPercentile,
  percentileCurve,
  weightPercentileCurve,
  bmiPercentileCurve,
  bmiCutoffCurve,
  type Sex,
} from '@/utils/growth-standards';
import { fmtAgeLabel } from '@/utils/growth';

/**
 * 手写 SVG 生长曲线图（零依赖）
 *
 * - compact：只画孩子曲线 + P50 中位参考线，整块可点（emit open-detail）
 * - detail ：额外画 P3–P97 / P25–P75 标准带、BMI 超重肥胖界值线、百分位气泡、点选 tooltip
 *
 * X 轴用「年龄（岁）」，由 birthday + 每次测量日期算出；没有生日时退化为「按记录顺序等距」，
 * 此时任何标准曲线都画不出来（标准必须按年龄查）。
 *
 * ## 单序列 / 多序列（R1）
 *
 * 组件被 3 个页面共用：家长端成长页、孩子端成长页、孩子端成长详情。
 * 为了让「家长端多孩子对比」不把另外两个页面一起拖下水，多序列走**新增的 `series` 入参**，
 * 而 `points` 保留为单序列便利入参 —— 内部把 `points` 包成一条 series，**绘图只有一套代码**。
 * 孩子端两个调用点因此零改动，回归面只有「橙色加深」一项（见下）。
 *
 * 多序列时**不再依赖 `birthday` / `sex` 这两个顶层 prop**：每个孩子生日不同，
 * 年龄基准只能逐条序列给（`series[].birthday`）。同时对比模式刻意不画标准带 ——
 * 标准带按单一 sex+birthday 查，多个孩子性别/生日不同，画任何一条都会误导。
 */

type Metric = 'height' | 'weight' | 'bmi';

const props = withDefaults(
  defineProps<{
    metric: Metric;
    /** 实测点，按日期升序传入更省事，组件内部也会再排一次 */
    points: Array<{ date: string; value: number }>;
    sex?: Sex | null;
    birthday?: string | null;
    mode?: 'compact' | 'detail';
    chartHeight?: number;
    /**
     * 图表自身是否充当「点一下看详情」的按钮。
     *
     * 置 false 的唯一场景是它被放进**本身就是 role="button" 的可点击卡片**里
     * （child/Growth.vue）。这时若不禁用，页面上会出现 role="button" 嵌套：
     * 屏幕阅读器把同一块区域念两遍，键盘上也会出现两个做同一件事的停靠点，
     * 且违反 ARIA 关于交互元素不得互相嵌套的约定。
     */
    interactive?: boolean;
    /**
     * 多序列对比（R1）。给了它就忽略 `points` / `birthday` / `sex`。
     * `color` 与 `dash` 由调用方按固定色序分配（见 `@/utils/growth-compare`），
     * 组件不自己挑色 —— 色序要跟孩子 id 绑定，是数据层的规则，不是渲染层的。
     */
    series?: Array<{
      key: string | number;
      name: string;
      color: string;
      /** '' = 实线；其余是 stroke-dasharray（线型第二重编码） */
      dash?: string;
      birthday?: string | null;
      points: Array<{ date: string; value: number }>;
    }>;
    /** 多序列时给屏幕阅读器的一句话摘要 */
    ariaLabel?: string;
  }>(),
  {
    sex: null,
    birthday: null,
    mode: 'compact',
    chartHeight: 190,
    interactive: true,
    series: undefined,
    ariaLabel: undefined,
  }
);

const emit = defineEmits<{ (e: 'open-detail'): void }>();

// SVG 内的 id 必须全页唯一，否则多个实例会互相抢渐变/裁剪
const uid = Math.random().toString(36).slice(2, 8);
const clipId = `gc-clip-${uid}`;

const W = 340;
const PAD = { l: 34, r: 12, t: 18, b: 22 };
const H = computed(() => props.chartHeight);
const plotW = computed(() => W - PAD.l - PAD.r);
const plotH = computed(() => H.value - PAD.t - PAD.b);

const unit = computed(() =>
  props.metric === 'height' ? 'cm' : props.metric === 'weight' ? 'kg' : ''
);

const isMulti = computed(() => (props.series?.length ?? 0) > 0);
/** 有生日才有年龄轴（多序列时上游保证每条都有生日，没有的已被剔除） */
const ageAxis = computed(() => (isMulti.value ? true : !!props.birthday));
/** 有生日 + 性别才画得出标准曲线；对比模式一律不画（标准带无法同时属于多个孩子） */
const hasStd = computed(() => !isMulti.value && !!props.birthday && !!props.sex);
const isDetail = computed(() => props.mode === 'detail');
/** 既是 compact 又未被外层卡片接管时，图表自己才是那个按钮 */
const isButton = computed(() => props.interactive && !isDetail.value);

function shortDate(s: string): string {
  const [, m, d] = s.split('-');
  return `${Number(m)}/${Number(d)}`;
}

interface RenderRow {
  date: string;
  value: number;
  age: number | null;
  seq: number;
  /** X 轴取值：有年龄轴用年龄，否则用记录序号 */
  x: number;
}

interface SeriesRows {
  key: string | number;
  name: string;
  color: string;
  dash: string;
  rows: RenderRow[];
}

const SINGLE_KEY = '__single__';

/** 把单序列与多序列统一成同一份结构 —— 两套绘图代码是这类组件最常见的分叉来源 */
const seriesRows = computed<SeriesRows[]>(() => {
  const src = isMulti.value
    ? props.series!.map((s) => ({
        key: s.key as string | number,
        name: s.name,
        color: s.color,
        dash: s.dash ?? '',
        birthday: s.birthday ?? null,
        points: s.points,
      }))
    : [
        {
          key: SINGLE_KEY as string | number,
          name: '',
          // 单序列的实测线：原先硬编码 #ffb454（对卡片底只有 1.76:1，低于非文字图形 3:1）。
          // 换成同色相加深一档的 --text-on-orange（5.88:1），色相不变、孩子端只深一点。
          color: 'var(--text-on-orange)',
          dash: '',
          birthday: props.birthday,
          points: props.points,
        },
      ];

  return src.map((s) => {
    const ordered = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
    const rows: RenderRow[] = ordered.map((p, i) => {
      const age = s.birthday ? ageInYears(s.birthday, p.date) : null;
      return {
        date: p.date,
        value: p.value,
        age,
        seq: i,
        x: ageAxis.value ? (age ?? i) : i,
      };
    });
    return { key: s.key, name: s.name, color: s.color, dash: s.dash, rows };
  });
});

/** 第一条序列的行 —— 只在「单序列且没生日」的分支里当刻度用 */
const singleRows = computed(() => seriesRows.value[0]?.rows ?? []);

const xDomain = computed<[number, number]>(() => {
  const xs = seriesRows.value.flatMap((s) => s.rows.map((r) => r.x));
  if (!xs.length) return [0, 1];
  let a = Math.min(...xs);
  let b = Math.max(...xs);
  if (ageAxis.value) {
    // 只有一两个点时把视窗撑开，否则曲线会退化成一个点
    if (b - a < 1) {
      const c = (a + b) / 2;
      a = c - 0.5;
      b = c + 0.5;
    }
    const pad = (b - a) * 0.08;
    // 年龄轴不能小于 0：出生当天就是 0 月，若出现负数会把「0月」刻度推到出生前，
    // 导致出生数据点落在刻度右侧，看起来「不对应 0 月」。
    const lo = Math.max(0, a - pad);
    return [lo, b + pad];
  }
  if (b - a < 1) return [a - 0.5, b + 0.5];
  return [a, b];
});

/** 标准百分位曲线采样（当前年龄窗口内），画不出就返回空数组 */
function curveFor(percentile: number): Array<{ age: number; value: number }> {
  if (!hasStd.value || !props.sex) return [];
  const [a, b] = xDomain.value;
  if (props.metric === 'height') return percentileCurve(props.sex, percentile, a, b, 80);
  if (props.metric === 'weight') return weightPercentileCurve(props.sex, percentile, a, b, 80);
  return bmiPercentileCurve(props.sex, percentile, a, b, 80);
}

const bands = computed(() => {
  if (!isDetail.value || !hasStd.value) return null;
  const p3 = curveFor(3);
  const p97 = curveFor(97);
  if (!p3.length || !p97.length) return null;
  return {
    p3,
    p25: curveFor(25),
    p50: curveFor(50),
    p75: curveFor(75),
    p97,
  };
});

/** compact 模式也画一条中位线，给孩子一个「平均水平在哪」的参照 */
const medianLine = computed(() => (hasStd.value ? curveFor(50) : []));

/** BMI 专用：WS/T 586 超重 / 肥胖界值（6~18 岁），0~6 岁这段没有 */
const cutoffs = computed(() => {
  if (!isDetail.value || props.metric !== 'bmi' || !hasStd.value || !props.sex) return null;
  const [a, b] = xDomain.value;
  const ow = bmiCutoffCurve(props.sex, 'overweight', a, b);
  const ob = bmiCutoffCurve(props.sex, 'obesity', a, b);
  if (!ow.length && !ob.length) return null;
  return { ow, ob };
});

const yDomain = computed<[number, number]>(() => {
  const vals: number[] = seriesRows.value.flatMap((s) => s.rows.map((r) => r.value));
  if (bands.value) {
    vals.push(...bands.value.p3.map((p) => p.value), ...bands.value.p97.map((p) => p.value));
  } else {
    vals.push(...medianLine.value.map((p) => p.value));
  }
  if (cutoffs.value) {
    vals.push(...cutoffs.value.ow.map((p) => p.value), ...cutoffs.value.ob.map((p) => p.value));
  }
  if (!vals.length) return [0, 1];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1) {
    const c = (lo + hi) / 2;
    lo = c - 0.5;
    hi = c + 0.5;
  }
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
});

const sx = (x: number): number => {
  const [a, b] = xDomain.value;
  if (b === a) return PAD.l;
  return PAD.l + ((x - a) / (b - a)) * plotW.value;
};

const sy = (y: number): number => {
  const [a, b] = yDomain.value;
  if (b === a) return PAD.t + plotH.value / 2;
  return PAD.t + plotH.value - ((y - a) / (b - a)) * plotH.value;
};

function toLine(pts: Array<{ age: number; value: number }>): string {
  if (!pts.length) return '';
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.age).toFixed(1)} ${sy(p.value).toFixed(1)}`)
    .join(' ');
}

/** 用上下两条曲线围成带状区域（下边界倒序走回来闭合） */
function toBand(
  upper: Array<{ age: number; value: number }>,
  lower: Array<{ age: number; value: number }>
): string {
  if (!upper.length || !lower.length) return '';
  const up = upper
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.age).toFixed(1)} ${sy(p.value).toFixed(1)}`)
    .join(' ');
  const down = [...lower]
    .reverse()
    .map((p) => `L${sx(p.age).toFixed(1)} ${sy(p.value).toFixed(1)}`)
    .join(' ');
  return `${up} ${down} Z`;
}

interface RenderDot {
  cx: number;
  cy: number;
  value: number;
  date: string;
  age: number | null;
  isLast: boolean;
  seriesKey: string | number;
  seriesName: string;
  color: string;
}

/** 每条序列的折线 path 与点 —— 颜色/线型都来自序列自身，不在 CSS 里写死 */
const rendered = computed(() =>
  seriesRows.value.map((s) => {
    const line = s.rows
      .map((r, i) => `${i === 0 ? 'M' : 'L'}${sx(r.x).toFixed(1)} ${sy(r.value).toFixed(1)}`)
      .join(' ');
    const dots: RenderDot[] = s.rows.map((r, i) => ({
      cx: sx(r.x),
      cy: sy(r.value),
      value: r.value,
      date: r.date,
      age: r.age,
      isLast: i === s.rows.length - 1,
      seriesKey: s.key,
      seriesName: s.name,
      color: s.color,
    }));
    return { key: s.key, name: s.name, color: s.color, dash: s.dash, rowCount: s.rows.length, line, dots };
  })
);

/** 摊平后的点，tooltip 的下标就落在这上面（多序列时也只有一个下标空间） */
const allDots = computed(() => rendered.value.flatMap((s) => s.dots));

/** 最新一点的百分位气泡只在单序列下有意义（多序列没有"这一个孩子"） */
const lastDot = computed(() =>
  isMulti.value ? null : (rendered.value[0]?.dots.at(-1) ?? null)
);

const lastPct = computed<number | null>(() => {
  if (isMulti.value || !isDetail.value || !hasStd.value || !props.sex) return null;
  const d = lastDot.value;
  if (!d || d.age == null) return null;
  const p =
    props.metric === 'height'
      ? heightPercentile(props.sex, d.age, d.value)
      : props.metric === 'weight'
        ? weightPercentile(props.sex, d.age, d.value)
        : bmiPercentile(props.sex, d.age, d.value);
  return p === null ? null : Math.round(p);
});

const bubble = computed(() => {
  const d = lastDot.value;
  const p = lastPct.value;
  if (!d || p === null) return null;
  const bw = 30;
  const bh = 16;
  let x = d.cx + 9;
  if (x + bw > W - 2) x = d.cx - bw - 9;
  if (x < 2) x = 2;
  let y = d.cy - bh - 9;
  if (y < 2) y = d.cy + 9;
  if (y + bh > H.value) y = H.value - bh - 2;
  return { x, y, bw, bh, text: `P${p}` };
});

function dotStyle(color: string, isLast: boolean): Record<string, string> {
  return { stroke: color, fill: isLast ? color : '#ffffff' };
}

// --- 坐标轴 ---------------------------------------------------------------

const yTicks = computed(() => {
  const [lo, hi] = yDomain.value;
  const n = 4;
  const step = (hi - lo) / n;
  const decimals = step >= 3 ? 0 : 1;
  return Array.from({ length: n + 1 }, (_, i) => {
    const v = lo + step * i;
    return { y: sy(v), label: v.toFixed(decimals) };
  });
});

const xTicks = computed<Array<{ x: number; label: string }>>(() => {
  const r = singleRows.value;
  if (!ageAxis.value) {
    if (!r.length) return [];
    // 没有生日：直接用记录点当刻度，最多 5 个，避免挤在一起
    const step = Math.max(1, Math.ceil(r.length / 5));
    const out: Array<{ x: number; label: string }> = [];
    for (let i = 0; i < r.length; i += step) {
      out.push({ x: sx(r[i].x), label: shortDate(r[i].date) });
    }
    return out;
  }
  const [a, b] = xDomain.value;
  const n = 3;
  return Array.from({ length: n + 1 }, (_, i) => {
    const v = a + ((b - a) * i) / n;
    return { x: sx(v), label: fmtAgeLabel(v) };
  });
});

// --- 点选 tooltip（仅 detail 模式）----------------------------------------

const active = ref<number | null>(null);

const tip = computed(() => {
  if (!isDetail.value || active.value === null) return null;
  const d = allDots.value[active.value];
  if (!d) return null;
  // 多序列多一行「谁」，所以气泡要宽一些；58×30 是单序列的既有尺寸，不动
  const tw = isMulti.value ? 84 : 58;
  const th = 30;
  let x = d.cx + 10;
  if (x + tw > W - 2) x = d.cx - tw - 10;
  if (x < 2) x = 2;
  let y = d.cy - th - 8;
  if (y < 2) y = d.cy + 10;
  if (y + th > H.value) y = H.value - th - 2;
  return {
    x,
    y,
    tw,
    th,
    line1: `${d.value.toFixed(1)}${unit.value}`,
    line2: isMulti.value ? `${d.seriesName} · ${shortDate(d.date)}` : shortDate(d.date),
  };
});

function onTap() {
  if (isButton.value) emit('open-detail');
}
</script>

<template>
  <div
    class="growth-chart"
    :class="{ clickable: isButton, multi: isMulti }"
    :role="isButton ? 'button' : undefined"
    @click="onTap"
  >
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="svg"
      :role="isMulti ? 'img' : undefined"
      :aria-label="isMulti ? ariaLabel : undefined"
      @pointerleave="active = null"
    >
      <defs>
        <clipPath :id="clipId">
          <rect :x="PAD.l" :y="PAD.t - 4" :width="plotW" :height="plotH + 4" />
        </clipPath>
      </defs>

      <!-- 横向网格 + Y 轴刻度 -->
      <g>
        <line
          v-for="(t, i) in yTicks"
          :key="'g' + i"
          class="grid-line"
          :x1="PAD.l"
          :x2="W - PAD.r"
          :y1="t.y"
          :y2="t.y"
        />
        <text
          v-for="(t, i) in yTicks"
          :key="'t' + i"
          class="axis-text"
          :x="PAD.l - 5"
          :y="t.y + 3"
          text-anchor="end"
        >
          {{ t.label }}
        </text>
      </g>

      <g :clip-path="`url(#${clipId})`">
        <!-- 标准带（detail）：外层 P3–P97，内层 P25–P75。对比模式下 hasStd 恒为 false -->
        <template v-if="bands">
          <path class="band-outer" :d="toBand(bands.p3, bands.p97)" />
          <path class="band-inner" :d="toBand(bands.p25, bands.p75)" />
          <path class="p50-line" :d="toLine(bands.p50)" />
        </template>
        <path v-else-if="medianLine.length" class="p50-line" :d="toLine(medianLine)" />

        <!-- BMI 超重 / 肥胖界值 -->
        <template v-if="cutoffs">
          <path class="cut-line ow" :d="toLine(cutoffs.ow)" />
          <path class="cut-line ob" :d="toLine(cutoffs.ob)" />
        </template>

        <!-- 实测曲线：单序列一条、对比模式 N 条；颜色与线型都随序列走 -->
        <path
          v-for="s in rendered"
          :key="'line-' + s.key"
          class="data-line"
          :d="s.line"
          :stroke-dasharray="s.dash || 'none'"
          :style="{ stroke: s.color }"
        />
      </g>

      <!-- 数据点 -->
      <template v-for="s in rendered" :key="'dots-' + s.key">
        <circle
          v-for="(d, i) in s.dots"
          :key="i"
          class="dot"
          :class="{ last: d.isLast }"
          :cx="d.cx"
          :cy="d.cy"
          :r="d.isLast ? (isMulti ? 3.6 : 4.2) : isMulti ? 2.4 : 3"
          :style="dotStyle(s.color, d.isLast)"
        />
      </template>

      <!-- detail：透明热区，手指点上去出 tooltip -->
      <template v-if="isDetail">
        <circle
          v-for="(d, i) in allDots"
          :key="'hit' + i"
          class="hit"
          :cx="d.cx"
          :cy="d.cy"
          r="13"
          @pointerenter="active = i"
          @pointerdown="active = i"
        />
      </template>

      <!-- 百分位气泡（单序列专有） -->
      <g v-if="bubble" class="bubble">
        <rect
          :x="bubble.x"
          :y="bubble.y"
          :width="bubble.bw"
          :height="bubble.bh"
          rx="8"
          fill="#94551a"
        />
        <text
          :x="bubble.x + bubble.bw / 2"
          :y="bubble.y + bubble.bh / 2 + 3.5"
          text-anchor="middle"
          class="bubble-text"
        >
          {{ bubble.text }}
        </text>
      </g>

      <!-- tooltip -->
      <g v-if="tip" class="tip">
        <rect :x="tip.x" :y="tip.y" :width="tip.tw" :height="tip.th" rx="8" class="tip-bg" />
        <text :x="tip.x + tip.tw / 2" :y="tip.y + 13" text-anchor="middle" class="tip-strong">
          {{ tip.line1 }}
        </text>
        <text :x="tip.x + tip.tw / 2" :y="tip.y + 24" text-anchor="middle" class="tip-dim">
          {{ tip.line2 }}
        </text>
      </g>

      <!-- X 轴刻度 -->
      <text
        v-for="(t, i) in xTicks"
        :key="'x' + i"
        class="axis-text"
        :x="t.x"
        :y="H - 6"
        text-anchor="middle"
      >
        {{ t.label }}
      </text>

      <!-- 没有数据时的兜底文案 -->
      <text v-if="!allDots.length" :x="W / 2" :y="H / 2" class="empty-text" text-anchor="middle">
        还没有数据
      </text>
    </svg>

    <!--
      图例只在对比模式下出现。
      孩子端那两处也用的是这个组件，如果无条件渲染图例，单序列页面会凭空多出一行
      「孩子名字」——那是孩子端可见的回归。所以这里用 v-if="isMulti" 关掉。
      图例用 HTML 而不是 SVG：SVG 里的字会跟 viewBox 一起等比缩放，图例反而会变成图里最小的文字。
    -->
    <div v-if="isMulti" class="chart-legend">
      <span v-for="s in rendered" :key="'lg-' + s.key" class="lg">
        <svg class="lg-swatch" viewBox="0 0 26 8" aria-hidden="true">
          <line
            x1="1"
            y1="4"
            x2="25"
            y2="4"
            :stroke="s.color"
            :stroke-dasharray="s.dash || 'none'"
            stroke-width="2.6"
            stroke-linecap="round"
          />
        </svg>
        {{ s.name }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.growth-chart { width: 100%; }
.growth-chart.clickable { cursor: pointer; }
.svg { width: 100%; height: auto; display: block; overflow: visible; }

.grid-line {
  stroke: rgba(90, 58, 74, 0.1);
  stroke-width: 1;
}
.axis-text {
  fill: rgba(90, 58, 74, 0.5);
  font-size: var(--fs-2xs);
  font-family: var(--font-body);
}

.band-outer { fill: rgba(132, 197, 255, 0.12); }
.band-inner { fill: rgba(132, 197, 255, 0.2); }

/* P50 参考线：原 #9aa6bd 对卡片底只有 2.45:1，低于非文字图形 3:1；
   加深到 #808da4（3.35:1）。刻意保持灰色调、仍是虚线 —— 它必须在视觉上弱于实测线。 */
.p50-line {
  fill: none;
  stroke: #808da4;
  stroke-width: 1.2;
  stroke-dasharray: 4 3;
}

.cut-line {
  fill: none;
  stroke-width: 1.2;
  stroke-dasharray: 5 3;
  opacity: 0.8;
}
/* 原 #ffb454 (1.76:1) / #ff7a7a (2.52:1) 都不达标，换成同色相的加深版 */
.cut-line.ow { stroke: var(--text-on-orange); }
.cut-line.ob { stroke: var(--text-on-red); }

/* stroke 由序列自带（单序列 = --text-on-orange），这里只管形状。
   原来这里是硬编码 #ffb454 —— 1.76:1，B7 那轮只扫了 color: 拿的 token，漏了 SVG 的 stroke。 */
.data-line {
  fill: none;
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dot { stroke-width: 2; }
/* 多序列时点更密（N 条曲线 × 每个测量点），线要细一档、点要小一档才不会糊成一片 */
.growth-chart.multi .data-line { stroke-width: 2.2; }
.growth-chart.multi .dot { stroke-width: 1.5; }

.hit { fill: transparent; cursor: pointer; }

.bubble-text {
  fill: #ffffff;
  font-size: var(--fs-2xs);
  font-weight: 700;
  font-family: var(--font-cute);
}

.tip-bg {
  fill: rgba(255, 255, 255, 0.96);
  stroke: rgba(90, 58, 74, 0.12);
}
.tip-strong {
  fill: #5a3a4a;
  font-size: var(--fs-xs);
  font-weight: 700;
  font-family: var(--font-cute);
}
.tip-dim {
  fill: rgba(90, 58, 74, 0.55);
  font-size: var(--fs-2xs);
  font-family: var(--font-body);
}

.empty-text {
  fill: rgba(90, 58, 74, 0.4);
  font-size: var(--fs-xs);
  font-family: var(--font-cute);
}

.chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6) var(--space-16);
  margin-top: var(--space-8);
  padding: 0 var(--space-2);
}
.chart-legend .lg {
  display: inline-flex;
  align-items: center;
  gap: var(--space-6);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}
.chart-legend .lg-swatch {
  width: 26px;
  height: 8px;
  flex-shrink: 0;
  display: block;
}
</style>
