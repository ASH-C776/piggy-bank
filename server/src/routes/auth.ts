import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { hashPassword, verifyPassword, signToken, isValidPin } from '../auth.js';
import { config } from '../config.js';
import { requireParent } from '../middleware.js';

const parentLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const childLoginSchema = z.object({
  userId: z.number().int().positive(),
  pin: z.string().min(4).max(6),
});

// 家长更新自身信息：头像 / 账号(name) / 密码（密码留空表示不修改）
const updateMeSchema = z.object({
  avatar: z.string().min(1).optional(),
  name: z.string().min(1).max(30).optional(),
  password: z.string().min(6).max(64).optional(),
});

// 12 生肖合法 key 集合
const ZODIAC_KEYS = new Set([
  'rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake',
  'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig',
]);

export function registerAuthRoutes(app: FastifyInstance) {
  // 家长登录
  app.post('/auth/parent-login', async (req, reply) => {
    const parsed = parentLoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });

    const { username, password } = parsed.data;
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE role = ? AND name = ?')
      .get('parent', username) as any;

    if (!user) return reply.code(401).send({ error: 'invalid_credentials' });
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return reply.code(401).send({ error: 'invalid_credentials' });

    const token = await signToken({ sub: user.id, role: 'parent', name: user.name });
    return { token, user: { id: user.id, name: user.name, role: 'parent', avatar: user.avatar } };
  });

  // 小孩PIN登录
  app.post('/auth/child-login', async (req, reply) => {
    const parsed = childLoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });

    const { userId, pin } = parsed.data;
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?')
      .get(userId, 'child') as any;

    if (!user || user.pin !== pin) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const token = await signToken({ sub: user.id, role: 'child', name: user.name });
    return { token, user: { id: user.id, name: user.name, role: 'child', avatar: user.avatar, totalPoints: user.total_points } };
  });

  // 小孩列表（用于登录页选择身份）
  app.get('/auth/children', async () => {
    const db = getDb();
    const children = db.prepare(
      'SELECT id, name, avatar FROM users WHERE role = ? ORDER BY id'
    ).all('child');
    return { children };
  });

  // 当前用户信息（camelCase 字段名）
  app.get('/auth/me', async (req) => {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, name, role, avatar, total_points as totalPoints FROM users WHERE id = ?'
    ).get(req.user!.sub) as any;
    return { user };
  });

  // 家长更新自身资料（头像/账号/密码）
  app.patch('/auth/me', { preHandler: requireParent }, async (req, reply) => {
    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    const { avatar, name, password } = parsed.data;
    const db = getDb();

    // 校验头像
    if (avatar && !ZODIAC_KEYS.has(avatar)) {
      return reply.code(400).send({ error: 'invalid_avatar' });
    }

    // 校验账号唯一性（家长之间不重名）
    if (name) {
      const exists = db.prepare(
        'SELECT id FROM users WHERE role = ? AND name = ? AND id != ?'
      ).get('parent', name, req.user!.sub);
      if (exists) return reply.code(409).send({ error: 'name_taken' });
    }

    // 执行更新
    const fields: string[] = [];
    const values: any[] = [];
    if (avatar) { fields.push('avatar = ?'); values.push(avatar); }
    if (name)   { fields.push('name = ?');   values.push(name); }
    if (password) {
      const hash = await hashPassword(password);
      fields.push('password_hash = ?');
      values.push(hash);
    }
    if (fields.length === 0) {
      return reply.code(400).send({ error: 'no_fields' });
    }
    values.push(req.user!.sub);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    // 返回更新后的用户
    const updated = db.prepare(
      'SELECT id, name, role, avatar, total_points as totalPoints FROM users WHERE id = ?'
    ).get(req.user!.sub) as any;
    return { user: updated };
  });

  // 小孩更新自身信息：头像 / PIN码
  app.patch('/auth/child/me', async (req, reply) => {
    if (req.user?.role !== 'child') return reply.code(403).send({ error: 'forbidden' });
    const body = req.body as { avatar?: string; pin?: string };
    const db = getDb();

    // 校验头像
    if (body.avatar !== undefined && !ZODIAC_KEYS.has(body.avatar)) {
      return reply.code(400).send({ error: 'invalid_avatar' });
    }

    // 校验PIN：4-6位数字
    if (body.pin !== undefined && body.pin !== '') {
      if (!/^\d{4,6}$/.test(body.pin)) {
        return reply.code(400).send({ error: 'invalid_pin' });
      }
    }

    const fields: string[] = [];
    const values: any[] = [];
    if (body.avatar) { fields.push('avatar = ?'); values.push(body.avatar); }
    if (body.pin && body.pin !== '') { fields.push('pin = ?'); values.push(body.pin); }

    if (fields.length === 0) {
      return reply.code(400).send({ error: 'no_fields' });
    }
    values.push(req.user!.sub);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare(
      'SELECT id, name, role, avatar, total_points as totalPoints FROM users WHERE id = ?'
    ).get(req.user!.sub);
    return { user: updated };
  });
}
