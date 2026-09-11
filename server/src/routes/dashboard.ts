import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { requireParent } from '../middleware.js';

export function registerDashboardRoutes(app: FastifyInstance) {
  // 家长总览：所有小孩卡片 + 今日得分
  app.get('/dashboard', { preHandler: requireParent }, async () => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    // 今日加分/扣分统计（排除兑换消耗，只算积分项的加减分）
    const todayStart = Math.floor(new Date(today + 'T00:00:00').getTime() / 1000);
    const todayEnd = todayStart + 86400;

    const children = db.prepare(`
      SELECT id, name, avatar, total_points,
        (SELECT COALESCE(SUM(pl.delta), 0) FROM point_logs pl
         WHERE pl.user_id = u.id AND pl.delta > 0
           AND pl.created_at >= ? AND pl.created_at < ?) as today_points
      FROM users u
      WHERE role = 'child'
      ORDER BY total_points DESC, id ASC
    `).all(todayStart, todayEnd);
    const summary = db.prepare(`
      SELECT
        SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END) as gain,
        SUM(CASE WHEN delta < 0 AND source != 'exchange' THEN delta ELSE 0 END) as loss,
        SUM(CASE WHEN source != 'exchange' THEN 1 ELSE 0 END) as count
      FROM point_logs
      WHERE created_at >= ? AND created_at < ?
    `).get(todayStart, todayEnd) as { gain: number | null; loss: number | null; count: number | null };

    // 待审核计数（兑换申请 + 任务完成申请）
    const pendingExchange = db.prepare(`SELECT COUNT(*) as c FROM exchange_requests WHERE status = 'pending'`).get() as any;
    const pendingTasks = db.prepare(`SELECT COUNT(*) as c FROM task_completions WHERE status = 'pending'`).get() as any;

    return {
      children,
      todaySummary: {
        gain: summary.gain ?? 0,
        loss: summary.loss ?? 0,
        count: summary.count ?? 0,
      },
      pendingReview: {
        exchange: pendingExchange?.c ?? 0,
        tasks: pendingTasks?.c ?? 0,
        total: (pendingExchange?.c ?? 0) + (pendingTasks?.c ?? 0),
      },
    };
  });

  // 小孩端总览：自己的积分 + 今日统计 + 历史累计 + 头像
  app.get('/dashboard/me', async (req) => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const todayStart = Math.floor(new Date(today + 'T00:00:00').getTime() / 1000);
    const todayEnd = todayStart + 86400;

    const me = db.prepare(`
      SELECT id, name, avatar, total_points as totalPoints
      FROM users u WHERE id = ?
    `).get(req.user!.sub) as any;

    if (!me) return { error: 'not_found' };

    // 今日加分/扣分/兑换
    const todayStats = db.prepare(`
      SELECT
        SUM(CASE WHEN delta > 0 AND source != 'exchange' THEN delta ELSE 0 END) as todayGain,
        SUM(CASE WHEN delta < 0 AND source != 'exchange' THEN delta ELSE 0 END) as todayLoss,
        SUM(CASE WHEN source = 'exchange' THEN delta ELSE 0 END) as todayExchange
      FROM point_logs
      WHERE user_id = ? AND created_at >= ? AND created_at < ?
    `).get(req.user!.sub, todayStart, todayEnd) as any;

    // 历史累计加分/扣分/兑换
    const totalStats = db.prepare(`
      SELECT
        SUM(CASE WHEN delta > 0 AND source != 'exchange' THEN delta ELSE 0 END) as totalGain,
        SUM(CASE WHEN delta < 0 AND source != 'exchange' THEN delta ELSE 0 END) as totalLoss,
        SUM(CASE WHEN source = 'exchange' THEN delta ELSE 0 END) as totalExchange
      FROM point_logs WHERE user_id = ?
    `).get(req.user!.sub) as any;

    return {
      id: me.id,
      name: me.name,
      avatar: me.avatar,
      totalPoints: me.totalPoints,
      todayGain: todayStats?.todayGain ?? 0,
      todayLoss: todayStats?.todayLoss ?? 0,
      todayExchange: todayStats?.todayExchange ?? 0,
      totalGain: totalStats?.totalGain ?? 0,
      totalLoss: totalStats?.totalLoss ?? 0,
      totalExchange: totalStats?.totalExchange ?? 0,
    };
  });
}
