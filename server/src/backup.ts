/**
 * 数据备份与恢复
 *
 * 设计要点（踩过的坑直接转化成的约束）：
 * 1. 快照一律走 `VACUUM INTO`，**不能直接拷文件**。WAL 模式下主库文件可能只有
 *    几 KB、绝大部分数据还在 -wal 里（实测：主库 4KB / WAL 276KB），拷贝主库
 *    等于丢数据。VACUUM INTO 是 SQLite 官方在线一致性快照，无需停服。
 * 2. 恢复前必须给当前库留底（pre-restore-*.db），恢复错了能退回上一版。
 * 3. 换库顺序：先 close 连接（SQLite 自动 checkpoint WAL，主库此时才完整），
 *    再删旧三件套（-wal/-shm 属于旧库，混在新库旁会污染），最后放新库、重开连接。
 * 4. 自动备份不引 cron 依赖：启动时补跑 + 每小时检查一次（误差 ≤1h 可接受）。
 *    容器重启错过凌晨点也能在开机后补上，不会悄悄死掉。
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { closeDb, getDb, initDb } from './db/index.js';

export type BackupSource = 'manual' | 'auto' | 'pre-restore';

export interface BackupFileInfo {
  name: string;
  size: number;
  /** 从文件名解析出的创建时间（ms）。文件名比 mtime 可靠：拷贝/同步会改 mtime */
  createdAt: number;
  source: BackupSource;
}

export interface BackupSettings {
  autoEnabled: boolean;
  /** HH:mm，服务器本地时间（容器 TZ=Asia/Shanghai） */
  autoTime: string;
  /** 常规备份保留份数，超出删最旧；pre-restore 安全网不参与轮转 */
  keep: number;
}

export interface BackupStatus {
  lastBackupAt: number | null;
  lastAutoBackupAt: number | null;
  count: number;
  totalSize: number;
}

export class BackupError extends Error {}

interface StoredBackupSettings extends BackupSettings {
  lastAutoBackupAt?: number;
}

const SETTINGS_KEY = 'backup_settings';
/** 上传恢复的库大小上限。正常库约 100KB，64MB 足够宽松又能挡住误传的巨型文件 */
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
/** 备份文件名白名单：只认本模块生成的命名，防路径穿越。
 *  命名规则：pre-restore-<时间>.db（恢复前安全网）
 *            money-jar-<时间>.db（自动备份）
 *            money-jar-manual-<时间>.db（手动备份）
 *  同一秒内连点多次时在末尾追加 -2/-3 序号。 */
const NAME_RE = /^(money-jar|pre-restore)(-manual)?-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})(-\d+)?\.db$/;

const DEFAULT_SETTINGS: BackupSettings = { autoEnabled: true, autoTime: '03:00', keep: 7 };

function backupsDir(): string {
  const dir = join(config.dataDir, 'backups');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function stamp(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
}

/** 从文件名解析创建时间与来源；命名不合法的返回 null。
 *  pre-restore 前缀是恢复前的安全网；-manual 段区分手动与自动。 */
function parseName(name: string): { createdAt: number; source: BackupSource } | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const [, prefix, manual, y, mo, d, h, mi, s] = m;
  const ms = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime();
  if (!Number.isFinite(ms)) return null;
  const source: BackupSource =
    prefix === 'pre-restore' ? 'pre-restore' : manual === '-manual' ? 'manual' : 'auto';
  return { createdAt: ms, source };
}

export function isValidBackupName(name: string): boolean {
  return NAME_RE.test(name) && !name.includes('/') && !name.includes('\\');
}

/** 创建一份一致性快照。source 决定文件名前缀，前端列表据此打标 */
export function createBackup(source: BackupSource): BackupFileInfo {
  const dir = backupsDir();
  const prefix = source === 'pre-restore' ? 'pre-restore' : source === 'manual' ? 'money-jar-manual' : 'money-jar';
  let target = join(dir, `${prefix}-${stamp()}.db`);
  // 同一秒内连点两次备份：加序号后缀，避免 VACUUM INTO 目标已存在而失败
  let n = 2;
  while (existsSync(target)) {
    target = join(dir, `${prefix}-${stamp()}-${n}.db`);
    n++;
  }

  // 不用参数绑定而走 exec + 单引号转义：路径由本模块生成（无用户输入），
  // 且 VACUUM 类语句在部分驱动的 prepare 链路上支持不一。
  const db = getDb();
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

  const name = basename(target);
  const st = statSync(target);
  return { name, size: st.size, createdAt: parseName(name)!.createdAt, source };
}

/** 读取备份目录，按创建时间倒序 */
export function listBackups(): BackupFileInfo[] {
  const dir = backupsDir();
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const list: BackupFileInfo[] = [];
  for (const name of names) {
    if (!isValidBackupName(name)) continue;
    try {
      const st = statSync(join(dir, name));
      if (!st.isFile()) continue;
      const parsed = parseName(name)!;
      list.push({ name, size: st.size, createdAt: parsed.createdAt, source: parsed.source });
    } catch {
      /* 单个文件读取失败不影响列表 */
    }
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteBackup(name: string): void {
  if (!isValidBackupName(name)) throw new BackupError('非法备份文件名');
  const file = join(backupsDir(), name);
  if (!existsSync(file)) throw new BackupError('备份文件不存在');
  unlinkSync(file);
}

/** 轮转：只删常规备份，pre-restore 是恢复前的安全网，不参与自动删除 */
export function pruneBackups(keep: number): void {
  const dir = backupsDir();
  const regular = listBackups().filter((f) => f.source !== 'pre-restore');
  const excess = regular
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, Math.max(0, regular.length - keep));
  for (const f of excess) {
    try {
      unlinkSync(join(dir, f.name));
    } catch {
      /* ignore */
    }
  }
}

function readStoredSettings(): StoredBackupSettings {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY) as
      | { value: string }
      | undefined;
    if (!row) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(row.value) as Record<string, unknown>;
    return {
      autoEnabled: typeof p.autoEnabled === 'boolean' ? p.autoEnabled : DEFAULT_SETTINGS.autoEnabled,
      autoTime:
        typeof p.autoTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.autoTime)
          ? p.autoTime
          : DEFAULT_SETTINGS.autoTime,
      keep:
        Number.isInteger(p.keep) && (p.keep as number) >= 1 && (p.keep as number) <= 30
          ? (p.keep as number)
          : DEFAULT_SETTINGS.keep,
      lastAutoBackupAt: Number.isFinite(p.lastAutoBackupAt) ? (p.lastAutoBackupAt as number) : undefined,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function readBackupSettings(): BackupSettings {
  const { lastAutoBackupAt: _drop, ...rest } = readStoredSettings();
  return rest;
}

export function writeBackupSettings(patch: Partial<BackupSettings> & { lastAutoBackupAt?: number }): void {
  const merged: StoredBackupSettings = { ...readStoredSettings(), ...patch };
  merged.keep = Math.min(30, Math.max(1, Math.round(merged.keep)));
  const db = getDb();
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(SETTINGS_KEY, JSON.stringify(merged));
}

export function getBackupStatus(): BackupStatus {
  const files = listBackups();
  const stored = readStoredSettings();
  const lastAuto = files.find((f) => f.source === 'auto');
  return {
    lastBackupAt: files.length > 0 ? files[0].createdAt : null,
    // 设置里的记录丢失时，退化为「最后一个自动备份的时间」
    lastAutoBackupAt: stored.lastAutoBackupAt ?? lastAuto?.createdAt ?? null,
    count: files.length,
    totalSize: files.reduce((s, f) => s + f.size, 0),
  };
}

/**
 * 从内存缓冲区恢复数据库（手动上传或恢复服务器上的已有备份都走这里）。
 * 流程：落临时文件 → 只读校验 → 给当前库留底 → 关连接换库 → 重开（重跑迁移）。
 * 任何一步失败都会把旧库放回去，尽量不让服务停在「无库」状态。
 */
export function restoreFromBuffer(buf: Buffer): { preRestoreName: string } {
  if (buf.length === 0) throw new BackupError('文件为空');
  if (buf.length > MAX_UPLOAD_BYTES) throw new BackupError('文件过大（上限 64MB）');

  const dir = backupsDir();
  const tmp = join(dir, '.restore-upload.tmp');
  writeFileSync(tmp, buf);

  // ── 校验：必须是 SQLite 文件且含本应用核心表 ──────────────────────────
  let probe: Database.Database | null = null;
  try {
    probe = new Database(tmp, { readonly: true });
    const tables = new Set(
      (
        probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
      ).map((r) => r.name)
    );
    if (!tables.has('users') || !tables.has('point_logs')) {
      throw new BackupError('不是有效的存钱罐数据库（缺少 users / point_logs 表）');
    }
    probe.close();
    probe = null;
  } catch (e) {
    try {
      probe?.close();
    } catch {
      /* ignore */
    }
    rmSync(tmp, { force: true });
    if (e instanceof BackupError) throw e;
    throw new BackupError('文件无法作为 SQLite 数据库打开');
  }

  // ── 留底：当前库先存一份，恢复错了能退回上一版 ────────────────────────
  const pre = createBackup('pre-restore');

  const dataDir = config.dataDir;
  const live = join(dataDir, 'money-jar.db');
  const oldKeep = join(dataDir, '.money-jar.db.old-restore');

  // ── 换库：先关连接（SQLite 自动 checkpoint，主库此时才完整） ───────────
  closeDb();
  for (const f of ['money-jar.db-wal', 'money-jar.db-shm']) {
    rmSync(join(dataDir, f), { force: true });
  }
  rmSync(oldKeep, { force: true });
  if (existsSync(live)) renameSync(live, oldKeep);

  try {
    renameSync(tmp, live);
    // 重开连接并重跑 schema/迁移：旧版本的备份库借此被拉到当前结构
    // （含明文 PIN 自动 bcrypt 化、缺列自动补齐）
    initDb(dataDir);
    rmSync(oldKeep, { force: true });
  } catch (e) {
    // 重开失败：把旧库放回去再试一次，尽量恢复服务
    try {
      if (existsSync(live)) rmSync(live, { force: true });
      if (existsSync(oldKeep)) renameSync(oldKeep, live);
      initDb(dataDir);
    } catch {
      /* 兜底：服务已无可用库，错误会体现在后续请求里 */
    }
    throw new BackupError('恢复失败：新数据库无法初始化，已自动还原为恢复前的库');
  }

  return { preRestoreName: pre.name };
}

// ── 自动备份调度 ────────────────────────────────────────────────────────

let schedulerStarted = false;

function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db2 = new Date(b);
  return (
    da.getFullYear() === db2.getFullYear() && da.getMonth() === db2.getMonth() && da.getDate() === db2.getDate()
  );
}

async function runAutoBackupIfDue(): Promise<void> {
  try {
    const s = readBackupSettings();
    if (!s.autoEnabled) return;

    const now = new Date();
    const [hh, mm] = s.autoTime.split(':').map(Number);
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
    if (now.getTime() < due.getTime()) return; // 今天还没到点

    const status = getBackupStatus();
    if (status.lastAutoBackupAt && isSameLocalDay(status.lastAutoBackupAt, now.getTime())) return; // 今天已跑过

    const info = createBackup('auto');
    pruneBackups(s.keep);
    writeBackupSettings({ lastAutoBackupAt: Date.now() });
    console.log(`[backup] 自动备份完成：${info.name}（保留 ${s.keep} 份）`);
  } catch (e) {
    // 定时任务不能崩掉进程：失败只记日志，下个小时再试
    console.error('[backup] 自动备份失败：', e);
  }
}

export function startBackupScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  // 开机补跑：容器/机器重启错过凌晨点的，启动后立即补一份
  void runAutoBackupIfDue();
  // 每小时检查一次是否到了当天该备份的时间点
  const timer = setInterval(() => {
    void runAutoBackupIfDue();
  }, 60 * 60 * 1000) as unknown as { unref?: () => void };
  timer.unref?.(); // 不阻止进程退出
}
