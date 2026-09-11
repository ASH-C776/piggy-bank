import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import { Server } from 'node:http';
import { existsSync } from 'node:fs';
import { config, ensureDataDir } from './config.js';
import { initDb } from './db/index.js';
import { registerAuthHook } from './middleware.js';
import { initWs } from './ws.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerChildrenRoutes } from './routes/children.js';
import { registerPointItemsRoutes } from './routes/point-items.js';
import { registerPointLogsRoutes } from './routes/point-logs.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerAdhocTasksRoutes } from './routes/adhoc-tasks.js';
import { registerProductsRoutes } from './routes/products.js';
import { registerExchangeRequestsRoutes } from './routes/exchange-requests.js';

async function main() {
  ensureDataDir();
  initDb(config.dataDir);

  const app = Fastify({ logger: process.env.NODE_ENV !== 'production' });
  const httpServer = app.server as unknown as Server;

  registerAuthHook(app);

  await app.register(cors, {
    // 允许移动端 App（WebView 来源）访问 API；家庭内网工具，反射任意来源以兼容不同 WebView scheme
    origin: true,
  });

  await app.register(async (api) => {
    registerAuthRoutes(api);
    registerChildrenRoutes(api);
    registerPointItemsRoutes(api);
    registerPointLogsRoutes(api);
    registerDashboardRoutes(api);
    registerAdhocTasksRoutes(api);
    registerProductsRoutes(api);
    registerExchangeRequestsRoutes(api);
  }, { prefix: '/api' });

  if (existsSync(config.webDist)) {
    // 必须保持 wildcard 默认为 true：通配路由在请求时实时从磁盘读取文件，
    // vite 重新构建后的新 hash 文件无需重启即可服务。
    // 不能用 wildcard:false——该模式仅在启动时 glob 一次文件并注册路由，
    // 构建后的新文件会 404 并回退到 index.html，导致 JS 以 text/html 返回、浏览器白屏。
    await app.register(fastifyStatic, {
      root: config.webDist,
      prefix: '/',
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url === '/ws') {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.get('/', async () => ({
      message: 'Money Jar API',
      hint: '前端未构建，请先运行 npm run build --workspace web',
    }));
  }

  initWs(httpServer);

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`🪙 Money Jar running on http://0.0.0.0:${config.port}`);
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

main();
