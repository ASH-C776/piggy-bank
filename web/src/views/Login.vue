<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import GlassCard from '@/components/GlassCard.vue';
import { loadServerConfig, saveServerConfig } from '@/utils/server';
import { Capacitor } from '@capacitor/core';

type Tab = 'parent' | 'child';

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();

const tab = ref<Tab>('parent');

// 仅 App 原生环境需要配置服务器地址；网页端走同源
const isApp = Capacitor.isNativePlatform();

// 服务器连接配置（仅移动端 App 使用）
const serverHost = ref('');
const serverPort = ref('');
const serverHttps = ref(false);

// 家长表单
const username = ref('');
const password = ref('');
const loadingParent = ref(false);

// 小孩选择 + PIN
const children = ref<Array<{ id: number; name: string; avatar: string }>>([]);
const selectedChildId = ref<number | null>(null);
const pin = ref('');
const loadingChild = ref(false);

function persistServer() {
  saveServerConfig({
    useHttps: serverHttps.value,
    host: serverHost.value.trim(),
    port: serverPort.value.trim(),
  });
}

async function loadChildren() {
  try {
    const data = await auth.fetchChildren();
    children.value = data.children;
    if (children.value.length > 0) selectedChildId.value = children.value[0].id;
  } catch {
    children.value = [];
  }
}

onMounted(() => {
  if (!isApp) {
    // 网页端：直接加载小孩列表（走同源）
    loadChildren();
    return;
  }
  // App 环境：读取已保存的服务器配置
  const cfg = loadServerConfig();
  serverHost.value = cfg.host;
  serverPort.value = cfg.port;
  serverHttps.value = cfg.useHttps;
  if (serverHost.value.trim()) loadChildren();
});

// 切换到小朋友登录时刷新小孩列表
watch(tab, () => {
  if (tab.value === 'child') {
    if (!isApp || serverHost.value.trim()) loadChildren();
  }
});

// 服务器连接弹窗
const showServerModal = ref(false);

function saveServer() {
  persistServer();
  showServerModal.value = false;
  if (serverHost.value.trim()) loadChildren();
}

async function loginParent() {
  if (!username.value || !password.value) {
    toast.warning('请输入账号和密码');
    return;
  }
  if (isApp) persistServer();
  loadingParent.value = true;
  try {
    await auth.parentLogin(username.value.trim(), password.value);
    toast.success(`欢迎回来，${auth.user?.name}！`);
    router.replace({ name: 'parent-dashboard' });
  } catch (e: any) {
    toast.error(e.message || '登录失败');
  } finally {
    loadingParent.value = false;
  }
}

async function loginChild() {
  if (!selectedChildId.value) {
    toast.warning('请选择身份');
    return;
  }
  if (!pin.value) {
    toast.warning('请输入PIN码');
    return;
  }
  if (isApp) persistServer();
  loadingChild.value = true;
  try {
    await auth.childLogin(selectedChildId.value, pin.value);
    toast.success(`欢迎，${auth.user?.name}！`);
    router.replace({ name: 'child-home' });
  } catch (e: any) {
    toast.error(e.message || 'PIN码不正确');
  } finally {
    loadingChild.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="bg-blob blob-1"></div>
    <div class="bg-blob blob-2"></div>

    <div class="login-card glass-strong">
      <div class="brand">
        <img class="logo" src="/piggy-bank.png" alt="存钱罐" />
        <h1 class="title">存钱罐</h1>
        <p class="subtitle">Piggy Bank · 家庭积分管家</p>
      </div>

      <!-- 服务器连接配置（仅 App 显示，网页端走同源不需要配置） -->
      <button v-if="isApp" type="button" class="server-settings-btn" @click="showServerModal = true">⚙️ 服务器设置</button>

      <div class="tabs">
        <button :class="{ active: tab === 'parent' }" @click="tab = 'parent'">家长</button>
        <button :class="{ active: tab === 'child' }" @click="tab = 'child'">小朋友</button>
      </div>

      <!-- 家长登录 -->
      <form v-if="tab === 'parent'" class="form" @submit.prevent="loginParent">
        <label class="field row-field">
          <span class="label">账号</span>
          <input v-model="username" type="text" placeholder="家长账号" autocomplete="username" />
        </label>
        <label class="field row-field">
          <span class="label">密码</span>
          <input v-model="password" type="password" placeholder="请输入密码" autocomplete="current-password" />
        </label>
        <button class="btn btn-primary submit" :disabled="loadingParent" type="submit">
          {{ loadingParent ? '登录中...' : '登录' }}
        </button>
      </form>

      <!-- 小孩登录 -->
      <form v-else class="form" @submit.prevent="loginChild">
        <div class="field">
          <span class="label">选择身份</span>
          <div v-if="children.length === 0" class="no-children">
            家长还没有创建小朋友账号哦~
          </div>
          <div v-else class="child-grid">
            <button
              v-for="c in children"
              :key="c.id"
              type="button"
              :class="['child-chip', { active: selectedChildId === c.id }]"
              @click="selectedChildId = c.id"
            >
              <ZodiacAvatar :zodiac="c.avatar" :size="60" />
              <span>{{ c.name }}</span>
            </button>
          </div>
        </div>
        <label class="field row-field">
          <span class="label">PIN码</span>
          <input
            v-model="pin"
            type="password"
            inputmode="numeric"
            maxlength="6"
            placeholder="请输入4-6位数字PIN"
            autocomplete="off"
          />
        </label>
        <button class="btn btn-primary submit" :disabled="loadingChild" type="submit">
          {{ loadingChild ? '登录中...' : '冲鸭！' }}
        </button>
      </form>

      <!-- 服务器设置弹窗 -->
      <div v-if="showServerModal" class="modal-mask" @click.self="showServerModal = false">
        <div class="modal-box">
          <div class="modal-title">服务器设置</div>
          <div class="server-row">
            <label class="field addr">
              <span class="label">地址</span>
              <input v-model="serverHost" type="text" placeholder="192.168.31.26" autocapitalize="off" spellcheck="false" />
            </label>
            <label class="field port">
              <span class="label">端口</span>
              <input v-model="serverPort" type="tel" inputmode="numeric" placeholder="3000" />
            </label>
          </div>
          <button
            type="button"
            class="scheme-toggle"
            :aria-pressed="serverHttps"
            @click="serverHttps = !serverHttps"
          >
            <span :class="{ active: !serverHttps }">HTTP</span>
            <span :class="{ active: serverHttps }">HTTPS</span>
          </button>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="showServerModal = false">取消</button>
            <button type="button" class="btn btn-primary" @click="saveServer">保存</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
  overflow: hidden;
}

.bg-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.45;
  pointer-events: none;
  animation: float 12s ease-in-out infinite;
}
.blob-1 {
  width: 320px;
  height: 320px;
  background: var(--accent-orange);
  top: -80px;
  left: -80px;
}
.blob-2 {
  width: 380px;
  height: 380px;
  background: var(--accent-pink);
  bottom: -100px;
  right: -100px;
  animation-delay: 4s;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(30px, -20px); }
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: 26px 24px;
  position: relative;
  z-index: 1;
}

.brand {
  text-align: center;
  margin-bottom: 12px;
}
.logo {
  width: 76px;
  height: 76px;
  margin-bottom: 6px;
  border-radius: 18px;
  object-fit: cover;
  box-shadow: 0 6px 18px rgba(90, 160, 130, 0.25);
}
.title {
  font-size: 24px;
  margin-bottom: 2px;
  background: linear-gradient(135deg, var(--accent-yellow), var(--accent-orange));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.subtitle {
  color: var(--text-secondary);
  font-size: 13px;
}

.tabs {
  display: flex;
  background: var(--glass-bg);
  border-radius: var(--r-md);
  padding: 4px;
  margin-bottom: 24px;
}
.tabs button {
  flex: 1;
  padding: 10px;
  border-radius: var(--r-sm);
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s;
}
.tabs button.active {
  background: linear-gradient(135deg, var(--accent-orange), var(--accent-pink));
  color: #1a1a2e;
  box-shadow: 0 4px 12px rgba(255, 155, 176, 0.3);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 服务器设置按钮 */
.server-settings-btn {
  align-self: flex-start;
  background: rgba(255, 155, 176, 0.12);
  border: 1px solid rgba(255, 155, 176, 0.25);
  color: var(--text-secondary);
  border-radius: 14px;
  padding: 6px 12px;
  font-size: 12px;
  margin-bottom: 12px;
  cursor: pointer;
}
/* 服务器设置弹窗 */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(26, 26, 46, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  padding: 24px;
}
.modal-box {
  width: 100%;
  max-width: 340px;
  background: #fffdf6;
  border: 1px solid var(--glass-border);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.18);
  border-radius: 20px;
  padding: 18px 16px;
}
.modal-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}
.modal-box .server-row { margin-bottom: 8px; }
.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.modal-actions .btn { flex: 1; }
.btn-ghost {
  background: transparent;
  border: 1px solid var(--glass-border);
  color: var(--text-secondary);
}
.server-row {
  display: flex;
  gap: 8px;
}
.server-row .addr { flex: 1; }
.server-row .port { width: 108px; flex-shrink: 0; }
.scheme-toggle {
  display: inline-flex;
  background: rgba(255, 155, 176, 0.15);
  border-radius: 20px;
  padding: 3px;
  gap: 2px;
  margin-top: 6px;
  cursor: pointer;
}
.scheme-toggle span {
  padding: 5px 16px;
  border-radius: 18px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  transition: all 0.2s;
}
.scheme-toggle span.active {
  background: linear-gradient(135deg, var(--accent-orange), var(--accent-pink));
  color: #1a1a2e;
  box-shadow: 0 2px 6px rgba(255, 155, 176, 0.3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
/* 账号、密码、PIN 等：标签与输入框同一行，压缩纵向高度 */
.field.row-field {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.field.row-field .label {
  width: 50px;
  flex-shrink: 0;
  padding-left: 0;
  font-size: 13px;
}
.field.row-field input {
  flex: 1;
  min-width: 0;
}
.label {
  font-size: 13px;
  color: var(--text-secondary);
  padding-left: 4px;
}

.submit {
  margin-top: 2px;
  padding: 11px 20px;
  font-size: 15px;
}

.child-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 10px;
  margin-top: 4px;
}
.child-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px;
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 2px solid transparent;
  transition: all 0.2s;
  font-size: 13px;
}
.child-chip:hover {
  background: var(--glass-bg-strong);
}
.child-chip.active {
  background: var(--glass-bg-strong);
  border-color: var(--accent-orange);
  box-shadow: 0 0 0 3px rgba(255, 180, 84, 0.15);
}

.no-children {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-family: var(--font-cute);
  background: var(--glass-bg);
  border-radius: var(--r-md);
}

@media (max-width: 380px) {
  .login-card { padding: 28px 20px; }
  .title { font-size: 28px; }
}
</style>
