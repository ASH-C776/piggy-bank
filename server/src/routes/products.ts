import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireParent } from '../middleware.js';

const PRODUCT_ICONS = ['snack', 'toy', 'activity', 'game', 'study', 'privilege', 'food', 'gift'] as const;

const createSchema = z.object({
  name: z.string().min(1).max(50),
  cost: z.number().int().positive(),
  stock: z.number().int().default(-1), // -1 = 无限
  icon: z.enum(PRODUCT_ICONS).default('gift'),
  status: z.enum(['active', 'inactive']).default('active'),
});

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  cost: z.number().int().positive().optional(),
  stock: z.number().int().optional(),
  icon: z.enum(PRODUCT_ICONS).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

// 现金兑换比例：从 DB settings 读取，默认 10 积分 = 1 元
export function getCashRate(): number {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'cash_rate'").get() as { value: string } | undefined;
  if (!row) return 10;
  const n = parseInt(row.value, 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export function registerProductsRoutes(app: FastifyInstance) {
  // 列表（家长+小孩均可读，但小孩只看 active）
  app.get('/products', async (req) => {
    const db = getDb();
    const role = req.user!.role;
    const sql = role === 'parent'
      ? 'SELECT * FROM products ORDER BY status DESC, created_at DESC'
      : "SELECT * FROM products WHERE status = 'active' ORDER BY created_at DESC";
    return { products: db.prepare(sql).all() };
  });

  // 获取现金兑换比例
  app.get('/products/cash-rate', async () => {
    const rate = getCashRate();
    return { rate, unit: '元', pointsPerUnit: rate };
  });

  // 家长：设置现金兑换比例
  app.put('/products/cash-rate', { preHandler: requireParent }, async (req, reply) => {
    const body = req.body as any;
    const n = Number(body?.rate);
    if (!Number.isInteger(n) || n <= 0) return reply.code(400).send({ error: 'invalid_input' });
    const db = getDb();
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('cash_rate', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?")
      .run(String(n), Math.floor(Date.now() / 1000), String(n), Math.floor(Date.now() / 1000));
    return { rate: n, unit: '元', pointsPerUnit: n };
  });

  // 家长：创建商品
  app.post('/products', { preHandler: requireParent }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    const { name, cost, stock, icon, status } = parsed.data;
    const db = getDb();
    const r = db.prepare('INSERT INTO products (name, cost, stock, icon, status) VALUES (?, ?, ?, ?, ?)').run(name, cost, stock, icon, status);
    return { id: Number(r.lastInsertRowid) };
  });

  // 家长：编辑商品
  app.patch('/products/:id', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    const u = parsed.data;
    const db = getDb();
    const r = db.prepare(`
      UPDATE products SET
        name = COALESCE(?, name),
        cost = COALESCE(?, cost),
        stock = COALESCE(?, stock),
        icon = COALESCE(?, icon),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(u.name ?? null, u.cost ?? null, u.stock ?? null, u.icon ?? null, u.status ?? null, id);
    if (r.changes === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  // 家长：删除商品
  app.delete('/products/:id', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const db = getDb();
    const r = db.prepare('DELETE FROM products WHERE id = ?').run(id);
    if (r.changes === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });
}
