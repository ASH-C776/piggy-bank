<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import { ZODIACS } from '@/utils/zodiac';

const props = defineProps<{
  modelValue: boolean;
  child?: { id: number; name: string; avatar: string } | null;
}>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  saved: [];
}>();

const toast = useToastStore();
const isEdit = computed(() => !!props.child);

const name = ref('');
const pin = ref('');
const avatar = ref('dragon');
const saving = ref(false);

watch(() => props.modelValue, (open) => {
  if (open) {
    name.value = props.child?.name ?? '';
    pin.value = '';
    avatar.value = props.child?.avatar ?? 'dragon';
  }
});

async function save() {
  if (!name.value.trim()) return toast.warning('请输入小朋友名字');
  if (!pin.value && !isEdit.value) return toast.warning('请设置PIN码');
  if (pin.value && !/^\d{4,6}$/.test(pin.value)) return toast.warning('PIN必须是4-6位数字');

  saving.value = true;
  try {
    const body: Record<string, unknown> = { name: name.value.trim(), avatar: avatar.value };
    if (pin.value) body.pin = pin.value;

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
  gap: 18px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.label {
  font-size: 13px;
  color: var(--text-secondary);
  padding-left: 4px;
}
.hint {
  font-size: 12px;
  color: var(--text-muted);
  padding-left: 4px;
}

.zodiac-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.zodiac {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 2px;
  border-radius: var(--r-sm);
  background: var(--glass-bg);
  border: 2px solid transparent;
  transition: all 0.2s;
}
.zodiac:hover {
  background: var(--glass-bg-strong);
}
.zodiac.active {
  background: var(--glass-bg-strong);
  border-color: var(--accent-orange);
}
.zname {
  font-size: 10px;
  color: var(--text-secondary);
}
</style>
