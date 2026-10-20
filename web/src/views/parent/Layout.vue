<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter, useRoute, RouterView } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useWsStore } from '@/stores/ws';
import { api } from '@/api/client';
import ZodiacAvatar from '@/components/ZodiacAvatar.vue';
import NavIcon, { type NavIconName } from '@/components/NavIcon.vue';
import ReviewEntryButton from '@/components/ReviewEntryButton.vue';
import ReviewPanel from '@/components/ReviewPanel.vue';
import Modal from '@/components/Modal.vue';
import SettingsModal from '@/components/SettingsModal.vue';
import BackupModal from '@/components/BackupModal.vue';
import AboutModal from '@/components/AboutModal.vue';
import { getAbout, type AboutInfo } from '@/api/about';

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const route = useRoute();
const ws = useWsStore();

// 见 child/Layout.vue 同处说明：图标由 emoji 换成跟随 currentColor 的 SVG
// 审核**不在**这里：它是待办而不是一个页面，入口改为总览页右下角的浮动按钮（见下）。
const navItems: { to: string; label: string; icon: NavIconName }[] = [
  { to: '/parent', label: '总览', icon: 'home' },
  { to: '/parent/tasks', label: '任务', icon: 'tasks' },
  { to: '/parent/points', label: '积分', icon: 'points' },
  // 流水 tab 已撤：底部栏 6 个太挤，且总览页上方本来就有积分记录入口
  // （/parent/logs 路由保留，Dashboard 的「查看全部」仍跳这里）。
  { to: '/parent/growth', label: '成长', icon: 'growth' },
  { to: '/parent/shop', label: '商城', icon: 'shop' },
];

const menuOpen = ref(false);
const settingsOpen = ref(false);
const backupOpen = ref(false);
const aboutOpen = ref(false);
const reviewOpen = ref(false);
const pendingReviewCount = ref(0);

/** 头像菜单「关于」行右侧的角标：有新版本显示「有更新」，否则显示当前版本号。
 *  拉取失败就保持null —— 角标不显示，但不影响菜单其余功能。 */
const aboutInfo = ref<AboutInfo | null>(null);

async function loadAboutBadge() {
  try {
    aboutInfo.value = await getAbout();
  } catch {}
}

// logo 用运行时相对路径而非 '/piggy-bank.png'：飞牛网关前缀
// （/app/com.piggybank.app/）下绝对路径会打到飞牛站点根目录而 404。
// 绑定值而非模板字面量——否则 vite 构建时按组件位置解析相对路径会直接报错。
const logoUrl = './piggy-bank.png';

/** 只有总览页显示审核入口 —— 一次导航即可到达，不必把浮层铺满每个页面 */
const onDashboard = computed(() => route.path === '/parent');

// 浮层挡不住浏览器前进/后退与程序化跳转，离开总览就把弹窗收掉
watch(
  () => route.path,
  () => {
    reviewOpen.value = false;
  }
);

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

/** 总览页「多久没备份」提醒条点击后派发 backup:open 事件，在这里统一开弹窗 */
function openBackup() {
  closeMenu();
  backupOpen.value = true;
}

/**
 * 「关于与检查更新」入口提到头像菜单里（退出按钮前），不再藏在设置里 ——
 * 版本号和「有更新」是用户会主动关心的信息，埋进二级页等于没有。
 * 角标数据在挂载时拉一次：服务端 /api/about 有 30 分钟 TTL 缓存，不会反复打外网。
 */
function openAbout() {
  closeMenu();
  aboutOpen.value = true;
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
  loadAboutBadge();
  // 监听 ws 事件刷新计数
  window.addEventListener('ws:new_exchange_request', loadPendingCount);
  window.addEventListener('ws:exchange_reviewed', loadPendingCount);
  window.addEventListener('ws:task_completion_submitted', loadPendingCount);
  window.addEventListener('ws:task_review', loadPendingCount);
  // Review.vue 审核后通知刷新
  window.addEventListener('review:updated', loadPendingCount);
  // 总览页「多久没备份」提醒条 → 打开备份弹窗
  window.addEventListener('backup:open', openBackup);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  ws.disconnect();
  window.removeEventListener('ws:new_exchange_request', loadPendingCount);
  window.removeEventListener('ws:exchange_reviewed', loadPendingCount);
  window.removeEventListener('ws:task_completion_submitted', loadPendingCount);
  window.removeEventListener('ws:task_review', loadPendingCount);
  window.removeEventListener('review:updated', loadPendingCount);
  window.removeEventListener('backup:open', openBackup);
});
</script>

<template>
  <div class="parent-layout">
    <header class="topbar glass">
      <div class="brand">
        <img class="logo" :src="logoUrl" alt="" />
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
          <!-- 见 child/Layout.vue 同处说明：内容盒只有 38px，42px 头像会被裁掉 2px -->
          <ZodiacAvatar :zodiac="auth.user?.avatar" :size="38" />
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
              <span class="mi-icon"><NavIcon name="settings" /></span>
              <span>设置</span>
            </button>
            <button class="menu-item" @click="openBackup">
              <span class="mi-icon"><NavIcon name="backup" /></span>
              <span>备份与恢复</span>
            </button>
            <button class="menu-item" @click="openAbout">
              <span class="mi-icon"><NavIcon name="about" /></span>
              <span class="mi-label">关于与检查更新</span>
              <span v-if="aboutInfo?.updateAvailable" class="mi-badge is-new">有更新</span>
              <span v-else-if="aboutInfo" class="mi-badge">v{{ aboutInfo.version }}</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item danger" @click="logout">
              <span class="mi-icon"><NavIcon name="logout" /></span>
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
          <NavIcon :name="item.icon" />
        </span>
        <span class="label">{{ item.label }}</span>
      </RouterLink>

      <!-- 审核入口：只在总览页出现，浮在导航栏右下角。
           放在 .tabbar 内部是为了拿到 bottom:100% 这个定位基准 ——
           否则得把导航栏的高度写死在 CSS 里，安全区一变就错位。 -->
      <ReviewEntryButton
        v-if="onDashboard"
        :count="pendingReviewCount"
        @click="reviewOpen = true"
      />
    </nav>

    <Modal v-model="reviewOpen" title="审核中心" width="560px">
      <ReviewPanel embedded />
    </Modal>

    <SettingsModal v-model="settingsOpen" />
    <BackupModal v-model="backupOpen" />
    <AboutModal v-model="aboutOpen" />
  </div>
</template>

<style scoped>
.parent-layout {
  display: flex;
  flex-direction: column;
  /* 见 child/Layout.vue 同处说明：dvh 跟随移动端可见高度，vh 作旧浏览器回退 */
  height: 100vh;
  height: 100dvh;
  background: radial-gradient(circle at 20% 10%, #fdf3e0 0%, transparent 50%),
              radial-gradient(circle at 80% 90%, #f5e3cb 0%, transparent 50%),
              linear-gradient(135deg, #faf5ec 0%, #f4ead9 50%, #ecdcc6 100%);
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
  display: flex;
  align-items: center;
  gap: var(--space-8);
}
.logo {
  width: 32px;
  height: 32px;
  border-radius: var(--r-xs);
  object-fit: cover;
}
.name {
  font-family: var(--font-cute);
  font-size: var(--fs-lg);
  /* 兜底：不支持 background-clip:text 时显示深色实字，
     否则 -webkit-text-fill-color:transparent 会让文字整段消失 */
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
.spacer {
  flex: 1;
}

.avatar-wrap {
  position: relative;
}
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
  width: 220px;
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
  /* 行距收紧：原来 emoji 图标自带高大的字形盒，把每行撑得忽高忽低；
     换成固定尺寸的 SVG 后行高一致，垂直 padding 也从 10 收到 8，
     三行菜单整体更紧凑、间距均匀。 */
  padding: var(--space-8) var(--space-10);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-primary);
  font-size: var(--fs-sm);
  line-height: 1.4;
  transition: background var(--dur-fast);
  text-align: left;
}
.menu-item:hover {
  background: var(--glass-bg);
}
.menu-item.danger:hover {
  background: rgba(255, 107, 107, 0.12);
  color: var(--text-on-red);
}
/* 图标固定 18px 见方（fs-lg），SVG 在 NavIcon 里是 1em，跟着这里走 */
.mi-icon {
  display: inline-flex;
  flex: none;
  font-size: var(--fs-lg);
  color: var(--text-secondary);
}
.menu-item.danger .mi-icon {
  color: var(--text-on-red);
}
/* 「关于」行的文案 + 右侧版本角标。
   mi-label 用 flex:1 把角标顶到行尾；不加 min-width:0 的话
   「关于与检查更新」在窄屏会被挤到换行而不是省略号。 */
.mi-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mi-badge {
  flex: none;
  font-size: var(--fs-xs);
  line-height: 1.6;
  padding: 0 var(--space-6);
  border-radius: var(--r-sm);
  background: var(--glass-bg);
  color: var(--text-muted);
  white-space: nowrap;
}
.mi-badge.is-new {
  background: var(--accent-orange);
  color: var(--text-on-orange);
  font-weight: 600;
}
.menu-divider {
  height: 1px;
  background: var(--glass-border);
  margin: var(--space-4) 0;
}

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

.main {
  flex: 1;
  overflow-y: auto;
}

.tabbar {
  display: flex;
  padding: var(--space-8);
  gap: var(--space-4);
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-bottom: none;
  padding-bottom: max(var(--space-8), env(safe-area-inset-bottom, 0px));
  /* 审核入口按钮的定位基准：它用 bottom:100% 贴在本栏上沿，
     这样导航栏因安全区/字号变化时按钮会自己跟着走 */
  position: relative;
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
   选中态把图标点亮成深橙，于是"当前在哪一页"多了一个不依赖小字的线索。 */
.tab.active .icon { color: var(--text-on-orange); }
/* 原「审核 tab 右上角红点」已随 R3 一起移除：入口搬到总览页右下角的浮动按钮后，
   红点升级成带数字的圆形角标（见 ReviewEntryButton.vue）。 */
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
