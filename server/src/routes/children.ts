import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { isValidPin } from '../auth.js';
import { requireParent } from '../middleware.js';

const ZODIAC = ['rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig'];

// 生日：YYYY-MM-DD，允许为空（未填写时生长曲线降级为不显示百分位）
const birthdaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '生日格式须为 YYYY-MM-DD')
  .nullable()
  .optional();

const sexSchema = z.enum(['male', 'female']).nullable().optional();

// 新增时生日/性别必填：生长曲线的百分位完全依赖这两项，事后补录容易忘。
// 编辑时保持 nullable —— 允许把填错的生日清空重填。
const createChildSchema = z.object({
  name: z.string().min(1).max(20),
  pin: z.string().refine(isValidPin, 'PIN必须是4-6位数字'),
  avatar: z.enum(ZODIAC as [string, ...string[]]),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '生日格式须为 YYYY-MM-DD'),
  sex: z.enum(['male', 'female']),
});

const updateChildSchema = z.object({
  name: z.string().min(1).max(20).optional(),
  pin: z.string().refine(isValidPin).optional(),
  avatar: z.enum(ZODIAC as [string, ...string[]]).optional(),
  birthday: birthdaySchema,
  sex: sexSchema,
});

export function registerChildrenRoutes(app: FastifyInstance) {
  // 列出所有小孩（家长）
  app.get('/children', { preHandler: requireParent }, async () => {
    const db = getDb();
    const children = db.prepare(
      `SELECT id, name, avatar, total_points, birthday, sex, created_at
       FROM users WHERE role = 'child' ORDER BY total_points DESC, id ASC`
    ).all();
    return { children };
  });

  // 创建小孩（家长）
  app.post('/children', { preHandler: requireParent }, async (req, reply) => {
    const parsed = createChildSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input', details: parsed.error.flatten() });
    const { name, pin, avatar, birthday, sex } = parsed.data;

    const db = getDb();
    // 检查 PIN 唯一性
    const exists = db.prepare('SELECT id FROM users WHERE pin = ? AND role = ?').get(pin, 'child');
    if (exists) return reply.code(409).send({ error: 'pin_used' });

    const result = db.prepare(
      `INSERT INTO users (name, role, pin, avatar, birthday, sex, total_points)
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    ).run(name, 'child', pin, avatar, birthday ?? null, sex ?? null);

    return { id: result.lastInsertRowid, name, avatar, birthday: birthday ?? null, sex: sex ?? null };
  });

  // 更新小孩
  app.patch('/children/:id', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const parsed = updateChildSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });

    const db = getDb();
    const current = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'child') as any;
    if (!current) return reply.code(404).send({ error: 'not_found' });

    const updates = parsed.data;
    if (updates.pin && updates.pin !== current.pin) {
      const conflict = db.prepare('SELECT id FROM users WHERE pin = ? AND id != ?').get(updates.pin, id);
      if (conflict) return reply.code(409).send({ error: 'pin_used' });
    }

    // 显式拼接 SET 子句：字段传 undefined 表示不改，传 null 表示清空
    // （原 COALESCE 写法无法把已有值清空，生日/性别需要支持清空）
    const sets: string[] = [];
    const params: Array<string | null> = [];
    if (updates.name !== undefined) { sets.push('name = ?'); params.push(updates.name); }
    if (updates.pin !== undefined) { sets.push('pin = ?'); params.push(updates.pin); }
    if (updates.avatar !== undefined) { sets.push('avatar = ?'); params.push(updates.avatar); }
    if (updates.birthday !== undefined) { sets.push('birthday = ?'); params.push(updates.birthday); }
    if (updates.sex !== undefined) { sets.push('sex = ?'); params.push(updates.sex); }
    if (sets.length) {
      params.push(String(id));
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }

    return { ok: true };
  });

  // 删除小孩（事务级联清理所有关联数据）
  app.delete('/children/:id', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const db = getDb();

    const current = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(id, 'child');
    if (!current) return reply.code(404).send({ error: 'not_found' });

    // 显式按依赖顺序删除，兼容旧库中 ALTER 添加、无 FK 约束的字段
    const cleanup = db.transaction((childId: number) => {
      // 任务完成申请（该小孩提交的，以及属于该小孩任务的）
      db.prepare(`
        DELETE FROM task_completions
        WHERE user_id = ? OR task_id IN (SELECT id FROM adhoc_tasks WHERE user_id = ?)
      `).run(childId, childId);
      // 临时任务
      db.prepare('DELETE FROM adhoc_tasks WHERE user_id = ?').run(childId);
      // 兑换申请
      db.prepare('DELETE FROM exchange_requests WHERE user_id = ?').run(childId);
      // 积分流水
      db.prepare('DELETE FROM point_logs WHERE user_id = ?').run(childId);
      // 日常完成记录
      db.prepare('DELETE FROM daily_completions WHERE user_id = ?').run(childId);
      // 该小孩的专属积分项
      db.prepare('DELETE FROM point_items WHERE owner_id = ?').run(childId);
      // 成长记录（身高体重）
      db.prepare('DELETE FROM growth_records WHERE user_id = ?').run(childId);
      // 账号本体
      db.prepare("DELETE FROM users WHERE id = ? AND role = 'child'").run(childId);
    });

    cleanup(id);
    return { ok: true };
  });
}
