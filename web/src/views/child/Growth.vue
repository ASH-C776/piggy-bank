<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';
import GlassCard from '@/components/GlassCard.vue';
import EmptyState from '@/components/EmptyState.vue';
import GrowthChart from '@/components/GrowthChart.vue';
import {
  ageInYears,
  heightPercentile,
  heightPercentileText,
  heightLevelTextChild,
  calcBmi,
  bmiLevel,
  bmiPercentile,
  bmiLevelTextChild,
  type Sex,
} from '@/utils/growth-standards';

const router = useRouter();

interface Profile {
  id: number;
  name: string;
  birthday: string | null;
  sex: string | null;
}
interface GrowthRecord {
  id: number;
  record_date: string;
  height_cm: number | null;
  weight_kg: number | null;
  note: string | null;
  created_at: number;
}

const profile = ref<Profile | null>(null);
const records = ref<GrowthRecord[]>([]);
const loading = ref(true);

const heightSeries = computed(() => records.value.filter((r) => r.height_cm != null));
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

const currentBmi = computed(() => {
  const w = latestWeight.value?.weight_kg;
  const h = latestHeight.value?.height_cm;
  if (w == null || h == null) return null;
  return calcBmi(h, w);
});

/** 身高百分位（需生日 + 性别） */
const heightEval = computed(() => {
  const p = profile.value;
  const r = latestHeight.value;
  if (!p?.birthday || !p.sex || !r?.height_cm) return null;
  const age = ageInYears(p.birthday, r.record_date);
  if (age == null) return null;
  const pc = heightPercentile(p.sex as Sex, age, r.height_cm);
  if (pc == null) return null;
  return {
    percentile: pc,
    text: heightPercentileText(pc),
    level: heightLevelTextChild(pc),
  };
});

const bmiEval = computed(() => {
  const p = profile.value;
  const bmi = currentBmi.value;
  if (!p?.birthday || !p.sex || bmi == null) return null;
  const r = latestWeight.value ?? latestHeight.value;
  if (!r) return null;
  const age = ageInYears(p.birthday, r.record_date);
  if (age == null) return null;
  // 6 岁以上用 WS/T 586 分级；更小的孩子用 WS/T 423 的 BMI 百分位
  const level = bmiLevel(p.sex as Sex, age, bmi);
  if (level) return { text: bmiLevelTextChild(level) };
  const pc = bmiPercentile(p.sex as Sex, age, bmi);
  return pc === null ? null : { text: heightPercentileText(pc) };
});

/** 长大一点点的小鼓励 */
const cheer = computed(() => {
  if (growSincePrev.value === null) return '记录下第一次身高吧~';
  if (growSincePrev.value > 0) return `最近长高了 ${growSincePrev.value.toFixed(1)}cm，厉害！`;
  if (growSincePrev.value === 0) return '这次身高没变，下次再量量看~';
  return '数据有更新，继续加油长高高！';
});

async function load() {
  loading.value = true;
  try {
    const res = await api.get<{ profile: Profile; records: GrowthRecord[] }>('/growth/mine');
    profile.value = res.profile;
    records.value = res.records;
  } catch {
    // 失败时保持旧数据，不让页面白屏
  } finally {
    loading.value = false;
  }
}

/** 图表用的实测点：{ 日期, 数值 } */
const heightPoints = computed(() =>
  heightSeries.value.map((r) => ({ date: r.record_date, value: r.height_cm as number }))
);

function openDetail() {
  // 卡片和图表都会触发，加个守卫避免重复跳转
  if (router.currentRoute.value.path === '/child/growth/detail') return;
  router.push('/child/growth/detail');
}

function fmtDate(s: string): string {
  const [, m, d] = s.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

// 家长录入新记录后自动刷新
function onGrowthRecorded() {
  load();
}

onMounted(() => {
  load();
  window.addEventListener('ws:growth_recorded', onGrowthRecorded);
});

onUnmounted(() => {
  window.removeEventListener('ws:growth_recorded', onGrowthRecorded);
});
</script>

<template>
  <div class="page">
    <h1 class="title">我的成长 📏</h1>

    <EmptyState
      v-if="!loading && records.length === 0"
      emoji="📏"
      text="还没有测量记录"
      hint="让爸爸妈妈帮你量一量身高吧~"
    />

    <template v-else>
      <!-- 身高主卡 -->
      <GlassCard v-if="latestHeight" class="hero" padding="24px 20px">
        <div class="hero-emoji">🌱</div>
        <div class="hero-num">
          {{ latestHeight.height_cm!.toFixed(1) }}
          <span class="unit">cm</span>
        </div>
        <div class="hero-label">我现在的身高</div>
        <div v-if="growSincePrev !== null && growSincePrev > 0" class="grow-tag">
          🎉 比上次 +{{ growSincePrev.toFixed(1) }}cm
        </div>
        <div v-else-if="growSincePrev !== null" class="grow-tag flat">
          和上次一样高
        </div>
      </GlassCard>

      <p class="cheer">{{ cheer }}</p>

      <!-- 百分位 / 体重 / BMI -->
      <div class="stat-row">
        <GlassCard padding="14px 12px" class="stat-card">
          <div class="stat-emoji">📊</div>
          <div class="stat-value">{{ heightEval ? heightEval.text : '--' }}</div>
          <div class="stat-label">{{ heightEval ? heightEval.level : '需填生日性别' }}</div>
        </GlassCard>

        <GlassCard padding="14px 12px" class="stat-card">
          <div class="stat-emoji">⚖️</div>
          <div class="stat-value">
            {{ latestWeight ? latestWeight.weight_kg!.toFixed(1) : '--' }}
            <span class="unit-sm">kg</span>
          </div>
          <div class="stat-label">我的体重</div>
        </GlassCard>

        <GlassCard padding="14px 12px" class="stat-card">
          <div class="stat-emoji">💪</div>
          <div class="stat-value">{{ bmiEval ? bmiEval.text : '--' }}</div>
          <div class="stat-label">
            {{ currentBmi !== null ? `BMI ${currentBmi.toFixed(1)}` : '暂无 BMI' }}
          </div>
        </GlassCard>
      </div>

      <!-- 身高曲线：点一下进详情页看和同龄人的对比 -->
      <GlassCard
        padding="16px 14px 10px"
        class="chart-card"
        hover
        clickable
        label="查看身高曲线与同龄人对比"
        @click="openDetail"
      >
        <div class="chart-head">
          <span class="chart-title">📈 我的身高曲线</span>
          <span class="chart-more">点开看对比 ›</span>
        </div>
        <!-- interactive=false：外层卡片已经是 role="button"，
             图表不能再自报一次按钮语义（SVG 里还有一堆轴刻度文字，
             否则会被算进可访问名）-->
        <GrowthChart
          metric="height"
          :points="heightPoints"
          :sex="(profile?.sex as Sex | null) ?? null"
          :birthday="profile?.birthday ?? null"
          mode="compact"
          :chart-height="180"
          :interactive="false"
          @open-detail="openDetail"
        />
      </GlassCard>

      <!-- 最近记录 -->
      <h2 class="section-title">量过的身高</h2>
      <div class="record-list">
        <GlassCard
          v-for="r in [...records].reverse().slice(0, 8)"
          :key="r.id"
          padding="11px 14px"
          class="record-item"
        >
          <span class="r-date">{{ fmtDate(r.record_date) }}</span>
          <span v-if="r.height_cm != null" class="r-val">📏 {{ r.height_cm.toFixed(1) }} cm</span>
          <span v-if="r.weight_kg != null" class="r-val">⚖️ {{ r.weight_kg.toFixed(1) }} kg</span>
        </GlassCard>
      </div>

      <p v-if="!heightEval" class="foot-note">
        💡 想看「在同龄人里排第几」？让爸爸妈妈在账号里填上生日和性别就好啦
      </p>
    </template>
  </div>
</template>

<style scoped>
.page { padding-bottom: var(--space-8); }
.title {
  font-size: var(--fs-3xl);
  text-align: center;
  margin-bottom: var(--space-16);
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-10);
  text-align: center;
}
.hero-emoji { font-size: var(--fs-5xl); }
.hero-num {
  font-family: var(--font-cute);
  font-size: var(--fs-7xl);
  line-height: 1.1;
  /* 兜底：不支持 background-clip:text 时退化为深色实字，避免身高数字消失 */
  color: var(--text-on-mint);
}
@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  .hero-num {
    /* 同 Home 的余额数字：端点改用压暗版（4.23:1 → 4.62:1），
       原因见 main.css 的 --grad-num-* 注释 */
    background: linear-gradient(135deg, var(--grad-num-cool-from), var(--grad-num-cool-to));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}
.hero-num .unit { font-size: var(--fs-xl); }
.hero-label { font-size: var(--fs-sm); color: var(--text-muted); }
.grow-tag {
  margin-top: var(--space-8);
  padding: var(--space-6) var(--space-14);
  border-radius: var(--r-pill);
  background: rgba(255, 209, 102, 0.22);
  font-family: var(--font-cute);
  font-size: var(--fs-sm);
}
.grow-tag.flat { background: var(--glass-bg); color: var(--text-muted); }

.cheer {
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-14);
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-10);
  margin-bottom: var(--space-14);
}
.stat-card {
  text-align: center;
  border: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}
.stat-emoji { font-size: var(--fs-xl); }
.stat-value {
  font-family: var(--font-cute);
  font-size: var(--fs-lg);
  line-height: 1.3;
}
.unit-sm { font-size: var(--fs-xs); color: var(--text-muted); }
.stat-label { font-size: var(--fs-xs); color: var(--text-muted); }

.chart-card { margin-bottom: var(--space-18); }
.chart-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-6);
  padding: 0 var(--space-2);
}
.chart-title { font-family: var(--font-cute); font-size: var(--fs-md); }
.chart-more { font-size: var(--fs-xs); color: var(--text-muted); }

.section-title { font-size: var(--fs-lg); margin-bottom: var(--space-10); }

.record-list { display: flex; flex-direction: column; gap: var(--space-8); }
.record-item {
  display: flex;
  align-items: center;
  gap: var(--space-14);
  border: 1px solid var(--glass-border);
}
.r-date {
  font-family: var(--font-cute);
  font-size: var(--fs-sm);
  width: 58px;
  flex-shrink: 0;
}
.r-val { font-size: var(--fs-sm); color: var(--text-secondary); }

.foot-note {
  margin-top: var(--space-16);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-align: center;
  line-height: 1.6;
}
</style>
