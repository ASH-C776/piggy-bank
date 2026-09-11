import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireParent } from '../middleware.js';

const createItemSchema = z.object({
  name: z.string().min(1).max(30),
  type: z.enum(['gain', 'loss']),
  points: z.number().int().refine((n) => n !== 0, 'points不能为0'),
  daily_limit: z.number().int().min(0).max(999).default(1),
  ownerId: z.number().int().positive().nullable().optional(), // null=通用，否则小孩id
});

const updateItemSchema = z.object({
  name: z.string().min(1).max(30).optional(),
  points: z.number().int().refine((n) => n !== 0).optional(),
  daily_limit: z.number().int().min(0).max(999).optional(),
  enabled: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

const applySchema = z.object({
  userId: z.number().int().positive(),
  itemId: z.number().int().positive(),
});

export function registerPointItemsRoutes(app: FastifyInstance) {
  // 列出积分项（家长）— 可按 ownerId 过滤
  app.get('/point-items', { preHandler: requireParent }, async (req) => {
    const db = getDb();
    const query = req.query as Record<string, string | undefined> | undefined;
    const onlyEnabled = query?.enabled === 'true';
    const ownerIdParam = query?.ownerId;
    let sql: string;
    const params: any[] = [];
    if (ownerIdParam !== undefined) {
      const ownerId = ownerIdParam === 'null' ? null : Number(ownerIdParam);
      sql = onlyEnabled
        ? `SELECT * FROM point_items WHERE enabled = 1 AND owner_id IS ? ORDER BY type, sort_order, id`
        : `SELECT * FROM point_items WHERE owner_id IS ? ORDER BY type, sort_order, id`;
      params.push(ownerId);
    } else {
      sql = onlyEnabled
        ? `SELECT * FROM point_items WHERE enabled = 1 ORDER BY type, sort_order, id`
        : `SELECT * FROM point_items ORDER BY type, sort_order, id`;
    }
    return { items: db.prepare(sql).all(...params) };
  });

  // 小孩端可见的加分项
  app.get('/point-items/visible', async () => {
    const db = getDb();
    const items = db.prepare(
      `SELECT id, name, type, points FROM point_items WHERE enabled = 1 ORDER BY type, sort_order, id`
    ).all();
    return { items };
  });

  // 新增积分项
  app.post('/point-items', { preHandler: requireParent }, async (req, reply) => {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input', details: parsed.error.flatten() });
    const { name, type, points, daily_limit, ownerId } = parsed.data;
    // 强制：gain为正、loss为负
    const normalized = type === 'gain' ? Math.abs(points) : -Math.abs(points);

    const db = getDb();
    const result = db.prepare(
      `INSERT INTO point_items (name, type, points, daily_limit, sort_order, enabled, is_default, owner_id)
       VALUES (?, ?, ?, ?, 0, 1, 0, ?)`
    ).run(name, type, normalized, daily_limit, ownerId ?? null);

    return { id: result.lastInsertRowid };
  });

  // 更新
  app.patch('/point-items/:id', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });

    const db = getDb();
    const existing = db.prepare('SELECT * FROM point_items WHERE id = ?').get(id) as any;
    if (!existing) return reply.code(404).send({ error: 'not_found' });

    const updates = parsed.data;
    const newPoints = updates.points !== undefined
      ? (existing.type === 'gain' ? Math.abs(updates.points) : -Math.abs(updates.points))
      : existing.points;

    db.prepare(`
      UPDATE point_items SET
        name = COALESCE(?, name),
        points = ?,
        daily_limit = COALESCE(?, daily_limit),
        enabled = COALESCE(?, enabled),
        sort_order = COALESCE(?, sort_order)
      WHERE id = ?
    `).run(
      updates.name ?? null,
      newPoints,
      updates.daily_limit ?? null,
      updates.enabled === undefined ? null : (updates.enabled ? 1 : 0),
      updates.sort_order ?? null,
      id
    );

    return { ok: true };
  });

  // 删除
  app.delete('/point-items/:id', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const db = getDb();
    const result = db.prepare('DELETE FROM point_items WHERE id = ? AND is_default = 0').run(id);
    if (result.changes === 0) return reply.code(400).send({ error: 'cannot_delete_default' });
    return { ok: true };
  });

  // 一键应用积分项（家长加分/扣分操作）
  app.post('/point-items/apply', { preHandler: requireParent }, async (req, reply) => {
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    const { userId, itemId } = parsed.data;

    const db = getDb();
    const item = db.prepare('SELECT * FROM point_items WHERE id = ? AND enabled = 1').get(itemId) as any;
    if (!item) return reply.code(404).send({ error: 'item_not_found' });

    const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'child'").get(userId) as any;
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    // 频次控制
    if (item.daily_limit > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const record = db.prepare(
        'SELECT count FROM daily_completions WHERE user_id = ? AND item_id = ? AND date = ?'
      ).get(userId, itemId, today) as { count: number } | undefined;

      if (record && record.count >= item.daily_limit) {
        return reply.code(409).send({
          error: 'daily_limit_reached',
          message: `今日已达上限（${item.daily_limit} 次）`,
        });
      }
    }

    // 事务：更新余额 + 写流水 + 写完成记录
    const applyTxn = db.transaction(() => {
      db.prepare('UPDATE users SET total_points = total_points + ? WHERE id = ?')
        .run(item.points, userId);
      db.prepare(`
        INSERT INTO point_logs (user_id, delta, source, ref_id, note, created_by)
        VALUES (?, ?, 'daily', ?, ?, ?)
      `).run(userId, item.points, item.id, item.name, req.user!.sub);

      const today = new Date().toISOString().slice(0, 10);
      db.prepare(`
        INSERT INTO daily_completions (user_id, item_id, date, count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(user_id, item_id, date) DO UPDATE SET count = count + 1
      `).run(userId, item.id, today);
    });

    applyTxn();

    const newBalance = (db.prepare('SELECT total_points FROM users WHERE id = ?').get(userId) as any).total_points;

    return {
      ok: true,
      newBalance,
      delta: item.points,
    };
  });

  // 临时加减分（输入事项+分值+小孩，直接加扣分）
  const adjustSchema = z.object({
    userId: z.number().int().positive(),
    delta: z.number().int().refine((n) => n !== 0, 'delta不能为0'),
    note: z.string().max(100).optional(),
  });

  app.post('/point-items/adjust', { preHandler: requireParent }, async (req, reply) => {
    const parsed = adjustSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input', details: parsed.error.flatten() });
    const { userId, delta, note } = parsed.data;

    const db = getDb();
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'child'").get(userId) as any;
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const txn = db.transaction(() => {
      db.prepare('UPDATE users SET total_points = total_points + ? WHERE id = ?').run(delta, userId);
      db.prepare(`
        INSERT INTO point_logs (user_id, delta, source, note, created_by)
        VALUES (?, ?, 'adjust', ?, ?)
      `).run(userId, delta, note ?? null, req.user!.sub);
    });
    txn();

    const newBalance = (db.prepare('SELECT total_points FROM users WHERE id = ?').get(userId) as any).total_points;
    return { ok: true, newBalance, delta };
  });
}
