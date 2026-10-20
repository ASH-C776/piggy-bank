<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from '@/api/client';
import {
  downloadBackup,
  toBase64,
  type BackupFileInfo,
  type BackupSettings,
  type BackupStatus,
} from '@/api/backup';
import Modal from '@/components/Modal.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { useToastStore } from '@/stores/toast';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>();

const toast = useToastStore();

const backups = ref<BackupFileInfo[]>([]);
const settings = ref<BackupSettings>({ autoEnabled: true, autoTime: '03:00', keep: 7 });
const status = ref<BackupStatus | null>(null);
const loading = ref(false);
const creating = ref(false);
const savingSettings = ref(false);
const restoring = ref(false);

// 删除确认（ConfirmDialog 只有 message 没有插槽，删除用它正合适）
const deleteOpen = ref(false);
const deleteTarget = ref<BackupFileInfo | null>(null);

// 恢复确认：需要输家长密码，用嵌套 Modal 自绘
const restoreOpen = ref(false);
const restoreLabel = ref(''); // 展示用：哪个备份/哪个文件
const restoreServerName = ref(''); // 服务器上的备份名；空 = 上传文件恢复
const restorePassword = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

async function load() {
  loading.value = true;
  try {
    const res = await api.get<{
      backups: BackupFileInfo[];
      settings: BackupSettings;
      status: BackupStatus;
    }>('/backups');
    backups.value = res.backups;
    settings.value = res.settings;
    status.value = res.status;
  } catch (e: any) {
    toast.error(e?.message || '加载备份列表失败');
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) load();
  }
);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const sourceLabels: Record<BackupFileInfo['source'], string> = {
  manual: '手动',
  auto: '自动',
  'pre-restore': '恢复前',
};

async function createNow() {
  creating.value = true;
  try {
    await api.post<{ backup: BackupFileInfo }>('/backups');
    await load();
    toast.success('备份成功');
  } catch (e: any) {
    toast.error(e?.message || '备份失败');
  } finally {
    creating.value = false;
  }
}

async function backupAndDownload() {
  creating.value = true;
  try {
    const res = await api.post<{ backup: BackupFileInfo }>('/backups');
    await downloadBackup(res.backup.name);
    await load();
    toast.success('已备份并开始下载');
  } catch (e: any) {
    toast.error(e?.message || '备份失败');
  } finally {
    creating.value = false;
  }
}

async function onDownload(b: BackupFileInfo) {
  try {
    await downloadBackup(b.name);
  } catch (e: any) {
    toast.error(e?.message || '下载失败');
  }
}

function askDelete(b: BackupFileInfo) {
  deleteTarget.value = b;
  deleteOpen.value = true;
}

async function doDelete() {
  const b = deleteTarget.value;
  if (!b) return;
  try {
    await api.delete(`/backups/${encodeURIComponent(b.name)}`);
    await load();
    toast.success('已删除');
  } catch (e: any) {
    toast.error(e?.message || '删除失败');
  } finally {
    deleteTarget.value = null;
    deleteOpen.value = false;
  }
}

function askRestoreServer(b: BackupFileInfo) {
  restoreServerName.value = b.name;
  restoreLabel.value = `${formatTime(b.createdAt)} 的备份`;
  restorePassword.value = '';
  restoreOpen.value = true;
}

function askRestoreUpload() {
  const file = fileInput.value?.files?.[0];
  if (!file) return toast.warning('请先选择 .db 备份文件');
  restoreServerName.value = '';
  restoreLabel.value = `文件「${file.name}」`;
  restorePassword.value = '';
  restoreOpen.value = true;
}

async function doRestore() {
  if (!restorePassword.value) return toast.warning('请输入家长密码');
  restoring.value = true;
  try {
    if (restoreServerName.value) {
      await api.post('/backups/restore', {
        name: restoreServerName.value,
        password: restorePassword.value,
      });
    } else {
      const file = fileInput.value?.files?.[0];
      if (!file) throw new Error('请先选择 .db 备份文件');
      const buf = await file.arrayBuffer();
      await api.post('/backups/restore', {
        data: toBase64(buf),
        password: restorePassword.value,
      });
    }
    restoreOpen.value = false;
    toast.success('恢复成功，页面即将刷新');
    // 换库后各端内存数据全部作废：延迟一会儿让 toast 被看见，再整页重载
    setTimeout(() => window.location.reload(), 1200);
  } catch (e: any) {
    if (e?.payload?.error === 'wrong_password') toast.error('家长密码不正确');
    else toast.error(e?.payload?.message || e?.message || '恢复失败');
  } finally {
    restoring.value = false;
  }
}

async function saveSettings() {
  savingSettings.value = true;
  try {
    const res = await api.put<{ settings: BackupSettings }>('/backups/settings', settings.value);
    settings.value = res.settings;
    toast.success('设置已保存');
  } catch (e: any) {
    toast.error(e?.payload?.message || e?.message || '保存失败');
  } finally {
    savingSettings.value = false;
  }
}
</script>

<template>
  <Modal :model-value="modelValue" title="备份与恢复" width="600px" @update:model-value="emit('update:modelValue', $event)">
    <div class="backup-panel">
      <!-- 状态卡 -->
      <div class="status-card">
        <div class="status-item">
          <span class="s-label">上次备份</span>
          <span class="s-value" :class="{ warn: !status?.lastBackupAt }">
            {{ status?.lastBackupAt ? formatTime(status.lastBackupAt) : '从未备份' }}
          </span>
        </div>
        <div class="status-item">
          <span class="s-label">自动备份</span>
          <span class="s-value">
            {{ settings.autoEnabled ? `每天 ${settings.autoTime} · 保留 ${settings.keep} 份` : '已关闭' }}
          </span>
        </div>
        <div class="status-item">
          <span class="s-label">备份占用</span>
          <span class="s-value">{{ formatSize(status?.totalSize ?? 0) }}（{{ status?.count ?? 0 }} 份）</span>
        </div>
      </div>

      <!-- 主操作 -->
      <div class="actions">
        <button class="btn btn-primary" :disabled="creating" @click="createNow">
          {{ creating ? '备份中...' : '立即备份' }}
        </button>
        <button class="btn btn-ghost" :disabled="creating" @click="backupAndDownload">
          备份并下载
        </button>
        <span class="actions-hint">备份只存 NAS；下载到电脑/手机才是异机保险</span>
      </div>

      <!-- 备份列表 -->
      <div class="section-title">备份记录</div>
      <div v-if="loading" class="list-state">加载中...</div>
      <div v-else-if="backups.length === 0" class="list-state">还没有备份，点上方「立即备份」创建第一份</div>
      <div v-else class="backup-list">
        <div v-for="b in backups" :key="b.name" class="backup-row">
          <span class="b-time">{{ formatTime(b.createdAt) }}</span>
          <span class="b-tag" :class="b.source">{{ sourceLabels[b.source] }}</span>
          <span class="b-size">{{ formatSize(b.size) }}</span>
          <div class="b-ops">
            <button class="op" @click="onDownload(b)">下载</button>
            <button class="op" @click="askRestoreServer(b)">恢复</button>
            <button class="op danger" @click="askDelete(b)">删除</button>
          </div>
        </div>
      </div>

      <!-- 自动备份设置 -->
      <div class="section-title">自动备份</div>
      <div class="settings-row">
        <label class="switch-label">
          <input v-model="settings.autoEnabled" type="checkbox" />
          <span>开启</span>
        </label>
        <input v-model="settings.autoTime" type="time" class="time-input" :disabled="!settings.autoEnabled" />
        <select v-model.number="settings.keep" class="keep-select" :disabled="!settings.autoEnabled">
          <option :value="3">保留 3 份</option>
          <option :value="7">保留 7 份</option>
          <option :value="14">保留 14 份</option>
          <option :value="30">保留 30 份</option>
        </select>
        <button class="btn btn-ghost" :disabled="savingSettings" @click="saveSettings">保存</button>
      </div>

      <!-- 从文件恢复 -->
      <div class="section-title">从文件恢复</div>
      <div class="upload-zone">
        <p class="hint">选择此前下载到电脑/手机的 .db 备份文件，覆盖当前全部数据（覆盖前会自动留底）。</p>
        <div class="upload-row">
          <input ref="fileInput" type="file" accept=".db,application/x-sqlite3,application/octet-stream" />
          <button class="btn btn-danger" @click="askRestoreUpload">上传并恢复</button>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <ConfirmDialog
      v-model="deleteOpen"
      :title="deleteTarget ? '删除这份备份？' : ''"
      :message="deleteTarget ? `「${formatTime(deleteTarget.createdAt)}」的备份将被删除，无法恢复。` : ''"
      confirm-text="删除"
      variant="danger"
      @confirm="doDelete"
    />

    <!-- 恢复确认（破坏性操作：输入家长密码） -->
    <Modal v-model="restoreOpen" title="确认恢复数据？" width="440px">
      <div class="restore-confirm">
        <p class="danger-text">
          将用<span class="hl">{{ restoreLabel }}</span>覆盖当前全部数据。恢复前会自动留存当前库，但仍然请谨慎操作。
        </p>
        <div class="field">
          <label class="label">家长密码（二次确认）</label>
          <input
            v-model="restorePassword"
            type="password"
            placeholder="请输入当前登录家长的密码"
            autocomplete="current-password"
            @keyup.enter="doRestore"
          />
        </div>
      </div>
      <template #footer>
        <span style="flex: 1"></span>
        <button class="btn btn-ghost" @click="restoreOpen = false">取消</button>
        <button class="btn btn-danger" :disabled="restoring" @click="doRestore">
          {{ restoring ? '恢复中...' : '确认恢复' }}
        </button>
      </template>
    </Modal>
  </Modal>
</template>

<style scoped>
.backup-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
}

.status-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-12);
  padding: var(--space-16);
  border-radius: var(--r-lg);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
}
.status-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}
.s-label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.s-value {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--text-primary);
}
.s-value.warn {
  color: var(--danger, #e24b4a);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  flex-wrap: wrap;
}
.actions-hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.section-title {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--text-secondary);
  margin-top: var(--space-4);
}

.list-state {
  padding: var(--space-20);
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--text-muted);
  background: var(--glass-bg);
  border-radius: var(--r-md);
}

.backup-list {
  max-height: 260px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
.backup-row {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-10) var(--space-12);
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  font-size: var(--fs-sm);
}
.b-time {
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
.b-tag {
  font-size: var(--fs-2xs);
  padding: 2px var(--space-8);
  border-radius: var(--r-pill);
  background: rgba(90, 58, 74, 0.08);
  color: var(--text-secondary);
}
.b-tag.auto {
  background: rgba(126, 212, 185, 0.22);
  color: #0f6e56;
}
.b-tag.manual {
  background: rgba(255, 209, 102, 0.25);
  color: #854f0b;
}
.b-tag.pre-restore {
  background: rgba(143, 119, 221, 0.18);
  color: #3c3489;
}
.b-size {
  color: var(--text-muted);
  font-size: var(--fs-xs);
  margin-left: auto;
}
.b-ops {
  display: flex;
  gap: var(--space-4);
}
.op {
  font-size: var(--fs-xs);
  padding: var(--space-4) var(--space-8);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-secondary);
  transition: background var(--dur-fast);
}
.op:hover {
  background: var(--glass-bg-strong);
}
.op.danger:hover {
  background: rgba(255, 107, 107, 0.14);
  color: var(--text-on-red, #a32d2d);
}

.settings-row {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  flex-wrap: wrap;
}
.switch-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-8);
  font-size: var(--fs-sm);
  color: var(--text-primary);
}
.switch-label input {
  width: auto;
  padding: 0;
}
.time-input,
.keep-select {
  width: auto;
  padding: var(--space-8) var(--space-12);
  font-size: var(--fs-sm);
}
.time-input:disabled,
.keep-select:disabled {
  opacity: 0.5;
}

.upload-zone {
  padding: var(--space-16);
  border-radius: var(--r-lg);
  border: 1px dashed var(--glass-border);
  background: var(--glass-bg);
}
.hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-12);
}
.upload-row {
  display: flex;
  gap: var(--space-12);
  align-items: center;
}
.upload-row input[type='file'] {
  flex: 1;
  padding: var(--space-8);
  font-size: var(--fs-xs);
}

.restore-confirm {
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
}
.danger-text {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}
.danger-text .hl {
  color: var(--danger, #e24b4a);
  font-weight: 500;
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}
.label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}
</style>
