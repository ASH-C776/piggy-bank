import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import bcrypt from 'bcryptjs';
import { requireParent } from '../middleware.js';
import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { pushToAll } from '../ws.js';
import {
  BackupError,
  createBackup,
  deleteBackup,
  getBackupStatus,
  isValidBackupName,
  listBackups,
  pruneBackups,
  readBackupSettings,
  restoreFromBuffer,
  writeBackupSettings,
} from '../backup.js';

const settingsSchema = z.object({
  autoEnabled: z.boolean(),
  autoTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间格式须为 HH:mm'),
  keep: z.number().int().min(1).max(30),
});

const restoreSchema = z
  .object({
    // 二选一：恢复服务器上已有的备份（name），或上传 base64 的 .db 文件（data）
    name: z.string().optional(),
    data: z.string().optional(),
    // 破坏性操作二次确认：当前登录家长的密码
    password: z.string().min(1, '请输入家长密码'),
  })
  .refine((v) => Boolean(v.name || v.data), { message: '缺少备份文件' });

function backupsDir(): string {
  return join(config.dataDir, 'backups');
}

export function registerBackupRoutes(app: FastifyInstance) {
  // 弹窗打开时一个请求拿全：列表 + 设置 + 状态
  app.get('/backups', { preHandler: requireParent }, async () => {
    return {
      backups: listBackups(),
      settings: readBackupSettings(),
      status: getBackupStatus(),
    };
  });

  // 轻量状态：总览页「多久没备份」提醒用，不拉列表
  app.get('/backups/status', { preHandler: requireParent }, async () => {
    return { status: getBackupStatus(), settings: readBackupSettings() };
  });

  // 手动备份
  app.post('/backups', { preHandler: requireParent }, async (_req, reply) => {
    const info = createBackup('manual');
    pruneBackups(readBackupSettings().keep);
    return reply.code(201).send({ backup: info });
  });

  // 下载。token 走 Authorization header（前端 fetch+blob 触发下载），
  // 不放 URL query —— 那会进浏览器历史、反代访问日志和 Referer。
  app.get<{ Params: { name: string } }>(
    '/backups/download/:name',
    { preHandler: requireParent },
    async (req, reply) => {
      const name = basename(req.params.name);
      if (!isValidBackupName(name)) return reply.code(400).send({ error: 'invalid_name' });
      const file = join(backupsDir(), name);
      if (!existsSync(file)) return reply.code(404).send({ error: 'not_found' });
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${name}"`)
        .send(readFileSync(file));
    }
  );

  // 恢复（破坏性操作）
  app.post('/backups/restore', { preHandler: requireParent }, async (req, reply) => {
    const parsed = restoreSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || '参数错误' });
    }
    const { name, data, password } = parsed.data;

    // 校验当前登录家长的密码，防误触
    const user = getDb()
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(req.user!.sub) as { password_hash: string } | undefined;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return reply.code(403).send({ error: 'wrong_password', message: '家长密码不正确' });
    }

    let buf: Buffer;
    if (data) {
      buf = Buffer.from(data, 'base64');
      if (buf.length < 100) return reply.code(400).send({ error: 'invalid_file', message: '文件内容不完整' });
    } else {
      const n = basename(name!);
      if (!isValidBackupName(n)) return reply.code(400).send({ error: 'invalid_name' });
      const file = join(backupsDir(), n);
      if (!existsSync(file)) return reply.code(404).send({ error: 'not_found' });
      buf = readFileSync(file);
    }

    try {
      const result = restoreFromBuffer(buf);
      // 全端刷新：换库后各端内存里的旧数据全部作废，token_version 也可能变化
      pushToAll({ type: 'data_restored' });
      return { ok: true, preRestore: result.preRestoreName };
    } catch (e) {
      if (e instanceof BackupError) {
        return reply.code(400).send({ error: 'restore_failed', message: e.message });
      }
      throw e;
    }
  });

  // 删除单个备份
  app.delete<{ Params: { name: string } }>(
    '/backups/:name',
    { preHandler: requireParent },
    async (req, reply) => {
      const name = basename(req.params.name);
      if (!isValidBackupName(name)) return reply.code(400).send({ error: 'invalid_name' });
      try {
        deleteBackup(name);
      } catch (e) {
        if (e instanceof BackupError) {
          return reply.code(404).send({ error: 'not_found', message: e.message });
        }
        throw e;
      }
      return { ok: true };
    }
  );

  // 自动备份设置
  app.put('/backups/settings', { preHandler: requireParent }, async (req, reply) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || '参数错误' });
    }
    writeBackupSettings(parsed.data);
    return { settings: readBackupSettings() };
  });
}
