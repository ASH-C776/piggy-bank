<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
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
  bmiCutoffs,
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

type TabKey = 'height' | 'weight' | 'bmi';

const tabs: Array<{ key: TabKey; label: string; emoji: string }> = [
  { key: 'height', label: '身高', emoji: '📏' },
  { key: 'weight', label: '体重', emoji: '⚖️' },
  { key: 'bmi', label: 'BMI', emoji: '💪' },
];

const tab = ref<TabKey>('height');
const profile = ref<Profile | null>(null);
const records = ref<GrowthRecord[]>([]);
const loading = ref(true);

const heightSeries = computed(() => records.value.filter((r) => r.height_cm != null));
const latestHeight = computed(() =>
  heightSeries.value.length ? heightSeries.value[heightSeries.value.length - 1] : null
);
const latestWeight = computed(() => {
  for (let i = records.value.length - 1; i >= 0; i--) {
    if (records.value[i].weight_kg != null) return records.value[i];
  }
  return null;
});

/** 当前 tab 对应的实测点：{ 日期, 数值 } */
const tabPoints = computed<Array<{ date: string; value: number }>>(() => {
  if (tab.value === 'height') {
    return heightSeries.value.map((r) => ({ date: r.record_date, value: r.height_cm as number }));
  }
  if (tab.value === 'weight') {
    return records.value
      .filter((r): r is GrowthRecord & { weight_kg: number } => r.weight_kg != null)
      .map((r) => ({ date: r.record_date, value: r.weight_kg }));
  }
  return bmiPoints.value.map((p) => ({ date: p.date, value: p.bmi }));
});

/** 最新一次测量时的年龄，决定图例和提示文案怎么显示 */
const lastAge = computed<number | null>(() => {
  const last = records.value.length ? records.value[records.value.length - 1] : null;
  return last ? ageAt(last.record_date) : null;
});

/** BMI 在 6 岁上下用的是两套标准，图例要跟着变 */
const useCutoffLines = computed(() => tab.value === 'bmi' && lastAge.value !== null && lastAge.value >= 6);

const legend = computed(() => {
  if (useCutoffLines.value) {
    return [
      { cls: 'cut-ow', text: '超重线' },
      { cls: 'cut-ob', text: '肥胖线' },
      { cls: 'me', text: '我' },
    ];
  }
  return [
    { cls: 'band', text: '同龄常见范围 (P25–P75)' },
    { cls: 'mid', text: '同龄平均 (P50)' },
    { cls: 'me', text: '我' },
  ];
});

/** 标准覆盖不到的组合，如实说明，不假装画了参考线 */
const stdNote = computed<string | null>(() => {
  const age = lastAge.value;
  if (tab.value === 'weight' && age !== null && age >= 7) {
    return '国内没有公开的 7 岁以上体重标准，这里只画实测值';
  }
  if (tab.value === 'bmi') {
    if (age === null) return null;
    return age >= 6
      ? '虚线为 WS/T 586 超重 / 肥胖界值'
      : '阴影为 WS/T 423 BMI 百分位范围';
  }
  return null;
});

function ageAt(dateStr: string): number | null {
  if (!profile.value?.birthday) return null;
  return ageInYears(profile.value.birthday, dateStr);
}

const bmiPoints = computed(() =>
  records.value
    .map((r) => {
      const bmi = r.height_cm && r.weight_kg ? calcBmi(r.height_cm, r.weight_kg) : null;
      return bmi === null ? null : { date: r.record_date, bmi };
    })
    .filter((x): x is { date: string; bmi: number } => x !== null)
);

/** 当前 tab 的解读卡文案 */
const reading = computed(() => {
  const p = profile.value;
  if (!p?.birthday || !p.sex) {
    return {
      title: '还看不到百分位',
      desc: '让爸爸妈妈在账号里填上生日和性别，就能对比同龄人的生长标准了',
    };
  }

  if (tab.value === 'height') {
    const r = latestHeight.value;
    if (!r?.height_cm) return { title: '还没有身高数据', desc: '量一次身高就能看到曲线啦' };
    const age = ageAt(r.record_date);
    const pc = age === null ? null : heightPercentile(p.sex as Sex, age, r.height_cm);
    if (pc === null) {
      return {
        title: `${r.height_cm.toFixed(1)} cm`,
        desc: '这个年龄暂时没有可参考的标准曲线，先继续记录吧~',
      };
    }
    const rank = Math.round(pc);
    return {
      title: heightPercentileText(pc),
      desc: `100 个同年龄同性别的小朋友里，你排在第 ${rank} 名 · ${heightLevelTextChild(pc)}`,
    };
  }

  if (tab.value === 'weight') {
    const r = latestWeight.value;
    if (!r?.weight_kg) return { title: '还没有体重数据', desc: '称一次体重就能看到曲线啦' };
    return {
      title: `${r.weight_kg.toFixed(1)} kg`,
      desc: '体重会随身高一起变化，配合 BMI 一起看更准哦',
    };
  }

  const last = bmiPoints.value.length ? bmiPoints.value[bmiPoints.value.length - 1] : null;
  if (!last) return { title: '还没有 BMI 数据', desc: '需要同时量到身高和体重才能算 BMI' };
  const age = ageAt(last.date);
  const cut = age === null ? null : bmiCutoffs(p.sex as Sex, age);
  // WS/T 586 只覆盖 6~18 岁，更小的孩子改用 WS/T 423 的 BMI 百分位
  if (age === null || !cut) {
    const pc = age === null ? null : bmiPercentile(p.sex as Sex, age, last.bmi);
    return pc === null
      ? { title: `BMI ${last.bmi.toFixed(1)}`, desc: '这个年龄暂时没有可参考的界值' }
      : {
          title: heightPercentileText(pc),
          desc: `BMI ${last.bmi.toFixed(1)}，这是你在同龄小朋友里的位置`,
        };
  }
  const level = bmiLevel(p.sex as Sex, age, last.bmi);
  if (!level) {
    return { title: `BMI ${last.bmi.toFixed(1)}`, desc: '这个年龄暂时没有可参考的界值' };
  }
  if (level === 'normal') {
    return {
      title: '很匀称',
      desc: `BMI ${last.bmi.toFixed(1)}，在健康范围内（超重线 ${cut.overweight.toFixed(1)}）`,
    };
  }
  return {
    title: bmiLevelTextChild(level),
    desc: `BMI ${last.bmi.toFixed(1)}，最近体重有点变化，和爸爸妈妈聊聊吧`,
  };
});

async function load() {
  loading.value = true;
  try {
    const res = await api.get<{ profile: Profile; records: GrowthRecord[] }>('/growth/mine');
    profile.value = res.profile;
    records.value = res.records;
  } catch {
    // 保持旧数据
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <button class="back-btn" @click="router.back()">‹ 返回</button>
    <h1 class="title">成长详情</h1>

    <div class="tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        :class="{ active: tab === t.key }"
        @click="tab = t.key"
      >
        <span class="t-emoji">{{ t.emoji }}</span> {{ t.label }}
      </button>
    </div>

    <EmptyState
      v-if="!loading && records.length === 0"
      emoji="📏"
      text="还没有测量记录"
      hint="让爸爸妈妈帮你量一量吧~"
    />

    <template v-else>
      <!-- 标准对比曲线：点数据点看具体数值 -->
      <GlassCard padding="16px 12px 8px" class="chart-card">
        <GrowthChart
          :metric="tab"
          :points="tabPoints"
          :sex="(profile?.sex as Sex | null) ?? null"
          :birthday="profile?.birthday ?? null"
          mode="detail"
          :chart-height="250"
        />
      </GlassCard>

      <!-- 图例（BMI 在 6 岁上下用不同标准，图例跟着换） -->
      <div class="legend">
        <span v-for="l in legend" :key="l.text" class="lg">
          <i class="sw" :class="l.cls"></i> {{ l.text }}
        </span>
      </div>

      <p v-if="stdNote" class="std-note">{{ stdNote }}</p>

      <!-- 解读卡 -->
      <GlassCard padding="18px 18px" class="reading-card">
        <div class="reading-title">{{ reading.title }}</div>
        <div class="reading-desc">{{ reading.desc }}</div>
      </GlassCard>

      <p class="disclaimer">
        参考标准：WS/T 423—2022（0~7 岁）、WS/T 612—2018（7~18 岁身高）、
        WS/T 586—2018（超重肥胖筛查）。本页仅供家庭参考，不能代替医生诊断。
      </p>
    </template>
  </div>
</template>

<style scoped>
.page { padding-bottom: var(--space-8); }

.back-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  padding: 0;
  margin-bottom: var(--space-4);
}

.title {
  font-size: var(--fs-2xl);
  text-align: center;
  margin-bottom: var(--space-14);
}

.tabs {
  display: flex;
  background: var(--glass-bg);
  border-radius: var(--r-md);
  padding: var(--space-4);
  gap: var(--space-4);
  margin-bottom: var(--space-16);
}
.tabs button {
  flex: 1;
  padding: var(--space-10) var(--space-8);
  border-radius: var(--r-sm);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: var(--fs-sm);
  transition: all var(--dur-base);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
}
.tabs button.active {
  background: var(--glass-bg-strong);
  color: var(--text-primary);
  box-shadow: var(--shadow-pill);
}
.t-emoji { font-size: var(--fs-md); }

.chart-card { margin-bottom: var(--space-12); }

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-12);
  justify-content: center;
  margin-bottom: var(--space-10);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.lg { display: inline-flex; align-items: center; gap: var(--space-4); }
.sw {
  width: 14px;
  height: 8px;
  border-radius: var(--r-2xs);
  display: inline-block;
}
.sw.band { background: rgba(132, 197, 255, 0.32); }
.sw.mid { background: repeating-linear-gradient(90deg, #9aa6bd 0 3px, transparent 3px 6px); height: 2px; }
.sw.me { background: var(--accent-orange); }
.sw.cut-ow { background: repeating-linear-gradient(90deg, #ffb454 0 4px, transparent 4px 7px); height: 2px; }
.sw.cut-ob { background: repeating-linear-gradient(90deg, #ff7a7a 0 4px, transparent 4px 7px); height: 2px; }

.std-note {
  text-align: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-12);
  line-height: 1.6;
}

.reading-card { text-align: center; }
.reading-title {
  font-family: var(--font-cute);
  font-size: var(--fs-2xl);
  margin-bottom: var(--space-6);
}
.reading-desc {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.disclaimer {
  margin-top: var(--space-14);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  line-height: 1.6;
  text-align: center;
}
</style>
