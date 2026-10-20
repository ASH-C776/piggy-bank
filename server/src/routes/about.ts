import type { FastifyInstance } from 'fastify';
import { requireParent } from '../middleware.js';
import { getAboutInfo } from '../about.js';

export function registerAboutRoutes(app: FastifyInstance) {
  // 「关于」弹窗打开时自动调用（走 30 分钟 TTL 缓存，不反复打外网）；
  // 用户手动点「检查更新」带 ?force=1 绕过缓存立即重查。
  app.get<{ Querystring: { force?: string } }>(
    '/about',
    { preHandler: requireParent },
    async (req) => {
      return getAboutInfo(req.query.force === '1');
    }
  );
}
