import { useAuthStore } from '@/stores/auth';
import { serverBaseOrigin } from '@/utils/server';

// 动态 base：
//   · 配置了服务器地址（APK 指向远端）→ 绝对地址，走配置的 origin；
//   · 否则用 './api' 这种**相对**路径，让浏览器按当前文档 URL 解析。
//     这一步是「飞牛统一网关」能用的前提：应用可能挂在 /app/com.piggybank.app/ 下，
//     写死 '/api' 会打到飞牛站点根目录（不是我们的应用），必然 404。
//     相对路径下：/app/com.piggybank.app/ → /app/com.piggybank.app/api，
//                局域网根路径 '/'      → /api，
//                APK 的 http://localhost/ → http://localhost/api，三者都对。
function getBase(): string {
  const origin = serverBaseOrigin();
  return origin ? `${origin}/api` : './api';
}

export async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const auth = useAuthStore();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (auth.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }

  const res = await fetch(`${getBase()}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    auth.logout();
    throw new Error('未登录或登录已过期');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as any).message || `请求失败 (${res.status})`) as Error & { status?: number; payload?: any };
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>(p),
  post: <T = any>(p: string, body?: unknown) =>
    request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T = any>(p: string, body?: unknown) =>
    request<T>(p, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T = any>(p: string, body?: unknown) =>
    request<T>(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T = any>(p: string) => request<T>(p, { method: 'DELETE' }),
};
