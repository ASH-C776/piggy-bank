import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

function requiredEnv(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v !== undefined && v !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env: ${key}`);
}

// 使用 process.argv[1]（入口脚本路径）而非 process.cwd()，
// 避免工作目录不对导致找不到前端文件
// 编译后入口 = server/dist/index.js，项目根目录 = 上两级
// 导出供 about.ts 用：版本号兜底读取 deploy/fpk/.../manifest
export const projectRoot = join(dirname(process.argv[1]), '..', '..');

export const config = {
  port: parseInt(requiredEnv('PORT', '3000'), 10),
  dataDir: requiredEnv('DATA_DIR', join(projectRoot, 'data')),
  adminUsername: requiredEnv('ADMIN_USERNAME', 'admin'),
  adminPassword: requiredEnv('ADMIN_PASSWORD', 'admin123'),
  jwtSecret: requiredEnv('JWT_SECRET', 'please-change-this-secret'),
  // 令牌有效期 7 天。旧版 10y 等于永久令牌，改密码/登出后旧 token 依然有效。
  jwtExpiresIn: '7d',
  webDist: join(projectRoot, 'web', 'dist'),

  // 可选 CORS 白名单：逗号分隔的来源，如 "https://app.example.com,http://192.168.1.5:5173"；
  // 留空则保持默认 origin:true（反射任意来源，兼容内网/各种 WebView scheme）。
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // ── 飞牛 fnOS 统一网关 ──────────────────────────────────────────────────
  // 由 fpk 的 app/docker/docker-compose.yaml 注入；非飞牛环境（本机开发、
  // 纯 Docker 部署）两个值都为空，此时应用行为与过去完全一致（只监听 TCP 端口）。
  // 留在这里而不是直接读 process.env，是为了让「应用依赖哪些环境变量」集中可见。
  gatewayPrefix: process.env.GATEWAY_PREFIX ?? '', // 公开路径，如 /app/com.piggybank.app
  gatewaySocket: process.env.GATEWAY_SOCKET ?? '', // unix socket 文件，如 /app/gateway/app.sock
};

export function ensureDataDir(): void {
  mkdirSync(config.dataDir, { recursive: true });
}
