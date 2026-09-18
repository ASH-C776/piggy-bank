<script setup lang="ts">
/**
 * 「记一次测量」弹窗。
 *
 * 原先它是家长端成长页里的一张常驻表单卡，一直占着整屏宽度，而实际使用频率是
 * 一周一次量身高 —— 低频却常年占位，把真正该看的曲线图挤到了上面。R2 把它收进弹窗。
 *
 * 三条既有行为必须保留（搬进弹窗最容易丢的就是这些"看不见但用户依赖"的反馈）：
 *   1. 实时核算预告：「比上次 +0.8cm / +12 分」—— 家长按保存前就知道会发生什么；
 *   2. 同日覆盖提示：同一天已有记录时明确告知"保存会覆盖并重新核算"，否则会以为是重复加分；
 *   3. 打开即重置：日期回到今天、其余清空，不留上一次的残值。
 */
import { ref, computed, watch } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import {
  fmtGrowthDate,
  isValidHeight,
  isValidWeight,
  previewGrowthAward,
  sameDayRecord,
  todayStr,
  type GrowthChild,
  type GrowthRecord,
  type GrowthSettings,
} from '@/utils/growth';

const props = defineProps<{
  modelValue: boolean;
  /** 记录对象：由页面的孩子选择条决定，弹窗内只展示不切换 */
  child: GrowthChild | null;
  /** 该孩子已有的记录：用于算「比上次」与同日覆盖提示 */
  records: GrowthRecord[];
  settings: GrowthSettings;
}>();

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  /** 保存成功，页面据此重新拉取记录与图表 */
  saved: [];
}>();

const toast = useToastStore();

const formDate = ref(todayStr());
const formHeight = ref<string>('');
const formWeight = ref<string>('');
const formNote = ref('');
const saving = ref(false);

/**
 * 必须 `immediate: true`：调用方用 `<GrowthRecordModal v-if="open" v-model="open">` 挂载，
 * 组件创建时 modelValue 已经是 true，非 immediate 的 watch 永远等不到「false → true」那一次跳变，
 * 表单初始化就永远不会执行 —— 表现为「首次打开是空表」「编辑时被迫逐项重填」。
 * 这个坑在 ChildEditorModal 上踩过一次，别再来一次。
 */
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    formDate.value = todayStr();
    formHeight.value = '';
    formWeight.value = '';
    formNote.value = '';
  },
  { immediate: true }
);

/** 实时核算：填了合法身高才给预告（算法见 utils/growth.ts，与后端共用同一份规则） */
const preview = computed(() =>
  previewGrowthAward(
    formHeight.value === '' ? null : Number(formHeight.value),
    formDate.value,
    props.records,
    props.settings
  )
);

// 模板里直接算好文案，避免在模板中写非空断言
const pvGrowText = computed(() => {
  const p = preview.value;
  return p ? `比上次 ${p.grow > 0 ? '+' : ''}${p.grow.toFixed(1)} cm` : '';
});
const pvAwardText = computed(() => {
  const p = preview.value;
  return p ? `${p.award >= 0 ? '+' : ''}${p.award} 分` : '';
});
const pvPositive = computed(() => (preview.value ? preview.value.award >= 0 : true));

const sameDay = computed(() => sameDayRecord(props.records, formDate.value));

function close() {
  emit('update:modelValue', false);
}

async function submit() {
  const c = props.child;
  if (!c) return;

  const h = formHeight.value === '' ? null : Number(formHeight.value);
  const w = formWeight.value === '' ? null : Number(formWeight.value);

  if (h == null && w == null) {
    toast.warning('身高和体重至少填一项');
    return;
  }
  if (h != null && !isValidHeight(h)) {
    toast.warning('身高请填 30~250 之间的数字');
    return;
  }
  if (w != null && !isValidWeight(w)) {
    toast.warning('体重请填 2~200 之间的数字');
    return;
  }

  saving.value = true;
  try {
    const res = await api.post<{
      ok: boolean;
      updated: boolean;
      growCm: number;
      awarded: number;
    }>('/growth/records', {
      user_id: c.id,
      record_date: formDate.value,
      height_cm: h,
      weight_kg: w,
      note: formNote.value.trim() || null,
    });

    const sign = res.awarded >= 0 ? '+' : '';
    if (res.growCm > 0) {
      toast.success(`${c.name} 长高 ${res.growCm.toFixed(1)}cm，${sign}${res.awarded} 分 🎉`);
    } else if (res.growCm < 0) {
      toast.warning(
        `比上次矮了 ${Math.abs(res.growCm).toFixed(1)}cm，${sign}${res.awarded} 分（下次量对会自动补回来）`
      );
    } else {
      toast.success(`已记录，${sign}${res.awarded} 分`);
    }

    emit('saved');
    close();
  } catch (e: any) {
    if (e.payload?.error === 'empty_record') toast.warning('身高和体重至少填一项');
    else toast.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    title="记一次测量"
    width="460px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="form">
      <!-- 弹窗盖住了下面的孩子选择条，所以这里必须再说明一次"记的是谁" -->
      <div v-if="child" class="who">
        <ZodiacAvatar :zodiac="child.avatar" :size="36" />
        <div class="who-text">
          <span class="who-label">记录对象</span>
          <span class="who-name">{{ child.name }}</span>
        </div>
      </div>

      <div class="field">
        <label class="label">测量日期</label>
        <input v-model="formDate" type="date" :max="todayStr()" />
      </div>

      <div class="field-row">
        <div class="field">
          <label class="label">身高 (cm)</label>
          <input
            v-model="formHeight"
            type="number"
            step="0.1"
            min="30"
            max="250"
            placeholder="如 118.5"
          />
        </div>
        <div class="field">
          <label class="label">体重 (kg)</label>
          <input
            v-model="formWeight"
            type="number"
            step="0.1"
            min="2"
            max="200"
            placeholder="如 22.4"
          />
        </div>
      </div>

      <div class="field">
        <label class="label">备注（可选）</label>
        <input v-model="formNote" type="text" maxlength="100" placeholder="如：早上起床量的" />
      </div>

      <!-- 实时核算：填了身高就预告这次的增减 -->
      <div v-if="preview" class="preview" :class="pvPositive ? 'up' : 'down'">
        <span class="pv-main">{{ pvGrowText }}</span>
        <span class="pv-pts">{{ pvAwardText }}</span>
      </div>
      <p v-else-if="sameDay" class="hint warm">
        {{ fmtGrowthDate(formDate) }} 已经记过一次，保存会覆盖并按新数据重新核算
      </p>

      <p class="hint">填错没关系，下次量对会自动把积分补回来</p>
    </div>

    <template #footer>
      <span style="flex: 1"></span>
      <button class="btn btn-ghost" @click="close">取消</button>
      <button class="btn btn-primary" :disabled="saving" @click="submit">
        {{ saving ? '保存中...' : '保存记录' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-14);
}

.who {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-10) var(--space-12);
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
}
.who-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.who-label {
  font-size: var(--fs-2xs);
  color: var(--text-muted);
}
.who-name {
  font-family: var(--font-cute);
  font-size: var(--fs-md);
  color: var(--text-primary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-10);
}
.label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  padding-left: var(--space-4);
}
input {
  width: 100%;
  padding: var(--space-12);
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  font-size: var(--fs-md);
  color: var(--text-primary);
  font-family: var(--font-cute);
}
input:focus {
  outline: none;
  border-color: var(--accent-yellow);
}

/* 实时核算预告条 */
.preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-10) var(--space-14);
  border-radius: var(--r-md);
  font-family: var(--font-cute);
  border: 1px dashed transparent;
}
.preview.up {
  background: rgba(31, 138, 76, 0.1);
  border-color: rgba(31, 138, 76, 0.35);
  color: #1f8a4c;
}
.preview.down {
  background: rgba(201, 80, 63, 0.1);
  border-color: rgba(201, 80, 63, 0.35);
  color: #c9503f;
}
.pv-main {
  font-size: var(--fs-sm);
}
.pv-pts {
  font-size: var(--fs-md);
  font-weight: 700;
}

.hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-align: center;
  line-height: 1.5;
}
.hint.warm {
  color: #c9503f;
}

@media (max-width: 420px) {
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>
