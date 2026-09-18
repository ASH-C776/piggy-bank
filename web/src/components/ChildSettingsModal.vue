<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import { ZODIACS } from '@/utils/zodiac';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>();

const auth = useAuthStore();
const toast = useToastStore();

const avatar = ref<string>(auth.user?.avatar ?? '');
const pin = ref('');
const saving = ref(false);

// 打开时重置表单（immediate：万一以后外层改用 v-if 挂载，创建时也要能正确初始化）
watch(() => props.modelValue, (open) => {
  if (open) {
    avatar.value = auth.user?.avatar ?? '';
    pin.value = '';
  }
}, { immediate: true });

const pinValid = computed(() => pin.value === '' || /^\d{4,6}$/.test(pin.value));

async function save() {
  if (!pinValid.value) {
    toast.error('PIN 必须是 4-6 位数字');
    return;
  }
  if (!avatar.value) {
    toast.error('请选择头像');
    return;
  }
  const body: { avatar?: string; pin?: string } = { avatar: avatar.value };
  if (pin.value) body.pin = pin.value;

  saving.value = true;
  try {
    const res = await api.patch<{ user: any }>('/auth/child/me', body);
    auth.setUser(res.user);
    toast.success('设置已保存');
    emit('update:modelValue', false);
  } catch (e: any) {
    const err = e.payload?.error;
    if (err === 'invalid_pin') toast.error('PIN 必须是 4-6 位数字');
    else if (err === 'invalid_avatar') toast.error('头像无效');
    else toast.error(e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" title="我的设置" width="420px">
    <div class="form">
      <!-- 头像选择 -->
      <div class="field">
        <label class="field-label">我的头像</label>
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

      <!-- PIN码 -->
      <div class="field">
        <label class="field-label">登录 PIN 码</label>
        <input
          v-model="pin"
          type="password"
          inputmode="numeric"
          maxlength="6"
          class="input"
          placeholder="留空表示不修改"
        />
        <p class="hint">4-6 位数字</p>
      </div>

      <div class="actions">
        <button class="btn btn-primary" :disabled="saving" @click="save">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--space-20); }
.field { display: flex; flex-direction: column; gap: var(--space-8); }
.field-label {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-primary);
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
  gap: var(--space-4);
  padding: var(--space-8) var(--space-4);
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 2px solid transparent;
  transition: all var(--dur-base);
}
.zodiac.active {
  border-color: var(--accent-yellow);
  background: rgba(255, 209, 102, 0.15);
}
.zname {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}
.input {
  width: 100%;
  padding: var(--space-12) var(--space-14);
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  font-size: var(--fs-md);
  color: var(--text-primary);
  font-family: var(--font-cute);
  letter-spacing: 4px;
}
.input:focus {
  outline: none;
  border-color: var(--accent-yellow);
}
.hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-top: calc(-1 * var(--space-2));
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-8);
}
</style>
