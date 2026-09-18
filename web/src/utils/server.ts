// 服务器连接配置：用于移动端 App 指定后端地址/端口/协议。
// Web 部署时地址留空，走同源相对路径（向后兼容，导航栏无需改动）。

export interface ServerConfig {
  useHttps: boolean;
  host: string;
  port: string;
}

const KEY = 'mj_server';
const DEFAULTS: ServerConfig = { useHttps: false, host: '', port: '' };

export function loadServerConfig(): ServerConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const r = JSON.parse(raw);
      if (r && typeof r === 'object') {
        return { ...DEFAULTS, ...r };
      }
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveServerConfig(c: ServerConfig) {
  localStorage.setItem(KEY, JSON.stringify(c));
}

export function hasServerConfig(c: ServerConfig): boolean {
  return c.host.trim().length > 0;
}

/** 服务器 origin，如 http://192.168.1.5:3000；未配置时返回空串（表示使用当前页面同源） */
export function serverBaseOrigin(): string {
  const c = loadServerConfig();
  if (!hasServerConfig(c)) return '';
  const proto = c.useHttps ? 'https' : 'http';
  return `${proto}://${c.host.trim()}${c.port.trim() ? ':' + c.port.trim() : ''}`;
}