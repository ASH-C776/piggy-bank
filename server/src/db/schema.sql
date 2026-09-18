-- Money Jar 数据库 Schema v1.0
-- 单家庭模式，无 family_id 租户隔离

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 用户表（家长 + 小孩）
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('parent', 'child')),
  pin TEXT,                          -- 小孩登录PIN（4-6位数字），家长账号为NULL
  password_hash TEXT,                 -- 家长密码哈希，小孩为NULL
  avatar TEXT,                        -- 生肖key，如 "rat"
  birthday TEXT,                      -- 出生日期 YYYY-MM-DD，生长曲线需按年龄查标准
  sex TEXT CHECK (sex IN ('male', 'female')),  -- 性别，生长标准男女不同；NULL=未填写
  total_points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (
    (role = 'parent' AND password_hash IS NOT NULL) OR
    (role = 'child' AND pin IS NOT NULL)
  )
);

-- 日常任务（家长一键加减分项，可配置每日上限）
CREATE TABLE IF NOT EXISTS point_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('gain', 'loss')),
  points INTEGER NOT NULL,            -- 加分项为正数，扣分项为负数
  daily_limit INTEGER NOT NULL DEFAULT 1,  -- 每日上限次数，0表示无限
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  owner_id INTEGER,                   -- NULL=通用项，否则为指定小孩专属项
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 日常任务完成记录（频次控制）
CREATE TABLE IF NOT EXISTS daily_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES point_items(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                 -- 格式 YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, item_id, date)
);

-- 临时任务（新版：一个任务对应一个小孩）
CREATE TABLE IF NOT EXISTS adhoc_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                      -- 学习/生活/运动/其他
  points INTEGER NOT NULL,            -- 完成奖励积分
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
  deadline INTEGER,                   -- unix时间戳秒，NULL表示无截止
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 指定小孩
  created_by INTEGER NOT NULL REFERENCES users(id),
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 任务完成申请（小孩提交，家长审核）
CREATE TABLE IF NOT EXISTS task_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES adhoc_tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_task_completions_task ON task_completions(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_completions_status ON task_completions(status, created_at DESC);

-- 积分流水（统一记录所有积分变动）
CREATE TABLE IF NOT EXISTS point_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,             -- 正负
  source TEXT NOT NULL CHECK (source IN ('daily', 'adhoc', 'exchange', 'adjust')),
  ref_id INTEGER,                     -- 关联任务/商品/兑换申请ID
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_point_logs_user ON point_logs(user_id, created_at DESC);

-- 商品
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cost INTEGER NOT NULL,              -- 所需积分
  stock INTEGER NOT NULL DEFAULT -1, -- -1表示不限库存
  icon TEXT NOT NULL DEFAULT 'gift', -- 分类图标: snack/toy/activity/game/study/privilege/gift
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 兑换申请（商品兑换 + 现金兑换共用表）
CREATE TABLE IF NOT EXISTS exchange_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('product', 'cash')),
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  points INTEGER NOT NULL,            -- 消耗积分（cash类型存兑换积分数）
  amount REAL NOT NULL DEFAULT 0,     -- 现金兑换时 = points / 10
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,                         -- 拒绝原因
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_exchange_requests_status ON exchange_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_requests_user ON exchange_requests(user_id, created_at DESC);

-- 成长记录（身高体重）
-- 同一天同一孩子只保留一条：重复录入按更新处理，避免"随时想量就量"产生脏数据
CREATE TABLE IF NOT EXISTS growth_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_date TEXT NOT NULL,          -- 格式 YYYY-MM-DD
  height_cm REAL,                     -- 身高 cm
  weight_kg REAL,                     -- 体重 kg
  grow_cm REAL,                       -- 相对上一条有效身高长高多少；可为负（测量误差/缩水）
  awarded INTEGER,                    -- 本次核算出的积分增减，可为负；null = 该记录未参与计分
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, record_date)
);

CREATE INDEX IF NOT EXISTS idx_growth_records_user_date ON growth_records(user_id, record_date);

-- 全局设置（键值对）
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
