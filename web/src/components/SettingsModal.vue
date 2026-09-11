<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import { ZODIACS } from '@/utils/zodiac';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
}>();

const auth = useAuthStore();
const toast = useToastStore();

const name = ref('');
const password = ref('');
const avatar = ref('dragon');
const saving = ref(false);

watch(() => props.modelValue, (open) => {
  if (open) {
    name.value = auth.user?.name ?? '';
    password.value = '';
    avatar.value = auth.user?.avatar ?? 'dragon';
  }
});

async function save() {
  if (!name.value.trim()) return toast.warning('请输入账号名称');
  if (password.value && password.value.length < 6) {
    return toast.warning('密码至少 6 位');
  }

  saving.value = true;
  try {
    const payload: Record<string, string> = {
      name: name.value.trim(),
      avatar: avatar.value,
    };
    if (password.value) payload.password = password.value;

    await auth.updateMe(payload);
    toast.success('设置已保存 🎉');
    emit('update:modelValue', false);
  } catch (e: any) {
    const err = e.payload?.error;
    if (err === 'name_taken') toast.error('该账号已被占用，换一个吧');
    else if (err === 'invalid_avatar') toast.error('头像无效');
    else toast.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    title="设置"
    width="460px"
    @update:model-value="emit('update:modelValue', $event)"
  >
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
        <label class="label">账号</label>
        <input
          v-model="name"
          type="text"
          maxlength="30"
          placeholder="家长登录账号"
          autocomplete="username"
        />
        <p class="hint">登录时使用的账号名称</p>
      </div>

      <div class="field">
        <label class="label">新密码（留空则不修改）</label>
        <input
          v-model="password"
          type="password"
          maxlength="64"
          placeholder="至少 6 位"
          autocomplete="new-password"
        />
        <p class="hint">修改后下次登录请使用新密码</p>
      </div>
    </div>

    <template #footer>
      <span style="flex:1"></span>
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
