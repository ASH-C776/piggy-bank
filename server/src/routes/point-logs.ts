import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { requireParent } from '../middleware.js';
import { dateStrToRange } from '../utils/date.js';

export function registerPointLogsRoutes(app: FastifyInstance) {
  // 家长查所有记录：支持 userId 过滤、dateFrom/dateTo 本地日期区间、分页（offset/limit）
  app.get('/point-logs', { preHandler: requireParent }, async (req) => {
    const db = getDb();
    const q = req.query as Record<string, string | undefined>;
    const userId = q.userId ? Number(q.userId) : null;
    const limit = Math.min(Number(q.limit ?? 20), 200);
    const offset = Math.max(Number(q.offset ?? 0), 0);
    const from = dateStrToRange(q.dateFrom);
    const to = dateStrToRange(q.dateTo);

    const where: string[] = [];
    const params: any[] = [];
    if (userId) {
      where.push('pl.user_id = ?');
      params.push(userId);
    }
    if (from) {
      where.push('pl.created_at >= ?');
      params.push(from.start);
    }
    if (to) {
      where.push('pl.created_at < ?');
      params.push(to.end);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const fromClause = `FROM point_logs pl
      JOIN users u ON pl.user_id = u.id
      LEFT JOIN users creator ON pl.created_by = creator.id
      ${whereSql}`;

    const total = (db.prepare(`SELECT COUNT(*) AS c ${fromClause}`).get(...params) as any).c;
    const rows = db.prepare(
      `SELECT pl.*, u.name as user_name, creator.name as creator_name
       ${fromClause}
       ORDER BY pl.created_at DESC, pl.id DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return { logs: rows, total };
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
