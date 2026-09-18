<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import GlassCard from '@/components/GlassCard.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import EmptyState from '@/components/EmptyState.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import GrowthChart from '@/components/GrowthChart.vue';
import GrowthRecordModal from '@/components/GrowthRecordModal.vue';
import GrowthSettingsModal from '@/components/GrowthSettingsModal.vue';
import {
  ageInYears,
  heightPercentile,
  heightPercentileText,
  heightLevelText,
  calcBmi,
  bmiLevel,
  bmiCutoffs,
  bmiPercentile,
  bmiLevelText,
  bmiPercentilePlainText,
  percentilePlainSentence,
  type Sex,
} from '@/utils/growth-standards';
import {
  DEFAULT_GROWTH_SETTINGS,
  fmtAgeLabel,
  fmtGrowthDate,
  type GrowthChild,
  type GrowthRecord,
  type GrowthSettings,
} from '@/utils/growth';
import { ageSpanOf, buildCompareSeries } from '@/utils/growth-compare';

const toast = useToastStore();

const children = ref<GrowthChild[]>([]);
const selectedId = ref<number | null>(null);
const records = ref<GrowthRecord[]>([]);
const loading = ref(true);

/** 奖励规则仍由页面持有 —— 录入弹窗要拿它算实时预告的分，只是不再在页面上编辑 */
const settings = ref<GrowthSettings>({ ...DEFAULT_GROWTH_SETTINGS });

/** 两个配置入口：原先它们是页面里的常驻卡片，一屏两张大卡都在跟曲线图抢版面（R2 收进弹窗） */
const recordOpen = ref(false);
const settingsOpen = ref(false);

async function loadSettings() {
  try {
    settings.value = await api.get<GrowthSettings>('/growth/settings');
  } catch {
    // 读不到就用默认值，不阻塞页面
  }
}

/** 规则改完立刻同步到页面：录入弹窗的实时预告用的就是这份值，不能等下次刷新 */
function onSettingsSaved(next: GrowthSettings) {
  settings.value = next;
}

// 删除确认
const confirmOpen = ref(false);
const deletingId = ref<number | null>(null);

// 图表指标切换
type ChartMetric = 'height' | 'weight' | 'bmi';
const chartTabs: Array<{ key: ChartMetric; label: string }> = [
  { key: 'height', label: '身高' },
  { key: 'weight', label: '体重' },
  { key: 'bmi', label: 'BMI' },
];
const chartMetric = ref<ChartMetric>('height');

const selectedChild = computed(
  () => children.value.find((c) => c.id === selectedId.value) ?? null
);

/** 资料未填齐时，百分位/BMI 评估不可用 */
const profileReady = computed(
  () => !!selectedChild.value?.birthday && !!selectedChild.value?.sex
);

/** 最新的两条有效身高，用于算「比上次长高多少」 */
const heightSeries = computed(() =>
  records.value.filter((r) => r.height_cm != null)
);
const latestHeight = computed(() =>
  heightSeries.value.length ? heightSeries.value[heightSeries.value.length - 1] : null
);
const prevHeight = computed(() =>
  heightSeries.value.length > 1 ? heightSeries.value[heightSeries.value.length - 2] : null
);
const growSincePrev = computed(() => {
  if (!latestHeight.value || !prevHeight.value) return null;
  return latestHeight.value.height_cm! - prevHeight.value.height_cm!;
});

const latestWeight = computed(() => {
  for (let i = records.value.length - 1; i >= 0; i--) {
    if (records.value[i].weight_kg != null) return records.value[i];
  }
  return null;
});

/** 当前 BMI：优先用同一次测量的身高，否则退回最新身高 */
const currentBmi = computed(() => {
  const w = latestWeight.value?.weight_kg;
  if (w == null) return null;
  const h = latestHeight.value?.height_cm;
  if (h == null) return null;
  return calcBmi(h, w);
});

const heightEval = computed(() => {
  const c = selectedChild.value;
  const r = latestHeight.value;
  if (!c?.birthday || !c.sex || !r?.height_cm) return null;
  const age = ageInYears(c.birthday, r.record_date);
  if (age == null) return null;
  const p = heightPercentile(c.sex as Sex, age, r.height_cm);
  if (p == null) return null;
  return { percentile: p, text: heightPercentileText(p), level: heightLevelText(p) };
});

const bmiEval = computed(() => {
  const c = selectedChild.value;
  const bmi = currentBmi.value;
  if (!c?.birthday || !c.sex || bmi == null) return null;
  const r = latestWeight.value ?? latestHeight.value;
  if (!r) return null;
  const age = ageInYears(c.birthday, r.record_date);
  if (age == null) return null;
  const cut = bmiCutoffs(c.sex as Sex, age);
  // WS/T 586 只适用 6~18 岁；更小的孩子改用 WS/T 423 的 BMI 百分位。
  // 家长端统一用大白话：6 岁以下给胖瘦说法 + 名次解释，不用「百分位」这类术语。
  if (!cut) {
    const p = bmiPercentile(c.sex as Sex, age, bmi);
    if (p === null) return null;
    return { text: bmiPercentilePlainText(p), sub: percentilePlainSentence(p) };
  }
  const level = bmiLevel(c.sex as Sex, age, bmi);
  if (!level) return null;
  return { text: bmiLevelText(level), sub: `超重线 ${cut.overweight.toFixed(1)}` };
});

const heightPoints = computed(() =>
  heightSeries.value.map((r) => ({ date: r.record_date, value: r.height_cm as number }))
);

const weightPoints = computed(() =>
  records.value
    .filter((r): r is GrowthRecord & { weight_kg: number } => r.weight_kg != null)
    .map((r) => ({ date: r.record_date, value: r.weight_kg }))
);

const bmiPoints = computed(() =>
  records.value
    .map((r) => {
      if (r.height_cm == null || r.weight_kg == null) return null;
      const bmi = calcBmi(r.height_cm, r.weight_kg);
      return bmi === null ? null : { date: r.record_date, value: bmi };
    })
    .filter((x): x is { date: string; value: number } => x !== null)
);

const chartPoints = computed(() =>
  chartMetric.value === 'height'
    ? heightPoints.value
    : chartMetric.value === 'weight'
      ? weightPoints.value
      : bmiPoints.value
);

/** 最后一次测量时的年龄：决定图表画不画得出标准曲线 */
const lastAge = computed<number | null>(() => {
  const c = selectedChild.value;
  const last = records.value.length ? records.value[records.value.length - 1] : null;
  if (!c?.birthday || !last) return null;
  return ageInYears(c.birthday, last.record_date);
});

/** 图下的说明要跟着实际情况变，别在图里没有阴影时还说「阴影 = 常见范围」 */
const chartHint = computed(() => {
  const age = lastAge.value;
  if (chartMetric.value === 'bmi') {
    if (age === null) return '填上生日后才能画标准曲线';
    return age >= 6
      ? '虚线 = WS/T 586 超重 / 肥胖界值 · 点数据点看具体数值'
      : '阴影 = WS/T 423 BMI 百分位范围 · 点数据点看具体数值';
  }
  if (chartMetric.value === 'weight' && age !== null && age >= 7) {
    return '国内没有公开的 7 岁以上体重标准 · 这里只画实测值';
  }
  return '阴影 = P25–P75 同龄常见范围 · 虚线 = P50 平均水平 · 点数据点看具体数值';
});

async function loadChildren() {
  const res = await api.get<{ children: GrowthChild[] }>('/children');
  children.value = res.children;
  if (selectedId.value === null && children.value.length > 0) {
    selectedId.value = children.value[0].id;
  }
}

/**
 * 请求序号 = 竞态守卫。
 *
 * 原来 `watch(selectedId, () => loadRecords())` 没有任何保护：快速点两个小朋友时，
 * 先发出的请求可能后回来，把后发的正确结果覆盖掉，页面就停在错的那份数据上。
 * R1 把对比模式改成**并行 N 个请求**，返回顺序更不确定，所以必须补上这层。
 * 规则很简单：每次发起请求先自增并记下自己的序号，回来时若序号已不是最新就直接丢弃。
 */
let loadSeq = 0;

async function loadRecords() {
  const seq = ++loadSeq;
  if (selectedId.value === null) {
    records.value = [];
    return;
  }
  const res = await api.get<{ child: GrowthChild; records: GrowthRecord[] }>(
    `/growth/children/${selectedId.value}/records`
  );
  if (seq !== loadSeq) return;
  records.value = res.records;
}

// --- R1 多孩子对比 ---------------------------------------------------------

/**
 * 对比模式。
 *
 * 用独立的布尔量而不是把 `selectedId` 扩成 `number | 'all'`：后者会让页面里每一处
 * `c.id === selectedId`、`records` 相关判断都要跟着改成联合类型，改动面大得多；
 * 而且"对比"和"选中某个孩子"本来就是互斥的两种状态，用两个量表达更贴事实。
 */
const compareMode = ref(false);
/** 并行取回的 N 份数据；某一家的请求失败就少一条曲线，不让整页挂掉 */
const compareData = ref<Array<{ child: GrowthChild; records: GrowthRecord[] }>>([]);
const compareFailed = ref<string[]>([]);

/** 能进对比的孩子数（没生日的算不出年龄，进不了）；用来在入口上给出诚实的数字 */
const comparableCount = computed(() => children.value.filter((c) => c.birthday).length);

const compare = computed(() => buildCompareSeries(compareData.value, chartMetric.value));
const compareSeries = computed(() => compare.value.series);

async function loadCompare() {
  const seq = ++loadSeq;
  const list = [...children.value];
  const results = await Promise.all(
    list.map((c) =>
      api
        .get<{ child: GrowthChild; records: GrowthRecord[] }>(`/growth/children/${c.id}/records`)
        .then((r) => ({ ok: true as const, name: c.name, r }))
        .catch(() => ({ ok: false as const, name: c.name }))
    )
  );
  if (seq !== loadSeq) return;
  compareData.value = results.filter((x) => x.ok).map((x) => ({ child: x.r.child, records: x.r.records }));
  compareFailed.value = results.filter((x) => !x.ok).map((x) => x.name);
}

async function reload() {
  if (compareMode.value) await loadCompare();
  else await loadRecords();
}

watch([selectedId, compareMode], reload);

async function load() {
  loading.value = true;
  try {
    await loadChildren();
    await reload();
    await loadSettings();
  } finally {
    loading.value = false;
  }
}

/** 点某个孩子 = 退出对比模式，回到单人视图 */
function selectChild(c: GrowthChild) {
  compareMode.value = false;
  selectedId.value = c.id;
}

function startCompare() {
  compareMode.value = true;
}

/** 对比模式下的排除说明：没生日的与当前指标没数据的，必须**明确告知**，不能静默少画 */
const compareExcluded = computed(() => {
  const parts: string[] = [];
  const nb = compare.value.noBirthday;
  if (nb.length) {
    parts.push(
      `⚠️ ${nb.map((c) => c.name).join('、')} 还没填生日，算不出年龄、进不了对比 —— 去「总览 → 账号管理 → 编辑」补上`
    );
  }
  const nd = compare.value.noData;
  if (nd.length) {
    parts.push(`${nd.map((c) => c.name).join('、')} 在这个指标下还没有记录，暂时没有曲线`);
  }
  if (compareFailed.value.length) {
    parts.push(`⚠️ ${compareFailed.value.join('、')} 的数据没取到，请刷新页面重试`);
  }
  return parts;
});

const compareMetricLabel = computed(
  () => chartTabs.find((t) => t.key === chartMetric.value)?.label ?? ''
);

/** 对比图给屏幕阅读器的一句话摘要（SVG 本身读不出多条曲线） */
const compareAria = computed(() => {
  const s = compareSeries.value;
  if (!s.length) return '多孩子成长曲线对比';
  const spans = s
    .map((x) => ageSpanOf(x.points, x.birthday))
    .filter((x): x is [number, number] => x !== null);
  const span =
    spans.length > 0
      ? spans.reduce((acc, cur) => [Math.min(acc[0], cur[0]), Math.max(acc[1], cur[1])] as [number, number])
      : null;
  const head = `${s.map((x) => x.name).join('、')}的${compareMetricLabel.value}对比曲线`;
  const points = `每条曲线分别有 ${s.map((x) => x.points.length).join('、')} 个测量点`;
  const axis = span ? `，横轴按年龄对齐，范围 ${fmtAgeLabel(span[0])} 到 ${fmtAgeLabel(span[1])}` : '';
  return `${head}，${points}${axis}`;
});

// --- 其它 -----------------------------------------------------------------

const compareEmptyText = computed(() =>
  comparableCount.value < 2
    ? '至少要 2 个填了生日的小朋友，才能按年龄对比'
    : `还没有 2 个小朋友同时记过${compareMetricLabel.value}`
);

const compareChartHint = computed(() => {
  const s = compareSeries.value;
  if (!s.length) return '';
  // 只有一条曲线时不要给"对比"的话术（图例里本就只有一个名字），
  // 也别留空 —— 空 hint 会让家长以为这块还在加载。
  if (s.length === 1) return `现在只有 ${s[0].name} 一个人有数据，先画出这一条 · 点数据点看具体数值`;
  const spans = s
    .map((x) => ageSpanOf(x.points, x.birthday))
    .filter((x): x is [number, number] => x !== null);
  const span =
    spans.length > 0
      ? spans.reduce((acc, cur) => [Math.min(acc[0], cur[0]), Math.max(acc[1], cur[1])] as [number, number])
      : null;
  const range = span ? `，覆盖 ${fmtAgeLabel(span[0])}~${fmtAgeLabel(span[1])}` : '';
  return `颜色与线型对应图例里的每位小朋友 · 横轴按年龄对齐${range} · 点数据点看具体数值`;
});

function askDelete(id: number) {
  deletingId.value = id;
  confirmOpen.value = true;
}

async function doDelete() {
  if (deletingId.value === null) return;
  const id = deletingId.value;
  try {
    const res = await api.delete<{ ok: boolean; refunded: number }>(`/growth/records/${id}`);
    const refunded = res.refunded ?? 0;
    toast.success(
      refunded === 0
        ? '已删除该条记录'
        : refunded > 0
          ? `已删除，并收回 ${refunded} 分`
          : `已删除，并补回 ${Math.abs(refunded)} 分`
    );
    await load();
  } catch (e: any) {
    toast.error(e.message || '删除失败');
  } finally {
    deletingId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="title">成长记录</h1>
        <p class="subtitle">记录身高体重，对照中国儿童生长标准看百分位</p>
      </div>
      <!-- 两个低频入口收到 header 右侧，与「总览」页的「账号管理」按钮同一位置、同一模式。
           主次分明：测量是每周都做的动作给主按钮，奖励规则几个月才碰一次给次要按钮。
           没选中小朋友（或一个都没建）时禁用，避免点开一个不知道记给谁的弹窗。
           对比模式下也禁用：一次测量只能属于一个孩子，那时"记给谁"是没有答案的 ——
           对比模式说明卡里写了怎么退出。 -->
      <div class="header-actions">
        <button class="btn btn-ghost" @click="settingsOpen = true">⚙️ 奖励规则</button>
        <button
          class="btn btn-primary"
          :disabled="!selectedChild || compareMode"
          @click="recordOpen = true"
        >
          记一次测量
        </button>
      </div>
    </header>

    <!-- 小孩选择条：R1 起「对比全部」也是这一条里的一个选项 —— 它不是一个新页面、
         也不是弹窗，而是这个页面的一种状态，所以入口跟切换孩子放在同一层级。

         孩子列表要独立滚动，而「对比全部」必须**钉在行尾不跟着滚**：
         原来三者同处一个 overflow-x:auto 容器里，孩子一多（或屏幕一窄）它就被推到
         视口外 —— 430px 宽的手机上实测跑到了 x=302~436（屏幕 430），
         入口被藏起来了却没有任何提示，家长只会以为没有这个功能。
         现在 .child-scroll 负责滚动、外面这层用 flex 把入口留在最后。 -->
    <div v-if="children.length > 0" class="child-bar">
      <div class="child-scroll">
        <button
          v-for="c in children"
          :key="c.id"
          :class="['child-chip', { active: !compareMode && c.id === selectedId }]"
          @click="selectChild(c)"
        >
          <ZodiacAvatar :zodiac="c.avatar" :size="40" />
          <!-- 只留名字：这里的功能是「选谁」，分数是积分页的信息，放在这儿只会
               把 chip 撑宽、让孩子条更早开始横向滚动（「对比全部」就更靠外）。 -->
          <span class="chip-name">{{ c.name }}</span>
        </button>
      </div>

      <!-- 只有一个孩子时不给这个入口：没有可比的对象，多一个按钮只会让人点进来看空图。
           手机上孩子 chip 本身就占了大半行，这里只留「对比」两个字的小胶囊；
           人数收到 aria-label 里 —— 可见文案极简，读屏器仍知道有几个人可比。 -->
      <template v-if="children.length > 1">
        <span class="chip-sep" aria-hidden="true"></span>
        <button
          :class="['compare-chip', { active: compareMode }]"
          :aria-pressed="compareMode"
          :aria-label="`对比全部（${comparableCount} 个小朋友）`"
          @click="startCompare"
        >
          对比
        </button>
      </template>
    </div>

    <EmptyState
      v-if="!loading && children.length === 0"
      emoji="🐣"
      text="还没有小朋友"
      hint="去「总览 → 账号管理」新增一个吧~"
    />

    <template v-else-if="selectedChild">
      <!-- 对比模式说明：把「为什么少了标准带、为什么少了统计卡」当场讲清楚 -->
      <GlassCard v-if="compareMode" padding="14px 16px" class="compare-note">
        <div class="cn-title">📊 正在对比 {{ compareSeries.length }} 个小朋友的{{ compareMetricLabel }}</div>
        <p class="cn-line">
          横轴已按<b>年龄</b>对齐 —— 生日不同，只有按月龄比才有意义；标准范围不显示，因为每个孩子的性别和生日不同，没法共用一条标准带。
        </p>
        <p v-for="(t, i) in compareExcluded" :key="i" class="cn-warn">{{ t }}</p>
        <p class="cn-line muted">想单独记录或看历史，点上面某个小朋友即可退出对比。</p>
      </GlassCard>

      <!-- 资料未填齐提示 -->
      <GlassCard v-if="!profileReady && !compareMode" padding="14px 16px" class="warn-card">
        <span class="warn-icon">⚠️</span>
        <div class="warn-text">
          <div class="warn-title">还没填生日或性别</div>
          <div class="warn-hint">
            在「总览 → 账号管理 → 编辑」补上这两项，才能算出身高百分位和 BMI 评估
          </div>
        </div>
      </GlassCard>

      <!-- 当前数据概览：这三张卡是「单个孩子」的概念，对比模式下没有归属，整块隐藏 -->
      <div v-if="!compareMode" class="stat-row">
        <GlassCard padding="14px 16px" class="stat-card">
          <div class="stat-label">身高</div>
          <div class="stat-value">
            {{ latestHeight ? latestHeight.height_cm!.toFixed(1) : '--' }}
            <span class="unit">cm</span>
          </div>
          <div v-if="heightEval" class="stat-sub">{{ heightEval.text }} · {{ heightEval.level }}</div>
          <div v-else-if="growSincePrev !== null" class="stat-sub">
            比上次 +{{ growSincePrev.toFixed(1) }}cm
          </div>
          <div v-else class="stat-sub muted">暂无数据</div>
        </GlassCard>

        <GlassCard padding="14px 16px" class="stat-card">
          <div class="stat-label">体重</div>
          <div class="stat-value">
            {{ latestWeight ? latestWeight.weight_kg!.toFixed(1) : '--' }}
            <span class="unit">kg</span>
          </div>
          <div v-if="currentBmi !== null" class="stat-sub">BMI {{ currentBmi.toFixed(1) }}</div>
          <div v-else class="stat-sub muted">暂无数据</div>
        </GlassCard>

        <GlassCard padding="14px 16px" class="stat-card">
          <div class="stat-label">体型评估</div>
          <div class="stat-value small">{{ bmiEval ? bmiEval.text : '--' }}</div>
          <div v-if="bmiEval" class="stat-sub">{{ bmiEval.sub }}</div>
          <div v-else class="stat-sub muted">需填生日性别</div>
        </GlassCard>
      </div>

      <!-- 生长曲线：阴影是同龄标准范围，橙线是孩子的实测值。
           对比模式下同一块图换成多序列（不画标准带、横轴改按年龄）。 -->
      <GlassCard padding="16px 12px 8px" class="chart-card">
        <div class="chart-head">
          <span class="chart-title">📈 {{ compareMode ? '成长曲线对比' : '生长曲线' }}</span>
          <div class="chart-tabs">
            <button
              v-for="t in chartTabs"
              :key="t.key"
              :class="{ active: chartMetric === t.key }"
              @click="chartMetric = t.key"
            >
              {{ t.label }}
            </button>
          </div>
        </div>
        <GrowthChart
          v-if="compareMode ? compareSeries.length > 0 : chartPoints.length > 0"
          :metric="chartMetric"
          :points="compareMode ? [] : chartPoints"
          :series="compareMode ? compareSeries : undefined"
          :sex="compareMode ? null : ((selectedChild?.sex as Sex | null) ?? null)"
          :birthday="compareMode ? null : (selectedChild?.birthday ?? null)"
          :aria-label="compareMode ? compareAria : undefined"
          mode="detail"
          :chart-height="compareMode ? 280 : 240"
        />
        <p v-else class="chart-empty">
          {{ compareMode ? compareEmptyText : `还没有${compareMetricLabel}数据` }}
        </p>
        <p class="chart-hint">{{ compareMode ? compareChartHint : chartHint }}</p>
      </GlassCard>

      <!--
        历史记录：和上面三张统计卡一样，是「单个孩子」的概念 —— 对比模式下没有归属，整块隐藏。
        （录入表单与奖励规则原来常驻在这个位置，R2 已收进弹窗；连带改过下面空状态的文案：
        它原本写「用上面的表单记下第一次吧」，表单搬走后就成了指向不存在的东西 ——
        这类"搬走宿主却没改引用"最容易漏。）
      -->
      <template v-if="!compareMode">
        <h2 class="section-title">历史记录</h2>
        <EmptyState
          v-if="!loading && records.length === 0"
          emoji="📏"
          :text="`还没有${selectedChild.name}的测量记录`"
          hint="点右上角「记一次测量」记下第一次吧~"
        />
        <div v-else class="record-list">
        <GlassCard
          v-for="r in [...records].reverse()"
          :key="r.id"
          padding="12px 14px"
          class="record-item"
        >
          <div class="r-date">{{ fmtGrowthDate(r.record_date) }}</div>
          <div class="r-values">
            <span v-if="r.height_cm != null" class="r-val">📏 {{ r.height_cm.toFixed(1) }} cm</span>
            <span v-if="r.weight_kg != null" class="r-val">⚖️ {{ r.weight_kg.toFixed(1) }} kg</span>
            <span
              v-if="r.grow_cm != null"
              :class="['r-tag', r.grow_cm > 0 ? 'up' : r.grow_cm < 0 ? 'down' : 'flat']"
            >
              {{ r.grow_cm > 0 ? '↑' : r.grow_cm < 0 ? '↓' : '=' }}
              {{ Math.abs(r.grow_cm).toFixed(1) }}cm
            </span>
            <span
              v-if="r.awarded != null"
              :class="['r-tag', r.awarded >= 0 ? 'up' : 'down']"
            >
              {{ r.awarded >= 0 ? '+' : '−' }}{{ Math.abs(r.awarded) }}分
            </span>
          </div>
          <div class="r-right">
            <span v-if="r.note" class="r-note">{{ r.note }}</span>
            <button class="icon-btn del" title="删除" @click="askDelete(r.id)">🗑️</button>
          </div>
        </GlassCard>
      </div>
    </template>
    <!-- ↑ 关闭 v-if="!compareMode"（历史记录）；↓ 关闭 v-else-if="selectedChild"，
         之后三个弹窗跟原来一样挂在这层之外 —— 它们是页面级的（不随选中/对比切换），
         放错位置会变成"没选中小朋友时压根渲染不出确认框"。 -->
    </template>

    <ConfirmDialog
      v-model="confirmOpen"
      variant="danger"
      title="删除记录"
      message="确定删除这条测量记录吗？删除后无法恢复。"
      confirm-text="删除"
      @confirm="doDelete"
    />

    <!-- 两个配置弹窗：v-if 挂载 + 内部 watch 用 immediate，二者必须配套
         （组件创建时 modelValue 已是 true，非 immediate 的 watch 等不到那次跳变） -->
    <GrowthRecordModal
      v-if="recordOpen"
      v-model="recordOpen"
      :child="selectedChild"
      :records="records"
      :settings="settings"
      @saved="load"
    />
    <GrowthSettingsModal
      v-if="settingsOpen"
      v-model="settingsOpen"
      :settings="settings"
      @saved="onSettingsSaved"
    />
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: var(--space-12);
  margin-bottom: var(--space-16);
}
.title { font-size: var(--fs-3xl); margin-bottom: var(--space-2); }
.subtitle { color: var(--text-secondary); font-size: var(--fs-sm); }
/* 与「总览」页 header 的账号管理按钮同位置同模式，不发明新的按钮位 */
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  flex-shrink: 0;
}

.child-bar {
  display: flex;
  align-items: stretch;
  gap: var(--space-8);
  margin-bottom: var(--space-16);
  padding-bottom: var(--space-4);
}
/* 孩子列表自己滚；min-width:0 是关键 —— flex 子项默认 min-width:auto，
   内容再宽也不肯收缩，会让整行把「对比全部」顶出屏幕（这正是原来被顶出去的原因）。 */
.child-scroll {
  display: flex;
  gap: var(--space-8);
  overflow-x: auto;
  flex: 1 1 auto;
  min-width: 0;
  padding-bottom: var(--space-2);
}
.child-chip {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-8) var(--space-12);
  border-radius: var(--r-lg);
  background: var(--glass-bg);
  border: 2px solid transparent;
  transition: all var(--dur-base);
  flex-shrink: 0;
  cursor: pointer;
}
.child-chip.active {
  border-color: var(--accent-yellow);
  background: rgba(255, 209, 102, 0.15);
}
.chip-name { font-family: var(--font-cute); font-size: var(--fs-md); }
/* .chip-info / .chip-pts 已随「对比全部」的副行一起删掉：孩子 chip 只剩名字一行，
   对比入口收成两个字的小胶囊，两个类都不再有宿主 —— 别留死样式。 */

/* 「对比全部」与孩子头像之间要有一道分隔：它不是一个孩子，并排会让人以为
   还有第 N+1 个小朋友。竖向短线比留白更明确，且不会在横向滚动时被误当间隙。 */
.chip-sep {
  width: 1px;
  align-self: stretch;
  margin: var(--space-2) var(--space-4);
  background: var(--glass-border);
  flex-shrink: 0;
}
/* 「对比」入口：一颗小胶囊，与孩子 chip 的高度解耦（align-self:center），
   不参与横向滚动 —— 孩子再多它也停在行尾。
   不用 child-chip 类：那个类的尺寸是按「头像卡」设计的，塞两个字会虚胖一大圈，
   而这里要的是"不抢孩子位置"。 */
.compare-chip {
  flex-shrink: 0;
  align-self: center;
  padding: var(--space-8) var(--space-16);
  border: 2px solid transparent;
  border-radius: var(--r-pill);
  background: var(--glass-bg);
  font-family: var(--font-cute);
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text-primary);
  transition: all var(--dur-base);
  cursor: pointer;
}
.compare-chip:hover { background: var(--glass-bg-strong); }
.compare-chip.active {
  /* 与孩子 chip 的黄色 active 区分开：对比是一个「模式」而不是「选中某个人」，
     用粉色系呼应统计/图表的主色，避免两者看起来是同一组互斥选项里的两个。 */
  border-color: var(--accent-pink);
  background: rgba(255, 155, 176, 0.18);
}

/* 对比模式说明卡：这一块是**解释性**的，不是提示条。
   它要回答三个"为什么少了"：为什么没标准带、为什么没统计卡/历史、为什么少了几条曲线。
   少任何一条，家长看到的就是「功能坏了」而不是「设计如此」。 */
.compare-note { margin-bottom: var(--space-14); border: 1px solid var(--glass-border); }
.cn-title { font-family: var(--font-cute); font-size: var(--fs-md); margin-bottom: var(--space-6); }
.cn-line { font-size: var(--fs-xs); color: var(--text-secondary); line-height: 1.65; }
.cn-line.muted { color: var(--text-muted); margin-top: var(--space-6); }
/* 警告行是**小字号文字**，不能用 --danger(#ff7a7a, 2.53:1)。
   main.css 里功能色的约定就是：做文字一律改 --text-on-*，所以这里取
   --text-on-red(#b0314a, 6.21:1)，色相仍是"警告红"，只是压暗到能读。 */
.cn-warn {
  font-size: var(--fs-xs);
  color: var(--text-on-red);
  line-height: 1.65;
  margin-top: var(--space-4);
}

.warn-card {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  margin-bottom: var(--space-14);
  border: 1px dashed rgba(255, 180, 84, 0.5);
}
.warn-icon { font-size: var(--fs-2xl); flex-shrink: 0; }
.warn-title { font-family: var(--font-cute); font-size: var(--fs-md); }
.warn-hint { font-size: var(--fs-xs); color: var(--text-muted); margin-top: var(--space-2); line-height: 1.5; }

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-10);
  margin-bottom: var(--space-14);
}
.stat-card { text-align: center; border: 1px solid var(--glass-border); }
.stat-label { font-size: var(--fs-xs); color: var(--text-muted); }
.stat-value {
  font-family: var(--font-cute);
  font-size: var(--fs-3xl);
  line-height: 1.2;
  margin: var(--space-2) 0;
}
.stat-value.small { font-size: var(--fs-xl); padding: var(--space-4) 0; }
.unit { font-size: var(--fs-xs); color: var(--text-muted); }
.stat-sub { font-size: var(--fs-xs); color: var(--text-secondary); }
.stat-sub.muted { color: var(--text-muted); }

.chart-card { margin-bottom: var(--space-18); }
.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-8);
  padding: 0 var(--space-2);
  gap: var(--space-10);
}
.chart-title { font-family: var(--font-cute); font-size: var(--fs-md); }
.chart-tabs {
  display: flex;
  gap: var(--space-4);
  background: var(--glass-bg);
  border-radius: var(--r-pill);
  padding: var(--space-4);
}
.chart-tabs button {
  padding: var(--space-6) var(--space-12);
  border-radius: var(--r-pill);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  font-weight: 600;
  transition: all var(--dur-base);
}
.chart-tabs button.active {
  background: var(--accent-orange);
  color: #fff;
}
.chart-empty {
  text-align: center;
  padding: var(--space-32) 0;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
.chart-hint {
  margin-top: var(--space-6);
  text-align: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  line-height: 1.6;
}

.section-title { font-size: var(--fs-lg); margin: var(--space-18) 0 var(--space-12); }

/* 录入表单与奖励规则的样式已随组件搬到 GrowthRecordModal / GrowthSettingsModal。
   注意 .form-card / .form-grid / .field / .label / input / .preview / .set-* 全部删掉了：
   scoped 样式留在原文件里不会报错、也不会被引用，是最容易残留的死代码。 */

.record-list { display: flex; flex-direction: column; gap: var(--space-8); }
.record-item {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  border: 1px solid var(--glass-border);
}
.r-date {
  font-family: var(--font-cute);
  font-size: var(--fs-sm);
  width: 62px;
  flex-shrink: 0;
}
.r-values { display: flex; gap: var(--space-10); flex: 1; flex-wrap: wrap; align-items: center; }
.r-val { font-size: var(--fs-sm); color: var(--text-secondary); }
.r-tag {
  font-size: var(--fs-xs);
  font-weight: 700;
  padding: var(--space-2) var(--space-8);
  border-radius: var(--r-pill);
  font-family: var(--font-cute);
}
.r-tag.up { color: #1f8a4c; background: rgba(31, 138, 76, 0.13); }
.r-tag.down { color: #c9503f; background: rgba(201, 80, 63, 0.13); }
.r-tag.flat { color: var(--text-muted); background: rgba(90, 58, 74, 0.08); }
.r-right { display: flex; align-items: center; gap: var(--space-8); flex-shrink: 0; }
.r-note {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--r-sm);
  background: var(--glass-bg-strong);
  font-size: var(--fs-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--dur-fast);
}
.icon-btn.del:hover { background: rgba(255, 107, 107, 0.18); }

@media (max-width: 768px) {
  .stat-row { grid-template-columns: repeat(3, 1fr); gap: var(--space-6); }
  .stat-value { font-size: var(--fs-2xl); }
}

/* 窄屏下 header 的按钮换行到标题下方并拉满，避免两个按钮把标题挤成两行 */
@media (max-width: 560px) {
  .header-actions { width: 100%; }
  .header-actions .btn { flex: 1; }
}
</style>
