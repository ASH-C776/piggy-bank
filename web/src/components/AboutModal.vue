<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getAbout, type AboutInfo } from '@/api/about';
import Modal from '@/components/Modal.vue';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
}>();

const info = ref<AboutInfo | null>(null);
const checking = ref(false);
/** 服务端连不上更新源（info 可能仍在，只是 latestVersion 为空） */
const checkFailed = ref(false);

async function load(force = false) {
  checking.value = true;
  checkFailed.value = false;
  try {
    info.value = await getAbout(force);
    // 接口本身 200 但远程检查失败：latestVersion 为空 + checkError 有值
    checkFailed.value = Boolean(info.value.checkError);
  } catch {
    checkFailed.value = true;
  } finally {
    checking.value = false;
  }
}

// 打开即查（服务端 30 分钟 TTL 缓存，不会每次打外网）
watch(
  () => props.modelValue,
  (open) => {
    if (open) load(false);
  }
);

// 显示成「ASH-C776/piggy-bank」而不是完整 URL：移动端弹窗宽度下
// 完整 URL 会被省略号截断，去掉 https:// 与域名后刚好一行放下
const repoShort = computed(() =>
  (info.value?.repoUrl ?? 'https://github.com/ASH-C776/piggy-bank')
    .replace(/^https?:\/\/(www\.)?github\.com\//, '')
);

// 图标用**运行时相对路径** './piggy-bank.png' 而不是 '/piggy-bank.png'：
// 飞牛统一网关前缀（/app/com.piggybank.app/）下，绝对路径会打到飞牛站点根目录而 404。
// 也不能在模板里写字符串字面量 —— 那会被 vite 在构建时按组件文件位置解析
// （components/ 下没有这个文件，直接构建失败），故用绑定值。
const logoUrl = './piggy-bank.png';

/** 更新内容预览：manifest changelog 是单行 HTML（<br> 分隔、· 前缀），
 *  去标签后压成一句话并截断——只当「值不值得升」的参考，完整说明去仓库看 */
const changelogPreview = computed(() => {
  const raw = info.value?.latestChangelog;
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/[·•]\s*/g, '· ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
});

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    title="关于"
    width="460px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="about-panel">
      <!-- 品牌区 -->
      <div class="app-hero">
        <img class="app-logo" :src="logoUrl" alt="存钱罐图标" />
        <div class="app-meta">
          <div class="app-name">存钱罐</div>
          <div class="app-tagline">家庭儿童积分管理</div>
        </div>
      </div>

      <!-- 信息行 -->
      <div class="info-rows">
        <div class="info-row">
          <span class="ir-label">版本</span>
          <span class="ir-value">v{{ info?.version ?? '—' }}</span>
        </div>
        <div class="info-row">
          <span class="ir-label">作者</span>
          <span class="ir-value">基耶杰</span>
        </div>
        <div class="info-row">
          <span class="ir-label">开源仓库</span>
          <a
            class="ir-value ir-link"
            :href="info?.repoUrl ?? 'https://github.com/ASH-C776/piggy-bank'"
            target="_blank"
            rel="noopener"
          >
            {{ repoShort }}
          </a>
        </div>
      </div>

      <div class="section-title">检查更新</div>

      <!-- 有新版本 -->
      <div v-if="info?.updateAvailable" class="update-card has-update">
        <div class="u-head">
          <span class="u-badge">有更新</span>
          <span class="u-versions">v{{ info.version }} → <b>v{{ info.latestVersion }}</b></span>
        </div>
        <p v-if="changelogPreview" class="u-changelog">{{ changelogPreview }}</p>
        <div class="u-actions">
          <a class="btn btn-primary" :href="info.releasesUrl" target="_blank" rel="noopener">
            前往更新
          </a>
          <button class="btn btn-ghost" :disabled="checking" @click="load(true)">
            {{ checking ? '检查中...' : '重新检查' }}
          </button>
        </div>
      </div>

      <!-- 已是最新 -->
      <div v-else-if="info && !checkFailed" class="update-card">
        <div class="u-head">
          <span class="u-ok">✓ 已是最新版本</span>
          <span v-if="info.checkedAt" class="u-time">检查于 {{ formatTime(info.checkedAt) }}</span>
        </div>
        <div class="u-actions">
          <button class="btn btn-ghost" :disabled="checking" @click="load(true)">
            {{ checking ? '检查中...' : '检查更新' }}
          </button>
        </div>
      </div>

      <!-- 首次打开、检查中 -->
      <div v-else-if="checking && !info" class="update-card">
        <div class="u-head"><span class="u-time">正在检查更新...</span></div>
      </div>

      <!-- 检查失败 -->
      <div v-else class="update-card">
        <div class="u-head"><span class="u-fail">检查失败，请稍后重试</span></div>
        <p class="u-hint">也可以直接打开上方的仓库地址，查看是否发布了新版本</p>
        <div class="u-actions">
          <button class="btn btn-ghost" :disabled="checking" @click="load(true)">
            {{ checking ? '检查中...' : '重试' }}
          </button>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.about-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
}

.app-hero {
  display: flex;
  align-items: center;
  gap: var(--space-16);
  padding: var(--space-16);
  border-radius: var(--r-lg);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
}
.app-logo {
  width: 56px;
  height: 56px;
  border-radius: var(--r-md);
  object-fit: cover;
  flex: none;
}
.app-name {
  font-family: var(--font-cute);
  font-size: var(--fs-xl);
  color: var(--text-primary);
}
.app-tagline {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-top: var(--space-2);
}

.info-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
  padding: var(--space-10) var(--space-12);
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
}
.info-row:nth-child(odd) {
  background: var(--glass-bg);
}
.ir-label {
  color: var(--text-secondary);
  flex: none;
}
.ir-value {
  color: var(--text-primary);
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ir-link {
  color: var(--text-on-orange);
  font-weight: 500;
}
.ir-link:hover {
  text-decoration: underline;
}

.section-title {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--text-secondary);
  margin-top: var(--space-4);
}

.update-card {
  padding: var(--space-16);
  border-radius: var(--r-lg);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}
/* 有更新：暖黄底 + 同色相深色字（--text-on-yellow 白底 5.54:1） */
.update-card.has-update {
  background: rgba(255, 209, 102, 0.16);
  border-color: rgba(255, 209, 102, 0.55);
}
.u-head {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  flex-wrap: wrap;
}
.u-badge {
  font-size: var(--fs-2xs);
  font-weight: 700;
  padding: 2px var(--space-10);
  border-radius: var(--r-pill);
  background: var(--accent-orange);
  color: #fff;
}
.u-versions {
  font-size: var(--fs-sm);
  color: var(--text-on-yellow);
  font-variant-numeric: tabular-nums;
}
.u-versions b {
  font-weight: 700;
}
.u-changelog {
  font-size: var(--fs-xs);
  color: var(--text-on-yellow);
  line-height: 1.6;
}
.u-ok {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-on-mint);
}
.u-fail {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-on-red);
}
.u-time {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.u-hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  line-height: 1.6;
}
.u-actions {
  display: flex;
  gap: var(--space-10);
  flex-wrap: wrap;
}
</style>
