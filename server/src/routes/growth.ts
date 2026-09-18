import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireParent } from '../middleware.js';
import { pushToUser } from '../ws.js';

const recordSchema = z.object({
  user_id: z.number().int().positive(),
  record_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD'),
  height_cm: z.number().min(30).max(250).nullable().optional(),
  weight_kg: z.number().min(2).max(200).nullable().optional(),
  note: z.string().max(100).nullable().optional(),
});

const updateSchema = z.object({
  height_cm: z.number().min(30).max(250).nullable().optional(),
  weight_kg: z.number().min(2).max(200).nullable().optional(),
  note: z.string().max(100).nullable().optional(),
});

const settingsSchema = z.object({
  growth_record_reward: z.number().int().min(0).max(1000).optional(),
  growth_reward_per_cm: z.number().int().min(0).max(1000).optional(),
});

/** 读取数字型设置，缺省回退 */
function getSetting(key: string, fallback: number): number {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 成长奖励计入 point_logs 时复用 source='adjust'：
 * 该列有 CHECK 约束 ('daily','adhoc','exchange','adjust')，SQLite 修改 CHECK 需重建表，
 * 风险远大于收益，因此靠 note 文案区分成长奖励与手动调整。
 *
 * delta 可为负：身高比上次矮了要按比例扣回，这是家长明确要求的规则。
 */
function awardPoints(
  userId: number,
  delta: number,
  note: string,
  createdBy: number,
  refId: number
): void {
  if (delta === 0) return;
  const db = getDb();
  db.prepare(
    `INSERT INTO point_logs (user_id, delta, source, ref_id, note, created_by)
     VALUES (?, ?, 'adjust', ?, ?, ?)`
  ).run(userId, delta, refId, note, createdBy);
  db.prepare('UPDATE users SET total_points = total_points + ? WHERE id = ?').run(delta, userId);
}

/**
 * 重算某个孩子所有记录的 grow_cm（长高量）。
 *
 * 插入或修改了中间某条记录后，它后面那些记录的「相对上一条」都会失准，
 * 所以整段重刷一遍。注意这里只重算显示用的 grow_cm，
 * 不重算 awarded —— 积分一旦发出就按当时的规则结算，不追溯。
 */
function recomputeGrow(userId: number): void {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, height_cm FROM growth_records
       WHERE user_id = ? ORDER BY record_date ASC, id ASC`
    )
    .all(userId) as Array<{ id: number; height_cm: number | null }>;

  const update = db.prepare('UPDATE growth_records SET grow_cm = ? WHERE id = ?');
  let prev: number | null = null;
  for (const r of rows) {
    if (r.height_cm == null) {
      // 本次没量身高：不构成新的基准，也不产生增减
      update.run(null, r.id);
      continue;
    }
    update.run(prev === null ? null : Number((r.height_cm - prev).toFixed(1)), r.id);
    prev = r.height_cm;
  }
}

export function registerGrowthRoutes(app: FastifyInstance) {
  // 成长积分规则（家长可读可改）
  app.get('/growth/settings', { preHandler: requireParent }, async () => {
    return {
      growth_record_reward: getSetting('growth_record_reward', 2),
      growth_reward_per_cm: getSetting('growth_reward_per_cm', 10),
    };
  });

  app.put('/growth/settings', { preHandler: requireParent }, async (req, reply) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });

    const db = getDb();
    const stmt = db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`
    );
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) stmt.run(key, String(value));
    }
    return {
      ok: true,
      growth_record_reward: getSetting('growth_record_reward', 2),
      growth_reward_per_cm: getSetting('growth_reward_per_cm', 10),
    };
  });

  // 录入 / 更新成长记录（家长）
  // 同一天重复录入按更新处理：按新旧核算结果的「差额」补发或扣回，改回去不会白拿分
  app.post('/growth/records', { preHandler: requireParent }, async (req, reply) => {
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    const { user_id, record_date, height_cm, weight_kg, note } = parsed.data;
    const db = getDb();

    const child = db
      .prepare("SELECT id, name FROM users WHERE id = ? AND role = 'child'")
      .get(user_id) as { id: number; name: string } | undefined;
    if (!child) return reply.code(404).send({ error: 'not_found' });

    if (height_cm == null && weight_kg == null) {
      return reply.code(400).send({ error: 'empty_record', message: '身高和体重至少填一项' });
    }

    const existing = db
      .prepare('SELECT id, awarded, height_cm FROM growth_records WHERE user_id = ? AND record_date = ?')
      .get(user_id, record_date) as { id: number; awarded: number | null; height_cm: number | null } | undefined;

    // 上一次有效身高（早于本次日期的最近一条），用于计算长高了多少
    const prev = db
      .prepare(
        `SELECT height_cm FROM growth_records
         WHERE user_id = ? AND record_date < ? AND height_cm IS NOT NULL
         ORDER BY record_date DESC LIMIT 1`
      )
      .get(user_id, record_date) as { height_cm: number } | undefined;

    // 本次是「同日覆盖」时，基准要排除被覆盖的那条本身，否则会拿自己跟自己比
    let baseline: number | null = prev?.height_cm ?? null;
    if (!prev && existing?.height_cm != null) baseline = null;

    const growCm = height_cm != null && baseline !== null ? height_cm - baseline : 0;

    // 本次核算：记录奖励 + 身高变化 × 每厘米分值（变矮则为负）
    const recordReward = Math.max(0, getSetting('growth_record_reward', 2));
    const perCm = getSetting('growth_reward_per_cm', 10);
    const calcAward = () => recordReward + (growCm !== 0 ? Math.round(growCm * perCm) : 0);

    let recordId: number;
    let awarded: number;

    if (existing) {
      // 同日覆盖：只补/扣「新旧核算的差额」，反复改数据刷不出分
      const newAward = calcAward();
      awarded = newAward - (existing.awarded ?? 0);
      db.prepare(
        `UPDATE growth_records
         SET height_cm = ?, weight_kg = ?, note = ?, created_by = ?, grow_cm = ?, awarded = ?
         WHERE id = ?`
      ).run(
        height_cm ?? null,
        weight_kg ?? null,
        note ?? null,
        req.user!.sub,
        height_cm != null && baseline !== null ? Number(growCm.toFixed(1)) : null,
        newAward,
        existing.id
      );
      recordId = existing.id;
    } else {
      awarded = calcAward();
      const res = db
        .prepare(
          `INSERT INTO growth_records
           (user_id, record_date, height_cm, weight_kg, grow_cm, awarded, note, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          user_id,
          record_date,
          height_cm ?? null,
          weight_kg ?? null,
          height_cm != null && baseline !== null ? Number(growCm.toFixed(1)) : null,
          awarded,
          note ?? null,
          req.user!.sub
        );
      recordId = Number(res.lastInsertRowid);
    }

    const parts: string[] = ['测量记录'];
    if (growCm !== 0) parts.push(growCm > 0 ? `长高 ${growCm.toFixed(1)}cm` : `身高回落 ${Math.abs(growCm).toFixed(1)}cm`);
    if (awarded !== 0) awardPoints(user_id, awarded, parts.join(' · '), req.user!.sub, recordId);

    // 中间插一条会让它后面那些记录的「相对上一条」失准，整段重刷
    recomputeGrow(user_id);

    pushToUser(user_id, {
      type: 'growth_recorded',
      recordId,
      recordDate: record_date,
      heightCm: height_cm ?? null,
      growCm: Number(growCm.toFixed(1)),
      awarded,
    });

    return {
      ok: true,
      id: recordId,
      updated: Boolean(existing),
      growCm: Number(growCm.toFixed(1)),
      awarded,
    };
  });

  // 修改已有记录（家长，不触发积分）
  app.patch('/growth/records/:id', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });

    const db = getDb();
    const row = db.prepare('SELECT user_id FROM growth_records WHERE id = ?').get(id) as
      | { user_id: number }
      | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });

    const d = parsed.data;
    const sets: string[] = [];
    const params: Array<string | number | null> = [];
    if (d.height_cm !== undefined) { sets.push('height_cm = ?'); params.push(d.height_cm); }
    if (d.weight_kg !== undefined) { sets.push('weight_kg = ?'); params.push(d.weight_kg); }
    if (d.note !== undefined) { sets.push('note = ?'); params.push(d.note); }
    if (sets.length) {
      params.push(id);
      db.prepare(`UPDATE growth_records SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      // 身高变了，整段增减量要跟着重算（积分不追溯）
      recomputeGrow(row.user_id);
    }
    return { ok: true };
  });

  // 删除记录（家长）
  // 连带着把这条记录发出去的积分收回、对应的积分流水删掉，不留幽灵分数。
  // 注意：只回滚被删的这一条，不重算后面记录的历史得分（积分按当时规则结算，不追溯）。
  app.delete('/growth/records/:id', { preHandler: requireParent }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const db = getDb();
    const row = db.prepare('SELECT user_id, awarded FROM growth_records WHERE id = ?').get(id) as
      | { user_id: number; awarded: number | null }
      | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });

    const refunded = row.awarded ?? 0;
    const remove = db.transaction(() => {
      if (refunded !== 0) {
        db.prepare(
          `DELETE FROM point_logs
           WHERE user_id = ? AND source = 'adjust' AND ref_id = ? AND note LIKE '测量记录%'`
        ).run(row.user_id, id);
        db.prepare('UPDATE users SET total_points = total_points - ? WHERE id = ?').run(
          refunded,
          row.user_id
        );
      }
      db.prepare('DELETE FROM growth_records WHERE id = ?').run(id);
    });
    remove();

    recomputeGrow(row.user_id);
    return { ok: true, refunded };
  });

  // 查询某个孩子的记录（家长本人，或孩子查自己）
  app.get('/growth/children/:id/records', async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    if (req.user.role !== 'parent' && req.user.sub !== id) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const db = getDb();
    const child = db
      .prepare("SELECT id, name, birthday, sex FROM users WHERE id = ? AND role = 'child'")
      .get(id) as { id: number; name: string; birthday: string | null; sex: string | null } | undefined;
    if (!child) return reply.code(404).send({ error: 'not_found' });

    const records = db
      .prepare(
        `SELECT id, record_date, height_cm, weight_kg, grow_cm, awarded, note, created_at
         FROM growth_records WHERE user_id = ? ORDER BY record_date ASC`
      )
      .all(id);

    return { child, records };
  });

  // 孩子端：查看自己的成长记录
  app.get('/growth/mine', async (req, reply) => {
    if (!req.user || req.user.role !== 'child') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const id = req.user.sub;
    const db = getDb();

    const profile = db
      .prepare("SELECT id, name, birthday, sex FROM users WHERE id = ?")
      .get(id) as { id: number; name: string; birthday: string | null; sex: string | null } | undefined;
    if (!profile) return reply.code(404).send({ error: 'not_found' });

    const records = db
      .prepare(
        `SELECT id, record_date, height_cm, weight_kg, grow_cm, awarded, note, created_at
         FROM growth_records WHERE user_id = ? ORDER BY record_date ASC`
      )
      .all(id);

    return { profile, records };
  });
}
