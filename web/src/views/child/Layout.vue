<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter, RouterView, RouterLink, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useWsStore } from '@/stores/ws';
import { api } from '@/api/client';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import ChildSettingsModal from '@/components/ChildSettingsModal.vue';

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const route = useRoute();
const ws = useWsStore();

const navItems = [
  { to: '/child', label: '主页', icon: '🏠' },
  { to: '/child/tasks', label: '任务', icon: '📝' },
  { to: '/child/shop', label: '商城', icon: '🎁' },
];

const menuOpen = ref(false);
const settingsOpen = ref(false);
const hasNewTask = ref(false);

async function checkNewTasks() {
  try {
    const res = await api.get<{ tasks: any[] }>('/adhoc-tasks/mine');
    // 有"进行中且未提交完成申请"的任务就显示红点
    hasNewTask.value = res.tasks.some((t: any) => t.display_status === 'active' && !t.completion_status);
  } catch {}
}

// 路由变化时检查：进入任务页清除红点，其他页检查是否有新任务
watch(() => route.path, (path) => {
  if (path === '/child/tasks') {
    hasNewTask.value = false;
  } else {
    checkNewTasks();
  }
});

function onWsEvent() {
  if (route.path !== '/child/tasks') checkNewTasks();
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
  if (avatarRef.value?.contains(target)) return;
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
  toast.success('拜拜~');
  router.replace('/login');
}

onMounted(async () => {
  // 刷新身份：仅凭证失效(401)才登出；网络等瞬时错误保持登录
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
    await checkNewTasks();
  } catch {}
  window.addEventListener('ws:task_review', onWsEvent);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  ws.disconnect();
  window.removeEventListener('ws:task_review', onWsEvent);
});
</script>

<template>
  <div class="child-layout">
    <header class="topbar glass">
      <div style="width:42px"></div>
      <div class="brand">
        <img class="logo" src="/piggy-bank.png" alt="" />
        <span class="name">存钱罐</span>
      </div>
      <div class="avatar-wrap" ref="avatarRef">
        <button
          class="avatar-btn"
          :class="{ open: menuOpen }"
          @click="toggleMenu"
          title="退出登录"
        >
          <ZodiacAvatar :zodiac="auth.user?.avatar" :size="42" />
        </button>
        <Transition name="menu-pop">
          <div v-if="menuOpen" class="dropdown">
            <div class="menu-header">
              <ZodiacAvatar :zodiac="auth.user?.avatar" :size="48" show-ring />
              <div class="info">
                <div class="m-name">{{ auth.user?.name }}</div>
                <div class="m-role">{{ auth.user?.totalPoints ?? 0 }} 分</div>
              </div>
            </div>
            <button class="menu-item" @click="openSettings">
              <span class="mi-icon">⚙️</span>
              <span>设置</span>
            </button>
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
          <span v-if="item.to === '/child/tasks' && hasNewTask" class="dot"></span>
        </span>
        <span class="label">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <ChildSettingsModal v-model="settingsOpen" />
  </div>
</template>

<style scoped>
.child-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
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
  padding-top: max(12px, env(safe-area-inset-top, 0px));
}
.brand {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.logo { width: 32px; height: 32px; border-radius: 9px; object-fit: cover; }
.name {
  font-family: var(--font-cute);
  font-size: 18px;
  background: linear-gradient(135deg, var(--accent-yellow), var(--accent-orange));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.avatar-wrap { position: relative; }
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
  width: 200px;
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
.menu-item.danger:hover {
  background: rgba(255, 107, 107, 0.12);
  color: var(--accent-red);
}
.mi-icon { font-size: 16px; }

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

.main { flex: 1; overflow-y: auto; padding-bottom: 20px; }

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
