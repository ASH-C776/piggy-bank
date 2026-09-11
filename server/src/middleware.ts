import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { sub: number; role: 'parent' | 'child'; name: string };
  }
}

const PUBLIC_PATHS = new Set([
  '/api/auth/parent-login',
  '/api/auth/child-login',
  '/api/auth/children',
]);

export function registerAuthHook(app: FastifyInstance) {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url;
    if (url === '/' || url.startsWith('/ws') || url.startsWith('/assets/') || url.startsWith('/zodiac/')) {
      return;
    }
    if (!url.startsWith('/api/')) return;

    // CORS 预检请求不带 Authorization，必须放行交给 @fastify/cors 处理，
    // 否则跨端(App WebView)所有需登录接口的预检都会被 401，表现为"登录成功但没数据"
    if (req.method === 'OPTIONS') return;

    const path = url.split('?')[0];
    if (PUBLIC_PATHS.has(path)) return;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (!payload) {
      return reply.code(401).send({ error: 'invalid_token' });
    }
    req.user = payload;
  });
}

export async function requireParent(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user || req.user.role !== 'parent') {
    await reply.code(403).send({ error: 'forbidden' });
  }
}
