import Fastify, { type FastifyServerOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import { Server, IncomingMessage } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config, ensureDataDir } from './config.js';
import {
  isBareGatewayPrefix,
  normalizeGatewayPrefix,
  startGatewaySocket,
  stripGatewayPrefix,
} from './gateway.js';
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
import { registerGrowthRoutes } from './routes/growth.js';
import { registerBackupRoutes } from './routes/backup.js';
import { registerAboutRoutes } from './routes/about.js';
import { startBackupScheduler } from './backup.js';

async function main() {
  ensureDataDir();
  initDb(config.dataDir);

  // 飞牛统一网关的公开路径（未配置为空串 → 应用行为与纯自托管部署一致）
  const gatewayPrefix = normalizeGatewayPrefix(config.gatewayPrefix);

  // 剥前缀必须用 rewriteUrl，**不能用 onRequest**：
  // Fastify 的路由匹配发生在 onRequest 钩子之前，在 onRequest 里改 req.raw.url 只影响
  // 后续处理器、影响不到路由选择（实测：静态资源仍按带前缀的原路径 404）。
  // rewriteUrl 是官方为「路由前改写 URL」提供的钩子，改写发生在路由匹配之前，
  // 并且会把原始 URL 先存进 req.originalUrl —— 下面处理裸前缀跳转时正需要它。
  // ！类型定义里还没有这个字段（fastify 4.29 实现已有、d.ts 未跟进），故断言一次。
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'production',
    rewriteUrl: gatewayPrefix
      ? (req: IncomingMessage) => stripGatewayPrefix(req.url ?? '/', gatewayPrefix)
      : undefined,
  } as FastifyServerOptions);
  const httpServer = app.server as unknown as Server;

  // 同一套根路径路由（/、/api/*、/assets/*、/ws）由此同时服务三种入口：
  //   · 局域网直连        http://<ip>:3000/
  //   · 飞牛统一网关      https://<飞牛域名>/app/com.piggybank.app/
  //   · APK（Capacitor）  http://localhost/
  if (gatewayPrefix) {
    app.addHook('onRequest', (req, reply, done) => {
      // 裸前缀（无尾斜杠）要补跳一次：前端产物一律用相对路径，
      // 文档 URL 不以 / 结尾时 ./assets/x.js 会被解析到上一级目录而 404。
      // 用 302 而非 301：万一以后调整公开路径，不至于被浏览器永久缓存卡住。
      const raw = req.raw as IncomingMessage & { originalUrl?: string };
      const original = raw.originalUrl ?? raw.url ?? '/';
      if (isBareGatewayPrefix(original, gatewayPrefix)) {
        reply.redirect(302, `${gatewayPrefix}/`);
        return;
      }
      done();
    });
  }

  registerAuthHook(app);

  await app.register(cors, {
    // 默认 origin:true 反射任意来源，兼容内网与各种 WebView scheme；
    // 配置 ALLOWED_ORIGINS 后改为白名单匹配，不在名单内的来源不放行。
    origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : true,
  });

  // 统一错误兜底：路由里未捕获的 throw e 不再裸奔成默认 500；
  // 5xx 只回 internal_error 不外泄内部信息，详细错误写日志（生产 logger 关闭时至少不崩）。
  app.setErrorHandler((error, _req, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      app.log?.error?.(error);
      return reply.code(500).send({ error: 'internal_error' });
    }
    return reply.code(status).send({ error: error.message || 'error' });
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
    registerGrowthRoutes(api);
    registerBackupRoutes(api);
    registerAboutRoutes(api);
  }, { prefix: '/api' });

  if (existsSync(config.webDist)) {
    // 必须保持 wildcard 默认为 true：通配路由在请求时实时从磁盘读取文件，
    // vite 重新构建后的新 hash 文件无需重启即可服务。
    // 不能用 wildcard:false——该模式仅在启动时 glob 一次文件并注册路由，
    // 构建后的新文件会 404 并回退到 index.html，导致 JS 以 text/html 返回、浏览器白屏。
    await app.register(fastifyStatic, {
      root: config.webDist,
      prefix: '/',
      // ── 缓存策略 ────────────────────────────────────────────────────────
      // 此前没配 setHeaders，所有静态资源都落到默认的 `public, max-age=0`：
      // 每次导航、每个资源都要发一次条件请求换 304。局域网 RTT 极小无感，
      // 但 4G 远端访问（App 里填了远端服务器）时几十个并发 revalidate 会明显拖慢首屏。
      // 三档策略的依据是"文件名里有没有内容指纹"：
      setHeaders(res, filePath) {
        // 用相对 root 的路径判断，而不是绝对路径的 includes —— 否则项目路径里
        // 一旦出现 assets/fonts 这样的目录名就会误判。
        const rel = path.relative(config.webDist, filePath).replace(/\\/g, '/');

        if (rel.endsWith('.html')) {
          // index.html 是唯一"名字不变但内容会变"的入口文件，必须每次校验。
          // 一旦给它长缓存：发版后用户拿到旧 html，里面引用的旧 hash chunk
          // 已在服务器上被删除 → 404 → 白屏（本项目踩过一次，极难定位）。
          res.setHeader('Cache-Control', 'no-cache');
        } else if (rel.startsWith('assets/')) {
          // vite 产出的文件名内嵌内容 hash：内容一变文件名就变，可放心永久缓存。
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (rel.startsWith('fonts/')) {
          // 字体是手动放在 public/ 里的，文件名稳定、不带 hash，而单个就有 838KB。
          // 给 7 天并靠 ETag 兜底：既避免重复下载，换字体后也能在一周内自然更新。
          res.setHeader('Cache-Control', 'public, max-age=604800');
        }
        // 其余（图标等）不设，保持框架默认行为。
      },
    });

    app.setNotFoundHandler((req, reply) => {
      // 一律读 raw.url：上面 onRequest 钩子剥网关前缀时改的就是它，
      // 用 req.url 是否同步取决于 Fastify 版本实现，不赌。
      const requestUrl = req.raw.url ?? '/';
      if (requestUrl.startsWith('/api/') || requestUrl === '/ws') {
        return reply.code(404).send({ error: 'not_found' });
      }
      // 静态资源（js/css/图片/字体等）找不到时必须返回 404，
      // 绝不能兜底成 index.html——否则浏览器会把 HTML 当 JS/CSS 解析，
      // 报 SyntaxError 导致整站白屏，且极难定位。
      const pathname = requestUrl.split('?')[0];
      if (/\.(js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|eot|json|txt)$/i.test(pathname)) {
        return reply.code(404).send({ error: 'asset_not_found', path: pathname });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.get('/', async () => ({
      message: 'Money Jar API',
      hint: '前端未构建，请先运行 npm run build --workspace web',
    }));
  }

  initWs(httpServer, gatewayPrefix);

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`🪙 Money Jar running on http://0.0.0.0:${config.port}`);
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }

  // TCP 端口先起来，再做 unix socket 透传（透传的目标就是上面这个端口）
  if (config.gatewaySocket.trim()) {
    startGatewaySocket(config.gatewaySocket.trim(), config.port);
  }

  // 自动备份调度：启动时补跑 + 每小时检查（内部自行try/catch，失败不影响主服务）
  startBackupScheduler();
}

main();
