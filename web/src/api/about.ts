import { api } from './client';

export interface AboutInfo {
  name: string;
  version: string;
  author: string;
  repoUrl: string;
  releasesUrl: string;
  latestVersion: string | null;
  /** 远程 manifest 的 changelog 原文（含 <br> 与 · 前缀） */
  latestChangelog: string | null;
  updateAvailable: boolean;
  checkedAt: number | null;
  checkError: string | null;
}

/**
 * force=true 绕过服务端 30 分钟缓存立即重查（用户手动点「检查更新」时用）；
 * 弹窗自动打开时不传，命中缓存不会反复打外网。
 */
export function getAbout(force = false): Promise<AboutInfo> {
  return api.get<AboutInfo>(`/about${force ? '?force=1' : ''}`);
}
