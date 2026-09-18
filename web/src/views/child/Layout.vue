<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter, RouterView, RouterLink, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useWsStore } from '@/stores/ws';
import { api } from '@/api/client';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import NavIcon, { type NavIconName } from '@/components/NavIcon.vue';
import ChildSettingsModal from '@/components/ChildSettingsModal.vue';

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const route = useRoute();
const ws = useWsStore();

// icon 用组件名而不是 emoji 字符：emoji 是彩色位图，color 改不动它，
// 选中态只能靠一行小字 + 一根细条表达（B7 换成会跟随 currentColor 的 SVG）。
const navItems: { to: string; label: string; icon: NavIconName }[] = [
  { to: '/child', label: '主页', icon: 'home' },
  { to: '/child/tasks', label: '任务', icon: 'tasks' },
  { to: '/child/growth', label: '成长', icon: 'growth' },
  { to: '/child/shop', label: '商城', icon: 'shop' },
];

// 子路由（如 /child/growth/detail）也要让父级 tab 保持高亮
function isActive(to: string): boolean {
  return to === '/child' ? route.path === '/child' : route.path.startsWith(to);
}

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
          <!-- 38 而不是 42：按钮是 42px 见方 + 2px 边框，border-box 下内容盒只有
               38px，塞 42px 头像会被 overflow:hidden 裁掉四周各 2px。
               （尺寸改小但按钮本身不变，因此没有布局位移。） -->
          <ZodiacAvatar :zodiac="auth.user?.avatar" :size="38" />
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
        :class="{ active: isActive(item.to) }"
      >
        <span class="icon">
          <NavIcon :name="item.icon" />
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
  /* 100vh 在移动端地址栏可见时偏高，会把底部导航推出屏幕；dvh 跟随可见高度。
     保留 100vh 作为旧浏览器回退。 */
  height: 100vh;
  height: 100dvh;
}

.topbar {
  display: flex;
  align-items: center;
  padding: var(--space-12) var(--space-20);
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
  position: sticky;
  top: 0;
  z-index: 10;
  padding-top: max(var(--space-12), env(safe-area-inset-top, 0px));
}
.brand {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-8);
}
.logo { width: 32px; height: 32px; border-radius: var(--r-xs); object-fit: cover; }
.name {
  font-family: var(--font-cute);
  font-size: var(--fs-lg);
  /* 兜底：不支持 background-clip:text 时显示深色实字，避免品牌名整段消失 */
  color: var(--text-on-orange);
}
@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  .name {
    background: linear-gradient(135deg, var(--accent-yellow), var(--accent-orange));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}

.avatar-wrap { position: relative; }
.avatar-btn {
  width: 42px;
  height: 42px;
  border-radius: var(--r-full);
  overflow: hidden;
  padding: 0;
  background: transparent;
  border: 2px solid var(--glass-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--dur-base);
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
  top: calc(100% + var(--space-8));
  right: 0;
  width: 200px;
  padding: var(--space-8);
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
  gap: var(--space-10);
  padding: var(--space-10) var(--space-8) var(--space-12);
  border-bottom: 1px solid var(--glass-border);
  margin-bottom: var(--space-6);
}
.menu-header .info { flex: 1; min-width: 0; }
.m-name {
  font-family: var(--font-cute);
  font-size: var(--fs-md);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-role {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-top: var(--space-2);
}
.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-10) var(--space-10);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-primary);
  font-size: var(--fs-sm);
  transition: background var(--dur-fast);
  text-align: left;
}
.menu-item.danger:hover {
  background: rgba(255, 107, 107, 0.12);
  color: var(--text-on-red);
}
.mi-icon { font-size: var(--fs-md); }

.menu-pop-enter-active,
.menu-pop-leave-active {
  transition: opacity var(--dur-base) ease, transform var(--dur-base) ease;
  transform-origin: top right;
}
.menu-pop-enter-from,
.menu-pop-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(-6px);
}

.main { flex: 1; overflow-y: auto; padding-bottom: var(--space-20); }

.tabbar {
  display: flex;
  padding: var(--space-8);
  gap: var(--space-4);
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-bottom: none;
  padding-bottom: max(var(--space-8), env(safe-area-inset-bottom, 0px));
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-10) var(--space-4);
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: var(--r-md);
  transition: all var(--dur-base);
  /* 供 ::after 选中指示条定位；指示条落在 padding 区内，不撑高导航栏 */
  position: relative;
}
.tab .icon { font-size: var(--fs-2xl); position: relative; }
/* 图标由 emoji 换成 stroke="currentColor" 的 SVG 后，color 终于能作用到它身上：
   选中态把图标点亮成深橙，于是"当前在哪一页"多了一个不依赖小字的线索
   （这正是 B7 换掉 emoji 的目的）。未选中继承 .tab 的 --text-secondary。 */
.tab.active .icon { color: var(--text-on-orange); }
.tab .icon .dot {
  position: absolute;
  top: 0px;
  right: calc(-1 * var(--space-4));
  width: 12px;
  height: 12px;
  /* 原先是编外色 #ff4444。改用调色板里的加深红：它是"有新任务"这种承载信息的小图形，
     需要 3:1（--danger 只有 2.53:1），而 --danger-strong 的 3.91:1 达标、肉眼几乎同色。 */
  background: var(--danger-strong);
  border-radius: var(--r-full);
  border: 2px solid var(--glass-bg-strong);
  box-shadow: 0 0 6px var(--danger-strong);
}
.tab .label { font-size: var(--fs-xs); font-weight: 500; }
.tab.active {
  /* 原先用 --accent-yellow（白底仅 1.44:1，全站最低）直接做文字色，而 icon 又是 emoji、
     color 改不动它，于是"当前在哪一页"几乎看不出来。改为「深色加粗文字 + 图标转深橙 +
     底部黄色指示条」—— 让颜色去表达形状，而不是拿它当文字色。 */
  color: var(--text-primary);
  background: rgba(255, 209, 102, 0.14);
}
.tab.active .label { font-weight: 700; }
.tab.active::after {
  content: '';
  position: absolute;
  left: 50%;
  /* 用 translateX(-50%) 居中；原先 margin-left: calc(-1 * var(--space-10)) 是按 20px 宽度
     减的，而这根条只有 18px 宽，实际偏了 1px。 */
  transform: translateX(-50%);
  bottom: var(--space-2);
  width: 18px;
  height: 3px;
  border-radius: var(--r-pill);
  background: var(--accent-yellow);
}
</style>
