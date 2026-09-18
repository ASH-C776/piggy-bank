<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import { ZODIACS } from '@/utils/zodiac';

const props = defineProps<{
  modelValue: boolean;
  child?: {
    id: number;
    name: string;
    avatar: string;
    birthday?: string | null;
    sex?: string | null;
  } | null;
}>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  saved: [];
}>();

const toast = useToastStore();
const isEdit = computed(() => !!props.child);

// 本地时区的今天（不用 toISOString，那是 UTC，东八区早上 8 点前会差一天）
const today = computed(() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
});

const name = ref('');
const pin = ref('');
const avatar = ref('dragon');
const birthday = ref('');
const sex = ref<'male' | 'female' | ''>('');
const saving = ref(false);

// 打开弹窗那一刻的快照，用来判断「哪些字段真的被改动过」
const initial = ref({ name: '', avatar: 'dragon', birthday: '', sex: '' as 'male' | 'female' | '' });

function reset() {
  name.value = props.child?.name ?? '';
  pin.value = '';
  avatar.value = props.child?.avatar ?? 'dragon';
  birthday.value = props.child?.birthday ?? '';
  sex.value = (props.child?.sex as 'male' | 'female' | null) ?? '';
  initial.value = {
    name: name.value.trim(),
    avatar: avatar.value,
    birthday: birthday.value,
    sex: sex.value,
  };
}

// 必须 immediate：外层用 v-if 挂载本组件，创建时 modelValue 已经是 true，
// 不加 immediate 回调永远不会触发 → 编辑时表单一片空白、被迫每项重填。
watch(() => props.modelValue, (open) => { if (open) reset(); }, { immediate: true });

async function save() {
  if (!name.value.trim()) return toast.warning('请输入小朋友名字');
  if (!pin.value && !isEdit.value) return toast.warning('请设置PIN码');
  if (pin.value && !/^\d{4,6}$/.test(pin.value)) return toast.warning('PIN必须是4-6位数字');

  const body: Record<string, unknown> = {};

  if (!isEdit.value) {
    // 新增时生日/性别必填：成长曲线的百分位完全依赖这两项，事后补录容易忘
    if (!birthday.value) return toast.warning('请选择小朋友的生日');
    if (!sex.value) return toast.warning('请选择小朋友的性别');
    body.name = name.value.trim();
    body.avatar = avatar.value;
    body.birthday = birthday.value;
    body.sex = sex.value;
    body.pin = pin.value;
  } else {
    // 编辑：只提交「真的改动过」的字段。
    // 没动过的一律不传（后端 undefined = 保持原值），所以不会因为没填就把已有信息清掉。
    const nm = name.value.trim();
    if (nm !== initial.value.name) body.name = nm;
    if (avatar.value !== initial.value.avatar) body.avatar = avatar.value;
    if (birthday.value !== initial.value.birthday) body.birthday = birthday.value || null;
    if (sex.value !== initial.value.sex) body.sex = sex.value || null;
    if (pin.value) body.pin = pin.value;

    if (!Object.keys(body).length) {
      toast.info('没有需要修改的内容');
      emit('update:modelValue', false);
      return;
    }
  }

  saving.value = true;
  try {
    if (isEdit.value) {
      await api.patch(`/children/${props.child!.id}`, body);
      toast.success('已更新小朋友信息');
    } else {
      await api.post('/children', body);
      toast.success('小朋友创建成功 🎉');
    }
    emit('saved');
  } catch (e: any) {
    if (e.payload?.error === 'pin_used') toast.error('PIN已被其他账号使用');
    else toast.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal :model-value="modelValue" :title="isEdit ? '编辑小朋友' : '新增小朋友'" @update:model-value="emit('update:modelValue', $event)">
    <div class="form">
      <div class="field">
        <label class="label">生肖头像</label>
        <div class="zodiac-grid">
          <button
            v-for="z in ZODIACS"
            :key="z.key"
            type="button"
            :class="['zodiac', { active: avatar === z.key }]"
            @click="avatar = z.key"
          >
            <ZodiacAvatar :zodiac="z.key" :size="48" />
            <span class="zname">{{ z.name }}</span>
          </button>
        </div>
      </div>

      <div class="field">
        <label class="label">名字</label>
        <input v-model="name" type="text" maxlength="20" placeholder="给小朋友起个可爱的名字" />
      </div>

      <div class="field">
        <label class="label">
          生日
          <span v-if="!isEdit" class="req">必填</span>
        </label>
        <input v-model="birthday" type="date" :max="today" />
        <p class="hint">
          {{ isEdit ? '不改动会自动保持原值；清空则移除生日（不再显示百分位）' : '生长曲线按年龄对比同龄标准，一定要填哦' }}
        </p>
      </div>

      <div class="field">
        <label class="label">
          性别
          <span v-if="!isEdit" class="req">必填</span>
        </label>
        <div class="sex-tabs">
          <button type="button" :class="{ active: sex === 'male' }" @click="sex = 'male'">
            <span class="sex-emoji">👦</span> 男孩
          </button>
          <button type="button" :class="{ active: sex === 'female' }" @click="sex = 'female'">
            <span class="sex-emoji">👧</span> 女孩
          </button>
        </div>
        <p class="hint">
          {{ isEdit ? '不改动会自动保持原值' : '男孩和女孩的生长标准不一样，选了才能算百分位' }}
        </p>
      </div>

      <div class="field">
        <label class="label">{{ isEdit ? 'PIN码（留空则不修改）' : 'PIN码' }}</label>
        <input
          v-model="pin"
          type="tel"
          inputmode="numeric"
          maxlength="6"
          placeholder="4-6位数字"
        />
        <p class="hint">PIN码是小朋友登录用的，记得告诉Ta哦~</p>
      </div>
    </div>

    <template #footer>
      <button class="btn btn-ghost" @click="emit('update:modelValue', false)">取消</button>
      <button class="btn btn-primary" @click="save" :disabled="saving">
        {{ saving ? '保存中...' : '保存' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-18);
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}
.label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  padding-left: var(--space-4);
}
.hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  padding-left: var(--space-4);
}
.req {
  display: inline-block;
  margin-left: var(--space-6);
  padding: var(--space-2) var(--space-6);
  border-radius: var(--r-pill);
  font-size: var(--fs-2xs);
  font-weight: 700;
  color: #fff;
  background: var(--accent-orange);
  vertical-align: middle;
}

.zodiac-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-8);
}
.zodiac {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-8) var(--space-2);
  border-radius: var(--r-sm);
  background: var(--glass-bg);
  border: 2px solid transparent;
  transition: all var(--dur-base);
}
.zodiac:hover {
  background: var(--glass-bg-strong);
}
.zodiac.active {
  background: var(--glass-bg-strong);
  border-color: var(--accent-orange);
}
.zname {
  font-size: var(--fs-2xs);
  color: var(--text-secondary);
}

.sex-tabs {
  display: flex;
  background: var(--glass-bg);
  border-radius: var(--r-md);
  padding: var(--space-4);
  gap: var(--space-4);
}
.sex-tabs button {
  flex: 1;
  padding: var(--space-10);
  border-radius: var(--r-sm);
  color: var(--text-secondary);
  font-weight: 600;
  transition: all var(--dur-base);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
}
.sex-tabs button.active {
  background: var(--glass-bg-strong);
  color: var(--text-primary);
  box-shadow: var(--shadow-pill);
}
.sex-emoji { font-size: var(--fs-md); }
</style>
