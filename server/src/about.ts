/**
 * 「关于 / 检查更新」
 *
 * ── 当前版本怎么来 ──────────────────────────────────────────────
 * 版本号唯一来源 = fpk manifest（与 CI 同一口径，见 .github/workflows/docker-publish.yml）。
 * 运行中的实例按优先级取：
 *   1. 环境变量 APP_VERSION —— CI 构建时由 build-arg 注入（见 Dockerfile / workflow）
 *   2. 镜像里的 manifest 文件本身 —— Dockerfile 已 COPY 进运行时阶段作兜底
 *   3. 'dev' —— 本机裸跑且仓库被裁剪时的降格显示
 *
 * ── 最新版本怎么来 ──────────────────────────────────────────────
 * 从公开渠道拉取仓库 main 分支上的 manifest，按序尝试：
 *   1. jsDelivr —— 国内可达，分支文件最多滞后约 12 小时（对「更新提醒」可接受）
 *   2. GitHub API contents —— 实时，但国内可能被墙、且匿名限流 60 次/小时
 * 两条都失败时不报错刷屏，只把错误文案带给前端展示「检查失败」。
 *
 * 结果带 TTL 缓存（默认 30 分钟）+ 在途请求去重：弹窗每开一次不会都打外网，
 * 手动点「检查更新」传 force 绕过缓存。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from './config.js';

export const APP_NAME = '存钱罐';
export const APP_AUTHOR = '基耶杰';
export const REPO_URL = 'https://github.com/ASH-C776/piggy-bank';
/** 「前往更新」落地页：GitHub Releases（下载新 fpk 的地方） */
export const RELEASES_URL = `${REPO_URL}/releases`;

/** manifest 相对仓库根的位置，CI 解析版本号用的也是这一行规则 */
const MANIFEST_REL = 'deploy/fpk/com.piggybank.app/manifest';

const TTL_MS = Math.max(5, parseInt(process.env.ABOUT_CHECK_TTL_MIN ?? '30', 10)) * 60_000;
const FETCH_TIMEOUT_MS = 8000;

/** 从 manifest 文本里取 version=（与 CI 的 grep/cut 保持同一口径） */
export function parseManifestVersion(text: string): string | null {
  const m = text.match(/^version=(.+)$/m);
  return m ? m[1].trim() : null;
}

/** 顺带取 changelog=（单行值），供「关于」页预览更新内容；没有则 null */
export function parseManifestChangelog(text: string): string | null {
  const m = text.match(/^changelog=(.+)$/m);
  return m ? m[1].trim() : null;
}

/** 当前实例版本：env > manifest 文件 > dev */
export function currentVersion(): string {
  const fromEnv = process.env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv;
  try {
    const v = parseManifestVersion(readFileSync(join(projectRoot, MANIFEST_REL), 'utf-8'));
    if (v) return v;
  } catch {
    /* 仓库被裁剪（比如只发了 server/dist）时落到 dev */
  }
  return 'dev';
}

interface CheckCache {
  latest: string | null;
  changelog: string | null;
  checkedAt: number | null;
  error: string | null;
  source: 'jsdelivr' | 'github' | null;
}

const cache: CheckCache = {
  latest: null,
  changelog: null,
  checkedAt: null,
  error: null,
  source: null,
};
let inFlight: Promise<CheckCache> | null = null;

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLatestVersion(): Promise<{
  version: string;
  changelog: string | null;
  source: 'jsdelivr' | 'github';
}> {
  const errors: string[] = [];

  // 1) jsDelivr：国内 NAS/手机网络下最稳的一条
  try {
    const text = await fetchText(`https://cdn.jsdelivr.net/gh/ASH-C776/piggy-bank@main/${MANIFEST_REL}`);
    const v = parseManifestVersion(text);
    if (v) return { version: v, changelog: parseManifestChangelog(text), source: 'jsdelivr' };
    errors.push('jsdelivr 未返回版本号');
  } catch (e) {
    errors.push(`jsdelivr: ${(e as Error).message}`);
  }

  // 2) GitHub API：raw 直取，免 base64 解码；User-Agent 必带，否则 403
  try {
    const text = await fetchText(
      `https://api.github.com/repos/ASH-C776/piggy-bank/contents/${MANIFEST_REL}`,
      { Accept: 'application/vnd.github.raw', 'User-Agent': 'piggy-bank-about' }
    );
    const v = parseManifestVersion(text);
    if (v) return { version: v, changelog: parseManifestChangelog(text), source: 'github' };
    errors.push('github 未返回版本号');
  } catch (e) {
    errors.push(`github: ${(e as Error).message}`);
  }

  throw new Error('暂时连不上更新源，请稍后再试');
}

/** 取最新版本；TTL 内直接返回缓存，在途请求合并（防弹窗连开打出并发） */
export function checkUpdate(force = false): Promise<CheckCache> {
  const fresh = cache.checkedAt !== null && Date.now() - cache.checkedAt < TTL_MS;
  if (!force && fresh) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const { version, changelog, source } = await fetchLatestVersion();
        cache.latest = version;
        cache.changelog = changelog;
        cache.source = source;
        cache.error = null;
      } catch (e) {
        // 失败也记录 checkedAt：按 TTL 节奏重试，而不是每次打开弹窗都重打外网
        cache.latest = null;
        cache.changelog = null;
        cache.source = null;
        cache.error = (e as Error).message;
      }
      cache.checkedAt = Date.now();
      inFlight = null;
      return cache;
    })();
  }
  return inFlight;
}

/** '1.4.1' → [1,4,1]；容忍 v 前缀与 -beta/+build 后缀，非数字段按 0 */
function parseVer(v: string): number[] {
  const core = v.trim().replace(/^v/i, '').split(/[-+]/)[0];
  return core.split('.').map((p) => parseInt(p, 10) || 0);
}

/** latest 是否严格新于 current */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVer(latest);
  const b = parseVer(current);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export interface AboutInfo {
  name: string;
  version: string;
  author: string;
  repoUrl: string;
  releasesUrl: string;
  /** 远程最新版本；检查失败时为 null */
  latestVersion: string | null;
  /** 远程 manifest 的 changelog 原文（含 <br> 与 · 前缀），供前端预览 */
  latestChangelog: string | null;
  updateAvailable: boolean;
  /** 上次检查完成时间（毫秒时间戳）；从未检查过为 null */
  checkedAt: number | null;
  checkError: string | null;
}

export async function getAboutInfo(force = false): Promise<AboutInfo> {
  const c = await checkUpdate(force);
  const version = currentVersion();
  const latest = c.latest;
  return {
    name: APP_NAME,
    version,
    author: APP_AUTHOR,
    repoUrl: REPO_URL,
    releasesUrl: RELEASES_URL,
    latestVersion: latest,
    latestChangelog: c.changelog,
    updateAvailable: latest !== null && isNewer(latest, version),
    checkedAt: c.checkedAt,
    checkError: c.error,
  };
}
