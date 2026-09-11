<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter, RouterView } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useWsStore } from '@/stores/ws';
import { api } from '@/api/client';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import SettingsModal from '@/components/SettingsModal.vue';

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const ws = useWsStore();

const navItems = [
  { to: '/parent', label: '总览', icon: '🏠' },
  { to: '/parent/tasks', label: '任务', icon: '📝' },
  { to: '/parent/points', label: '积分', icon: '⭐' },
  { to: '/parent/shop', label: '商城', icon: '🎁' },
  { to: '/parent/review', label: '审核', icon: '✅' },
];

const menuOpen = ref(false);
const settingsOpen = ref(false);
const pendingReviewCount = ref(0);

async function loadPendingCount() {
  try {
    const data = await api.get<{ pendingReview?: { total: number } }>('/dashboard');
    pendingReviewCount.value = data.pendingReview?.total ?? 0;
  } catch {}
}

const avatarRef = ref<HTMLElement | null>(null);

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) {
    nextTick(() => {
      document.addEventListener('click', onDocClick, { capture: true });
    });
  }
}

function closeMenu() {
  menuOpen.value = false;
  document.removeEventListener('click', onDocClick);
}

function onDocClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (avatarRef.value?.contains(target)) return; // 点击头像区域不关闭
  closeMenu();
}

function openSettings() {
  closeMenu();
  settingsOpen.value = true;
}

function logout() {
  closeMenu();
  ws.disconnect();
  auth.logout();
  toast.success('已退出登录');
  router.replace('/login');
}

onMounted(async () => {
  // 刷新身份：仅凭证失效(401)才登出；网络等瞬时错误保持登录，避免"欢迎回来又跳回登录"
  try {
    await auth.refreshMe();
  } catch (e: any) {
    if (e?.status === 401) {
      auth.logout();
      router.replace('/login');
      return;
    }
    toast.error(e?.message || '数据加载失败');
  }
  try {
    ws.connect();
    await loadPendingCount();
  } catch {}
  // 监听 ws 事件刷新计数
  window.addEventListener('ws:new_exchange_request', loadPendingCount);
  window.addEventListener('ws:exchange_reviewed', loadPendingCount);
  window.addEventListener('ws:task_completion_submitted', loadPendingCount);
  window.addEventListener('ws:task_review', loadPendingCount);
  // Review.vue 审核后通知刷新
  window.addEventListener('review:updated', loadPendingCount);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  ws.disconnect();
  window.removeEventListener('ws:new_exchange_request', loadPendingCount);
  window.removeEventListener('ws:exchange_reviewed', loadPendingCount);
  window.removeEventListener('ws:task_completion_submitted', loadPendingCount);
  window.removeEventListener('ws:task_review', loadPendingCount);
  window.removeEventListener('review:updated', loadPendingCount);
});
</script>

<template>
  <div class="parent-layout">
    <header class="topbar glass">
      <div class="brand">
        <img class="logo" src="/piggy-bank.png" alt="" />
        <span class="name">存钱罐</span>
      </div>
      <div class="spacer"></div>
      <div class="avatar-wrap" ref="avatarRef">
        <button
          class="avatar-btn"
          :class="{ open: menuOpen }"
          @click="toggleMenu"
          title="账号菜单"
        >
          <ZodiacAvatar :zodiac="auth.user?.avatar" :size="42" />
        </button>
        <Transition name="menu-pop">
          <div v-if="menuOpen" class="dropdown">
            <div class="menu-header">
              <ZodiacAvatar :zodiac="auth.user?.avatar" :size="48" show-ring />
              <div class="info">
                <div class="m-name">{{ auth.user?.name }}</div>
                <div class="m-role">家长账号</div>
              </div>
            </div>
            <button class="menu-item" @click="openSettings">
              <span class="mi-icon">⚙️</span>
              <span>设置</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item danger" @click="logout">
              <span class="mi-icon">👋</span>
              <span>退出登录</span>
            </button>
          </div>
        </Transition>
      </div>
    </header>

    <main class="main scroll-area">
      <RouterView />
    </main>

    <nav class="tabbar glass-strong">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="tab"
        :class="{ active: $route.path === item.to }"
      >
        <span class="icon">
          {{ item.icon }}
          <span v-if="item.to === '/parent/review' && pendingReviewCount > 0" class="dot"></span>
        </span>
        <span class="label">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <SettingsModal v-model="settingsOpen" />
  </div>
</template>

<style scoped>
.parent-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: radial-gradient(circle at 20% 10%, #fdf3e0 0%, transparent 50%),
              radial-gradient(circle at 80% 90%, #f5e3cb 0%, transparent 50%),
              linear-gradient(135deg, #faf5ec 0%, #f4ead9 50%, #ecdcc6 100%);
}

.topbar {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  object-fit: cover;
}
.name {
  font-family: var(--font-cute);
  font-size: 18px;
  background: linear-gradient(135deg, var(--accent-yellow), var(--accent-orange));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.spacer {
  flex: 1;
}

.avatar-wrap {
  position: relative;
}
.avatar-btn {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  overflow: hidden;
  padding: 0;
  background: transparent;
  border: 2px solid var(--glass-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  cursor: pointer;
}
.avatar-btn:hover {
  border-color: rgba(255, 255, 255, 0.4);
  transform: scale(1.05);
}
.avatar-btn.open {
  border-color: var(--accent-yellow);
  box-shadow: 0 0 0 3px rgba(255, 209, 102, 0.18);
}

.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 220px;
  padding: 8px;
  border-radius: var(--r-lg);
  z-index: 30;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 12px 32px rgba(255, 140, 170, 0.3);
}
.menu-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px 12px;
  border-bottom: 1px solid var(--glass-border);
  margin-bottom: 6px;
}
.menu-header .info { flex: 1; min-width: 0; }
.m-name {
  font-family: var(--font-cute);
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-role {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  transition: background 0.15s;
  text-align: left;
}
.menu-item:hover {
  background: var(--glass-bg);
}
.menu-item.danger:hover {
  background: rgba(255, 107, 107, 0.12);
  color: var(--accent-red);
}
.mi-icon { font-size: 16px; }
.menu-divider {
  height: 1px;
  background: var(--glass-border);
  margin: 4px 0;
}

.menu-pop-enter-active,
.menu-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
  transform-origin: top right;
}
.menu-pop-enter-from,
.menu-pop-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(-6px);
}

.main {
  flex: 1;
  overflow-y: auto;
}

.tabbar {
  display: flex;
  padding: 8px;
  gap: 4px;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-bottom: none;
  padding-bottom: max(8px, env(safe-area-inset-bottom, 0px));
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: var(--r-md);
  transition: all 0.2s;
}
.tab .icon { font-size: 22px; position: relative; }
.tab .icon .badge {
  position: absolute;
  top: -4px;
  right: -8px;
  background: var(--accent-red);
  color: white;
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.tab .icon .dot {
  position: absolute;
  top: 0px;
  right: -4px;
  width: 12px;
  height: 12px;
  background: #ff4444;
  border-radius: 50%;
  border: 2px solid var(--glass-bg-strong);
  box-shadow: 0 0 6px rgba(255, 68, 68, 0.7);
}
.tab .label { font-size: 12px; font-weight: 500; }
.tab.active {
  color: var(--accent-yellow);
  background: rgba(255, 209, 102, 0.12);
}
</style>
