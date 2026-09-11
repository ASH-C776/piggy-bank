import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { requireParent } from '../middleware.js';

export function registerPointLogsRoutes(app: FastifyInstance) {
  // 家长查所有记录
  app.get('/point-logs', { preHandler: requireParent }, async (req) => {
    const db = getDb();
    const userId = (req.query as any)?.userId ? Number((req.query as any).userId) : null;
    const limit = Math.min(Number((req.query as any)?.limit ?? 50), 200);
    const offset = Number((req.query as any)?.offset ?? 0);

    const sql = userId
      ? `SELECT pl.*, u.name as user_name, creator.name as creator_name
         FROM point_logs pl
         JOIN users u ON pl.user_id = u.id
         LEFT JOIN users creator ON pl.created_by = creator.id
         WHERE pl.user_id = ?
         ORDER BY pl.created_at DESC, pl.id DESC
         LIMIT ? OFFSET ?`
      : `SELECT pl.*, u.name as user_name, creator.name as creator_name
         FROM point_logs pl
         JOIN users u ON pl.user_id = u.id
         LEFT JOIN users creator ON pl.created_by = creator.id
         ORDER BY pl.created_at DESC, pl.id DESC
         LIMIT ? OFFSET ?`;

    const rows = userId
      ? db.prepare(sql).all(userId, limit, offset)
      : db.prepare(sql).all(limit, offset);

    return { logs: rows };
  });

  // 小孩查自己记录
  app.get('/point-logs/me', async (req) => {
    const db = getDb();
    const limit = Math.min(Number((req.query as any)?.limit ?? 50), 200);
    const offset = Number((req.query as any)?.offset ?? 0);

    const logs = db.prepare(`
      SELECT pl.*, creator.name as creator_name
      FROM point_logs pl
      LEFT JOIN users creator ON pl.created_by = creator.id
      WHERE pl.user_id = ?
      ORDER BY pl.created_at DESC, pl.id DESC
      LIMIT ? OFFSET ?
    `).all(req.user!.sub, limit, offset);

    return { logs };
  });
}
