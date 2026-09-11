import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

let db: Database.Database;

function findSchemaPath(): string {
  // 优先从源码目录加载（开发模式），其次从编译产物旁边（生产Docker模式）
  const candidates = [
    join(process.cwd(), 'server', 'src', 'db', 'schema.sql'),
    join(__dirname, 'schema.sql'),
    join(__dirname, '..', 'src', 'db', 'schema.sql'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error('schema.sql not found in any expected location');
}

export function initDb(dataDir: string): Database.Database {
  const dbPath = join(dataDir, 'money-jar.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 加载 schema
  const schemaPath = findSchemaPath();
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // 迁移：为旧版 adhoc_task_assignees 添加 accepted_at 字段
  runMigrations(db);

  // 初始化家长账号 + 默认加分项 + 默认设置
  initParentAccount();
  initDefaultPointItems();
  initDefaultSettings();

  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

// 迁移：为旧版数据库补字段
function runMigrations(db: Database.Database): void {
  // adhoc_tasks 加 user_id 字段（新版任务系统）
  try {
    const { c } = db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('adhoc_tasks') WHERE name='user_id'").get() as { c: number };
    if (c === 0) {
      db.exec('ALTER TABLE adhoc_tasks ADD COLUMN user_id INTEGER');
      console.log('[migration] Added column: adhoc_tasks.user_id');
      // 将旧 scope='assignee' 的任务迁移：从 assignees 表取 user_id
      try {
        db.exec(`
          UPDATE adhoc_tasks SET user_id = (
            SELECT user_id FROM adhoc_task_assignees
            WHERE adhoc_task_assignees.task_id = adhoc_tasks.id
            ORDER BY accepted_at DESC LIMIT 1
          )
        `);
        console.log('[migration] Migrated user_id from adhoc_task_assignees');
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* skip */ }

  // 删除旧表（已无用）
  try { db.exec('DROP TABLE IF EXISTS adhoc_task_assignees'); } catch (e) { /* skip */ }

  // task_completions 去掉 UNIQUE 约束（允许重新提交）
  try {
    const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_completions'").get() as any;
    if (info?.sql?.includes('UNIQUE')) {
      db.exec('DROP TABLE IF EXISTS task_completions');
      // 重新创建（schema.sql 会重新创建）
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_completions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL REFERENCES adhoc_tasks(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
          reason TEXT,
          reviewed_by INTEGER REFERENCES users(id),
          reviewed_at INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `);
      console.log('[migration] Rebuilt task_completions table');
    }
  } catch (e) { /* skip */ }

  // point_logs.source/ref_id 字段
  try {
    const { c } = db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('point_logs') WHERE name='source'").get() as { c: number };
    if (c === 0) {
      db.exec("ALTER TABLE point_logs ADD COLUMN source TEXT NOT NULL DEFAULT 'adjust' CHECK (source IN ('daily', 'adhoc', 'exchange', 'adjust'))");
    }
    const { c: c2 } = db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('point_logs') WHERE name='ref_id'").get() as { c: number };
    if (c2 === 0) {
      db.exec('ALTER TABLE point_logs ADD COLUMN ref_id INTEGER');
    }
  } catch (e) { /* skip */ }

  // point_items.owner_id 字段
  try {
    const { c } = db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('point_items') WHERE name='owner_id'").get() as { c: number };
    if (c === 0) {
      db.exec('ALTER TABLE point_items ADD COLUMN owner_id INTEGER');
      console.log('[migration] Added column: point_items.owner_id');
    }
  } catch (e) { /* skip */ }

  // products.icon 字段（商品分类图标）
  try {
    const { c } = db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('products') WHERE name='icon'").get() as { c: number };
    if (c === 0) {
      db.exec("ALTER TABLE products ADD COLUMN icon TEXT NOT NULL DEFAULT 'gift'");
      console.log('[migration] Added column: products.icon');
    }
  } catch (e) { /* skip */ }
}

function initParentAccount(): void {
  const existing = db.prepare('SELECT id FROM users WHERE role = ?').get('parent');
  if (existing) return;

  const hash = bcrypt.hashSync(config.adminPassword, 10);
  db.prepare(
    'INSERT INTO users (name, role, password_hash, avatar, total_points) VALUES (?, ?, ?, ?, ?)'
  ).run(config.adminUsername, 'parent', hash, 'dragon', 0);
}

function initDefaultPointItems(): void {
  const count = db.prepare('SELECT COUNT(*) as c FROM point_items WHERE is_default = 1').get() as { c: number };
  if (count.c > 0) return;

  const defaults: Array<{ name: string; type: 'gain' | 'loss'; points: number; daily_limit: number }> = [
    { name: '完成作业', type: 'gain', points: 10, daily_limit: 1 },
    { name: '早睡早起', type: 'gain', points: 10, daily_limit: 1 },
    { name: '帮忙做家务', type: 'gain', points: 5, daily_limit: 3 },
    { name: '未完成作业', type: 'loss', points: -10, daily_limit: 1 },
    { name: '未早睡早起', type: 'loss', points: -10, daily_limit: 1 },
    { name: '发脾气', type: 'loss', points: -5, daily_limit: 2 },
  ];

  const stmt = db.prepare(
    `INSERT INTO point_items (name, type, points, daily_limit, sort_order, enabled, is_default)
     VALUES (?, ?, ?, ?, ?, 1, 1)`
  );
  defaults.forEach((d, i) => stmt.run(d.name, d.type, d.points, d.daily_limit, i));
}

function initDefaultSettings(): void {
  const existing = db.prepare("SELECT value FROM settings WHERE key = 'cash_rate'").get() as { value: string } | undefined;
  if (!existing) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('cash_rate', '10')").run();
  }
}
