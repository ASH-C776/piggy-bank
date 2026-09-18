<script setup lang="ts">
/**
 * 「奖励规则」弹窗。
 *
 * 原先是成长页底部一张常驻配置卡 —— 属于「设置一次、几个月不再碰」的内容，
 * 却和每天要看的历史记录抢版面。R2 收进弹窗，并顺手把它从"两个裸输入框"改成
 * 带**实时示例**的配置：规则是乘加关系，光看"每长高 1cm 奖励 10 分"很难心算出
 * 一次测量到底给几分，给个例子就一目了然。
 */
import { ref, computed, watch } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';
import { DEFAULT_GROWTH_SETTINGS, type GrowthSettings } from '@/utils/growth';

const props = defineProps<{
  modelValue: boolean;
  settings: GrowthSettings;
}>();

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  /** 保存成功，带上后端回传的最新规则 */
  saved: [settings: GrowthSettings];
}>();

const toast = useToastStore();

// 用 number | '' 而不是 number：输入框被清空时 v-model.number 给的是空字符串，
// 若按 number 处理，Number('') === 0 会被当成合法输入静默存成 0 分。
const perCm = ref<number | ''>(DEFAULT_GROWTH_SETTINGS.growth_reward_per_cm);
const perRec = ref<number | ''>(DEFAULT_GROWTH_SETTINGS.growth_record_reward);
const saving = ref(false);

/** 打开时用页面上的最新值回填；immediate 理由见 GrowthRecordModal 同处说明 */
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    perCm.value = props.settings.growth_reward_per_cm;
    perRec.value = props.settings.growth_record_reward;
  },
  { immediate: true }
);

const valid = (v: number | ''): v is number =>
  v !== '' && Number.isInteger(v) && v >= 0 && v <= 1000;

/** 拿一次典型测量举例，让"乘加关系"变成看得见的数字 */
const example = computed(() => {
  if (!valid(perCm.value) || !valid(perRec.value)) return null;
  const grow = 0.8;
  const fromCm = Math.round(grow * perCm.value);
  return {
    perCm: perCm.value,
    perRec: perRec.value,
    fromCm,
    total: perRec.value + fromCm,
  };
});

function close() {
  emit('update:modelValue', false);
}

async function save() {
  if (!valid(perCm.value)) {
    toast.warning('每厘米奖励请填 0~1000 的整数');
    return;
  }
  if (!valid(perRec.value)) {
    toast.warning('每次记录奖励请填 0~1000 的整数');
    return;
  }

  saving.value = true;
  try {
    const next = await api.put<GrowthSettings>('/growth/settings', {
      growth_reward_per_cm: perCm.value,
      growth_record_reward: perRec.value,
    });
    toast.success('奖励规则已更新');
    emit('saved', next);
    close();
  } catch (e: any) {
    toast.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    title="奖励规则"
    width="460px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="form">
      <div class="row">
        <label class="row-label" for="g-per-cm">每长高 1 cm 奖励</label>
        <div class="row-input">
          <input id="g-per-cm" v-model.number="perCm" type="number" min="0" max="1000" />
          <span class="unit">分</span>
        </div>
      </div>

      <div class="row">
        <label class="row-label" for="g-per-rec">每次测量记录奖励</label>
        <div class="row-input">
          <input id="g-per-rec" v-model.number="perRec" type="number" min="0" max="1000" />
          <span class="unit">分</span>
        </div>
      </div>

      <!-- 实时示例：把两个孩子都看不懂的乘加规则翻译成一次真实的测量 -->
      <div v-if="example" class="example">
        <div class="ex-title">举个例子</div>
        <div class="ex-body">
          这次比上次高 <strong>0.8 cm</strong> →
          每次记录 {{ example.perRec }} 分 + 0.8 × {{ example.perCm }} ≈
          <strong class="ex-total">{{ example.total }} 分</strong>
        </div>
      </div>

      <p class="hint">
        身高比上次矮了会按同样比例扣回。改规则只影响之后的记录，已经发出的分不追溯。
      </p>
    </div>

    <template #footer>
      <span style="flex: 1"></span>
      <button class="btn btn-ghost" @click="close">取消</button>
      <button class="btn btn-primary" :disabled="saving" @click="save">
        {{ saving ? '保存中...' : '保存规则' }}
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

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
}
.row-label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}
.row-input {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  flex-shrink: 0;
}
.row-input input {
  width: 88px;
  text-align: center;
  padding: var(--space-8) var(--space-10);
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  font-size: var(--fs-md);
  color: var(--text-primary);
  font-family: var(--font-cute);
}
.row-input input:focus {
  outline: none;
  border-color: var(--accent-yellow);
}
.unit {
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

.example {
  padding: var(--space-12);
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 1px dashed var(--glass-border);
}
.ex-title {
  font-family: var(--font-cute);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-6);
}
.ex-body {
  font-size: var(--fs-sm);
  color: var(--text-primary);
  line-height: 1.7;
}
.ex-total {
  font-family: var(--font-cute);
  font-size: var(--fs-lg);
  color: var(--text-on-orange);
}

.hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  line-height: 1.6;
  padding: var(--space-8) var(--space-10);
  background: var(--glass-bg);
  border-radius: var(--r-sm);
}
</style>
