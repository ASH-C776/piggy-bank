/**
 * 服务端本地日期工具。
 *
 * 为什么不能用 new Date().toISOString().slice(0, 10)：
 * toISOString() 输出的是 UTC 日期，而部署环境（docker-compose 已设 TZ=Asia/Shanghai）
 * 按本地时间生活。UTC+8 的 00:00–08:00，UTC 仍是前一天，会导致：
 *   · 每日限额（daily_completions.date）错记到昨天；
 *   · 家长总览 / 孩子首页的「今日」统计窗口从前一天零点起算。
 * 这里统一用服务器本地时区拼 YYYY-MM-DD，与容器 TZ 保持一致。
 */

/** 本地时区的 YYYY-MM-DD */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 本地自然日 [start, end) 的 unix 秒区间（end 为次日零点，半开区间） */
export function localDayRange(d: Date = new Date()): { start: number; end: number } {
  const start = Math.floor(new Date(localDateStr(d) + 'T00:00:00').getTime() / 1000);
  return { start, end: start + 86400 };
}

/** 把外部传入的 YYYY-MM-DD 解析成本地自然日 [start, end)；非法格式返回 null */
export function dateStrToRange(dateStr: string | undefined | null): { start: number; end: number } | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const start = Math.floor(new Date(`${dateStr}T00:00:00`).getTime() / 1000);
  if (Number.isNaN(start)) return null;
  return { start, end: start + 86400 };
}
