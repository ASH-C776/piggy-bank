import { useAuthStore } from '@/stores/auth';
import { serverBaseOrigin } from '@/utils/server';

// 与 api/client.ts 保持同一套 base 推导逻辑：配置了远端地址走绝对路径，
// 否则用相对路径（飞牛网关 /app/xxx/ 与 APK http://localhost/ 都能正确解析）。
function getBase(): string {
  const origin = serverBaseOrigin();
  return origin ? `${origin}/api` : './api';
}

export interface BackupFileInfo {
  name: string;
  size: number;
  createdAt: number;
  source: 'manual' | 'auto' | 'pre-restore';
}

export interface BackupSettings {
  autoEnabled: boolean;
  autoTime: string;
  keep: number;
}

export interface BackupStatus {
  lastBackupAt: number | null;
  lastAutoBackupAt: number | null;
  count: number;
  totalSize: number;
}

/**
 * 下载备份文件。不能走 api client——那个会把响应当 JSON 解析。
 * token 放 Authorization header 而不是 URL query：query 会进浏览器历史、
 * 反代访问日志和 Referer，等于把令牌散播出去。
 */
export async function downloadBackup(name: string): Promise<void> {
  const auth = useAuthStore();
  const res = await fetch(`${getBase()}/backups/download/${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${auth.token ?? ''}` },
  });
  if (!res.ok) throw new Error(`下载失败 (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** ArrayBuffer → base64（分块拼接，避免大文件 spread 打爆调用栈） */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
