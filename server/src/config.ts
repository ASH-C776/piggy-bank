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
const projectRoot = join(dirname(process.argv[1]), '..', '..');

export const config = {
  port: parseInt(requiredEnv('PORT', '3000'), 10),
  dataDir: requiredEnv('DATA_DIR', join(projectRoot, 'data')),
  adminUsername: requiredEnv('ADMIN_USERNAME', 'admin'),
  adminPassword: requiredEnv('ADMIN_PASSWORD', 'admin123'),
  jwtSecret: requiredEnv('JWT_SECRET', 'please-change-this-secret'),
  jwtExpiresIn: '10y',
  webDist: join(projectRoot, 'web', 'dist'),
};

export function ensureDataDir(): void {
  mkdirSync(config.dataDir, { recursive: true });
}
