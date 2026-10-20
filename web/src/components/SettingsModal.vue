<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import AboutModal from '@/components/AboutModal.vue';
import { getAbout, type AboutInfo } from '@/api/about';
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

// 「关于」二级弹窗 + 入口行上的更新角标。
// 每次打开设置拉一次 /api/about：服务端带 30 分钟 TTL 缓存，
// 不会因为反复开关设置而反复请求外网；失败就静默（角标不显示，不影响设置本身）。
const aboutOpen = ref(false);
const aboutInfo = ref<AboutInfo | null>(null);

watch(() => props.modelValue, (open) => {
  if (open) {
    name.value = auth.user?.name ?? '';
    password.value = '';
    avatar.value = auth.user?.avatar ?? 'dragon';
    getAbout()
      .then((d) => (aboutInfo.value = d))
      .catch(() => {});
  } else {
    // 设置关掉时，「关于」跟着关——否则会剩一个孤岛弹窗
    aboutOpen.value = false;
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

    <!-- 「关于」入口：与设置同级的二级页。有更新时右侧显示角标，
         点进去可见版本号 / 作者 / 仓库 / 更新说明与跳转 -->
    <div class="about-entry" @click="aboutOpen = true">
      <span class="ae-icon">ℹ️</span>
      <span class="ae-label">关于</span>
      <span v-if="aboutInfo?.updateAvailable" class="ae-badge">有更新</span>
      <span v-else-if="aboutInfo" class="ae-version">v{{ aboutInfo.version }}</span>
      <span class="ae-arrow">›</span>
    </div>

    <template #footer>
      <span style="flex:1"></span>
      <button class="btn btn-ghost" @click="emit('update:modelValue', false)">取消</button>
      <button class="btn btn-primary" @click="save" :disabled="saving">
        {{ saving ? '保存中...' : '保存' }}
      </button>
    </template>
  </Modal>

  <!-- 嵌套弹窗：Modal  Teleport 到 body 且 useDialog 用栈保证只有最上层响应 Esc/焦点 -->
  <AboutModal v-model="aboutOpen" />
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

/* 「关于」入口行：菜单行形态，与头像下拉菜单同语言 */
.about-entry {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  width: 100%;
  margin-top: var(--space-18);
  padding: var(--space-10) var(--space-12);
  border-radius: var(--r-md);
  border-top: 1px solid var(--glass-border);
  background: transparent;
  font-size: var(--fs-sm);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast);
}
.about-entry:hover {
  background: var(--glass-bg);
}
.ae-icon {
  font-size: var(--fs-md);
}
.ae-label {
  flex: 1;
}
.ae-version {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
/* 有更新角标：装饰色做底、白字（徽章属图形+短文本，白字压 3.44:1，
   与审核入口数字角标同一取舍，已在主题里登记过） */
.ae-badge {
  font-size: var(--fs-2xs);
  font-weight: 700;
  padding: 2px var(--space-10);
  border-radius: var(--r-pill);
  background: var(--accent-orange-red);
  color: #fff;
}
.ae-arrow {
  color: var(--text-muted);
  font-size: var(--fs-lg);
}
</style>
