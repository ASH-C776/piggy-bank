import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireParent } from '../middleware.js';
import { pushToParents, pushToUser } from '../ws.js';

// 新版任务系统：一个任务对应一个小孩，多选生成多条独立任务
const createTaskSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional(),
  points: z.number().int().positive(),
  deadline: z.number().int().positive().nullable().optional(),
  assigneeIds: z.array(z.number().int().positive()).min(1),
});

const updateTaskSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(200).nullable().optional(),
  points: z.number().int().positive().optional(),
  deadline: z.number().int().positive().nullable().optional(),
});

export function registerAdhocTasksRoutes(app: FastifyInstance) {
  // 家长：发布任务（多选小孩 → 生成多条独立任务）
  app.post('/adhoc-tasks', { preHandler: requireParent }, async (req, reply) => {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input', details: parsed.error.flatten() });
    const { name, description, points, deadline, assigneeIds } = parsed.data;

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const insertStmt = db.prepare(`
      INSERT INTO adhoc_tasks (name, description, category, points, deadline, user_id, created_by, created_at)
      VALUES (?, ?, '其他', ?, ?, ?, ?, ?)
    `);

    const txn = db.transaction(() => {
      for (const uid of assigneeIds) {
        insertStmt.run(name, description ?? null, points, deadline ?? null, uid, req.user!.sub, now);
      }
    });
    txn();

    return { ok: true, count: assigneeIds.length };
  });

  // 家长：任务列表（按状态分类）
  app.get('/adhoc-tasks', { preHandler: requireParent }, async (req) => {
    const db = getDb();
    const status = (req.query as any)?.status ?? 'active';
    const now = Math.floor(Date.now() / 1000);

    let where = '';
    const params: any[] = [];
    if (status === 'active') {
      // 进行中：status='active' 且无待审核完成申请 且未过期
      where = `WHERE t.status = 'active' AND (t.deadline IS NULL OR t.deadline > ?)`;
      params.push(now);
    } else if (status === 'expired') {
      where = `WHERE t.status = 'active' AND t.deadline IS NOT NULL AND t.deadline <= ?`;
      params.push(now);
    } else {
      // completed：已通过审核
      where = `WHERE t.status = 'completed'`;
    }

    const tasks = db.prepare(`
      SELECT t.id, t.name, t.description, t.points, t.deadline, t.status, t.created_at, t.completed_at,
        t.user_id, u.name as user_name, u.avatar as user_avatar,
        (SELECT status FROM task_completions WHERE task_id = t.id ORDER BY created_at DESC LIMIT 1) as completion_status
      FROM adhoc_tasks t
      JOIN users u ON u.id = t.user_id
      ${where}
      ORDER BY t.created_at DESC
    `).all(...params) as any[];

    // 补充完成申请信息
    for (const t of tasks) {
      t.pending_completion = db.prepare(`
        SELECT id, created_at FROM task_completions WHERE task_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1
      `).get(t.id) as any;
    }

    return { tasks };
  });

  // 家长：编辑任务
  app.patch('/adhoc-tasks/:id', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    const { name, description, points, deadline } = parsed.data;

    const db = getDb();
    const task = db.prepare('SELECT * FROM adhoc_tasks WHERE id = ?').get(id) as any;
    if (!task) return reply.code(404).send({ error: 'not_found' });
    if (task.status === 'completed') return reply.code(409).send({ error: 'already_completed' });

    db.prepare(`
      UPDATE adhoc_tasks SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        points = COALESCE(?, points),
        deadline = COALESCE(?, deadline)
      WHERE id = ?
    `).run(name ?? null, description ?? null, points ?? null, deadline ?? null, id);

    return { ok: true };
  });

  // 家长：删除任务
  app.delete('/adhoc-tasks/:id', { preHandler: requireParent }, async (req) => {
    const id = Number((req.params as any).id);
    const db = getDb();
    db.prepare('DELETE FROM adhoc_tasks WHERE id = ?').run(id);
    return { ok: true };
  });

  // 小孩端：我的任务列表
  app.get('/adhoc-tasks/mine', async (req) => {
    const db = getDb();
    const uid = req.user!.sub;
    const now = Math.floor(Date.now() / 1000);

    const tasks = db.prepare(`
      SELECT t.id, t.name, t.description, t.points, t.deadline, t.status, t.created_at,
        (SELECT status FROM task_completions WHERE task_id = t.id ORDER BY created_at DESC LIMIT 1) as completion_status,
        (SELECT reason FROM task_completions WHERE task_id = t.id AND status = 'rejected' ORDER BY created_at DESC LIMIT 1) as completion_reason
      FROM adhoc_tasks t
      WHERE t.user_id = ? AND t.status = 'active'
      ORDER BY t.created_at DESC
    `).all(uid) as any[];

    // 计算显示状态
    for (const t of tasks) {
      if (t.completion_status === 'approved') {
        t.display_status = 'completed';
      } else if (t.deadline && now > t.deadline) {
        t.display_status = 'expired';
      } else if (t.completion_status === 'pending') {
        t.display_status = 'pending';
      } else {
        t.display_status = 'active';
      }
    }

    return { tasks };
  });

  // 小孩端：提交完成申请（直接提交，无需接受）
  app.post('/adhoc-tasks/:id/submit-completion', async (req, reply) => {
    const id = Number((req.params as any).id);
    const db = getDb();
    const uid = req.user!.sub;

    const task = db.prepare('SELECT * FROM adhoc_tasks WHERE id = ? AND user_id = ?').get(id, uid) as any;
    if (!task) return reply.code(404).send({ error: 'not_found' });
    if (task.status !== 'active') return reply.code(409).send({ error: 'not_active' });

    // 检查是否已有完成申请
    const existing = db.prepare('SELECT status FROM task_completions WHERE task_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1').get(id, uid) as any;
    if (existing) {
      if (existing.status === 'pending') return reply.code(409).send({ error: 'already_pending' });
      if (existing.status === 'approved') return reply.code(409).send({ error: 'already_approved' });
      // rejected 可以重新提交
      db.prepare('DELETE FROM task_completions WHERE task_id = ? AND user_id = ? AND status = ?').run(id, uid, 'rejected');
    }

    db.prepare('INSERT INTO task_completions (task_id, user_id) VALUES (?, ?)').run(id, uid);

    // 推送给家长
    const child = db.prepare('SELECT name FROM users WHERE id = ?').get(uid) as any;
    pushToParents({ type: 'task_completion_submitted', taskId: id, userId: uid, userName: child?.name, taskName: task.name });

    return { ok: true };
  });

  // 家长端：审核任务完成申请列表
  app.get('/adhoc-tasks/completions', { preHandler: requireParent }, async (req) => {
    const db = getDb();
    const status = (req.query as any)?.status ?? 'pending';

    const rows = db.prepare(`
      SELECT tc.id, tc.task_id, tc.user_id, tc.status, tc.reason, tc.created_at, tc.reviewed_at,
        t.name as task_name, t.points as task_points,
        u.name as user_name, u.avatar as user_avatar
      FROM task_completions tc
      JOIN adhoc_tasks t ON t.id = tc.task_id
      JOIN users u ON u.id = tc.user_id
      WHERE tc.status = ?
      ORDER BY tc.created_at DESC
    `).all(status) as any[];

    return { completions: rows };
  });

  // 家长端：通过任务完成申请（加积分）
  app.post('/adhoc-tasks/completions/:id/approve', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const db = getDb();

    const tc = db.prepare(`
      SELECT tc.*, t.name as task_name, t.points as task_points
      FROM task_completions tc
      JOIN adhoc_tasks t ON t.id = tc.task_id
      WHERE tc.id = ?
    `).get(id) as any;
    if (!tc) return reply.code(404).send({ error: 'not_found' });
    if (tc.status !== 'pending') return reply.code(409).send({ error: 'already_reviewed' });

    const now = Math.floor(Date.now() / 1000);
    const txn = db.transaction(() => {
      db.prepare('UPDATE users SET total_points = total_points + ? WHERE id = ?').run(tc.task_points, tc.user_id);
      db.prepare(`
        INSERT INTO point_logs (user_id, delta, source, ref_id, note, created_by)
        VALUES (?, ?, 'adhoc', ?, ?, ?)
      `).run(tc.user_id, tc.task_points, tc.task_id, `任务：${tc.task_name}`, req.user!.sub);
      db.prepare(`
        UPDATE task_completions SET status = 'approved', reviewed_by = ?, reviewed_at = ? WHERE id = ?
      `).run(req.user!.sub, now, id);
      // 标记任务为已完成
      db.prepare('UPDATE adhoc_tasks SET status = ?, completed_at = ? WHERE id = ?').run('completed', now, tc.task_id);
    });
    txn();

    const newBalance = (db.prepare('SELECT total_points FROM users WHERE id = ?').get(tc.user_id) as any).total_points;
    pushToUser(tc.user_id, { type: 'task_review', taskId: tc.task_id, status: 'approved', points: tc.task_points });

    return { ok: true, newBalance, delta: tc.task_points };
  });

  // 家长端：拒绝任务完成申请
  app.post('/adhoc-tasks/completions/:id/reject', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const reason = (req.body as any)?.reason ?? '';
    const db = getDb();

    const tc = db.prepare('SELECT * FROM task_completions WHERE id = ?').get(id) as any;
    if (!tc) return reply.code(404).send({ error: 'not_found' });
    if (tc.status !== 'pending') return reply.code(409).send({ error: 'already_reviewed' });

    db.prepare(`
      UPDATE task_completions SET status = 'rejected', reason = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?
    `).run(reason || null, req.user!.sub, Math.floor(Date.now() / 1000), id);

    pushToUser(tc.user_id, { type: 'task_review', taskId: tc.task_id, status: 'rejected', reason });

    return { ok: true };
  });
}
