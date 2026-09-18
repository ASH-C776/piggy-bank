import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireParent } from '../middleware.js';
import { getCashRate } from './products.js';
import { pushToUser, pushToParents } from '../ws.js';

const createProductExchangeSchema = z.object({
  type: z.literal('product'),
  productId: z.number().int().positive(),
});

const createCashExchangeSchema = z.object({
  type: z.literal('cash'),
  points: z.number().int().positive(),
});

const rejectSchema = z.object({
  reason: z.string().min(1).max(100),
});

export function registerExchangeRequestsRoutes(app: FastifyInstance) {
  // 小孩：提交兑换申请
  app.post('/exchange-requests', async (req, reply) => {
    const uid = req.user!.sub;
    const body = req.body as any;

    if (body?.type === 'product') {
      const parsed = createProductExchangeSchema.safeParse(body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
      const { productId } = parsed.data;

      const db = getDb();
      // 事务：校验商品+库存+积分余额，写入申请
      let prodResult: any;
      try {
        const txn = db.transaction(() => {
          const product = db.prepare("SELECT * FROM products WHERE id = ? AND status = 'active'").get(productId) as any;
          if (!product) throw new Error('product_not_found');
          if (product.stock !== -1 && product.stock <= 0) throw new Error('out_of_stock');

          const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as any;
          if (user.total_points < product.cost) throw new Error('insufficient_points');

          const r = db.prepare(`
            INSERT INTO exchange_requests (user_id, type, product_id, points, amount, status)
            VALUES (?, 'product', ?, ?, 0, 'pending')
          `).run(uid, productId, product.cost);
          prodResult = { id: Number(r.lastInsertRowid), points: product.cost, productName: product.name, product_id: productId };
        });
        txn();
        // 推送给所有家长：商品兑换申请（与现金兑换保持一致）
        pushToParents({
          type: 'new_exchange_request',
          requestId: prodResult.id,
          userId: uid,
          userName: (db.prepare('SELECT name FROM users WHERE id = ?').get(uid) as any)?.name,
          exchangeType: 'product',
          productId: prodResult.product_id,
          productName: prodResult.productName,
          points: prodResult.points,
        });
        return prodResult;
      } catch (e: any) {
        const msg = e.message;
        if (msg === 'product_not_found') return reply.code(404).send({ error: msg });
        if (msg === 'out_of_stock') return reply.code(409).send({ error: msg });
        if (msg === 'insufficient_points') return reply.code(409).send({ error: msg });
        throw e;
      }
    }

    if (body?.type === 'cash') {
      const parsed = createCashExchangeSchema.safeParse(body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
      const cashPoints: number = parsed.data.points;
      const cashRate = getCashRate();
      if (cashPoints % cashRate !== 0) return reply.code(400).send({ error: 'invalid_input', detail: `积分必须是 ${cashRate} 的倍数` });
      const amount = cashPoints / cashRate;

      const db = getDb();
      let cashResult: any;
      try {
        const txn = db.transaction(() => {
          const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as any;
          if (user.total_points < cashPoints) throw new Error('insufficient_points');
          const r = db.prepare(`
            INSERT INTO exchange_requests (user_id, type, points, amount, status)
            VALUES (?, 'cash', ?, ?, 'pending')
          `).run(uid, cashPoints, amount);
          cashResult = { id: Number(r.lastInsertRowid), points: cashPoints, amount };
        });
        txn();
        // 推送给所有家长：现金兑换申请
        pushToParents({
          type: 'new_exchange_request',
          requestId: cashResult.id,
          userId: uid,
          userName: (db.prepare('SELECT name FROM users WHERE id = ?').get(uid) as any)?.name,
          exchangeType: 'cash',
          amount: cashResult.amount,
          points: cashResult.points,
        });
        return cashResult;
      } catch (e: any) {
        if (e.message === 'insufficient_points') return reply.code(409).send({ error: e.message });
        throw e;
      }
    }

    return reply.code(400).send({ error: 'invalid_type' });
  });

  // 小孩：查看自己的兑换记录
  app.get('/exchange-requests/mine', async (req) => {
    const db = getDb();
    const uid = req.user!.sub;
    const list = db.prepare(`
      SELECT e.*, p.name as product_name, p.icon as product_icon
      FROM exchange_requests e
      LEFT JOIN products p ON p.id = e.product_id
      WHERE e.user_id = ?
      ORDER BY e.created_at DESC
    `).all(uid);
    return { requests: list };
  });

  // 家长：审核列表（按状态过滤）
  app.get('/exchange-requests', { preHandler: requireParent }, async (req) => {
    const db = getDb();
    const status = (req.query as any)?.status ?? 'pending';
    const list = db.prepare(`
      SELECT e.*, u.name as user_name, u.avatar as user_avatar, p.name as product_name, p.icon as product_icon
      FROM exchange_requests e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN products p ON p.id = e.product_id
      WHERE e.status = ?
      ORDER BY e.created_at DESC
    `).all(status);
    return { requests: list };
  });

  // 家长：通过审核
  app.post('/exchange-requests/:id/approve', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const db = getDb();

    try {
      let newBalance: number | null = null;
      const txn = db.transaction(() => {
        const req0 = db.prepare('SELECT * FROM exchange_requests WHERE id = ?').get(id) as any;
        if (!req0) throw new Error('not_found');
        if (req0.status !== 'pending') throw new Error('already_reviewed');

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req0.user_id) as any;
        if (user.total_points < req0.points) throw new Error('insufficient_points');

        // 扣积分
        db.prepare('UPDATE users SET total_points = total_points - ? WHERE id = ?').run(req0.points, req0.user_id);
        // 写流水
        db.prepare(`
          INSERT INTO point_logs (user_id, delta, source, ref_id, note, created_by)
          VALUES (?, ?, 'exchange', ?, ?, ?)
        `).run(
          req0.user_id, -req0.points, req0.id,
          req0.type === 'cash' ? `兑换现金 ${req0.amount}元` : `兑换商品：${(db.prepare('SELECT name FROM products WHERE id = ?').get(req0.product_id) as any)?.name ?? '已删除'}`,
          req.user!.sub,
        );
        // 更新申请状态
        db.prepare('UPDATE exchange_requests SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?')
          .run('approved', req.user!.sub, Math.floor(Date.now() / 1000), id);
        // 减库存
        if (req0.type === 'product' && req0.product_id) {
          db.prepare('UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0').run(req0.product_id);
        }

        newBalance = (db.prepare('SELECT total_points FROM users WHERE id = ?').get(req0.user_id) as any).total_points;
      });
      txn();
      // 推送给小孩：审核通过
      const req0After = db.prepare('SELECT * FROM exchange_requests WHERE id = ?').get(id) as any;
      pushToUser(req0After.user_id, {
        type: 'exchange_reviewed',
        requestId: id,
        status: 'approved',
        exchangeType: req0After.type,
        points: req0After.points,
        amount: req0After.amount,
        productName: req0After.type === 'product'
          ? (db.prepare('SELECT name FROM products WHERE id = ?').get(req0After.product_id) as any)?.name
          : null,
        newBalance,
      });
      return { ok: true, newBalance };
    } catch (e: any) {
      const msg = e.message;
      if (msg === 'not_found') return reply.code(404).send({ error: msg });
      if (msg === 'already_reviewed') return reply.code(409).send({ error: msg });
      if (msg === 'insufficient_points') return reply.code(409).send({ error: msg });
      throw e;
    }
  });

  // 家长：拒绝审核
  app.post('/exchange-requests/:id/reject', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });

    const db = getDb();
    const r = db.prepare(`
      UPDATE exchange_requests
      SET status = 'rejected', reason = ?, reviewed_by = ?, reviewed_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(parsed.data.reason, req.user!.sub, Math.floor(Date.now() / 1000), id);
    if (r.changes === 0) return reply.code(409).send({ error: 'already_reviewed' });
    // 推送给小孩：审核拒绝
    const req0 = db.prepare('SELECT * FROM exchange_requests WHERE id = ?').get(id) as any;
    pushToUser(req0.user_id, {
      type: 'exchange_reviewed',
      requestId: id,
      status: 'rejected',
      exchangeType: req0.type,
      points: req0.points,
      amount: req0.amount,
      reason: parsed.data.reason,
      productName: req0.type === 'product'
        ? (db.prepare('SELECT name FROM products WHERE id = ?').get(req0.product_id) as any)?.name
        : null,
    });
    return { ok: true };
  });
}
