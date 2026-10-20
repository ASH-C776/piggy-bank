/**
 * 时间格式化统一收口。
 * 此前 fmtTime / fmtDeadline 在 7 个页面各自抄了一份，阈值与文案略有出入，
 * 改一处要改七处，容易漂移。这里只保留两个纯函数，页面直接调用。
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * 相对时间：刚刚 / n分钟前 / n小时前 / 今天 HH:mm / 日期。
 * - compact：日期用 M/D（紧凑列表），默认 M月D日；
 * - withTime：日期后是否带 HH:mm（流水等需要看时刻的场景）。
 */
export function fmtRelativeTime(
  ts: number | null | undefined,
  opts: { compact?: boolean; withTime?: boolean } = {}
): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;

  if (d.toDateString() === now.toDateString()) return `今天 ${hhmm}`;
  const date = opts.compact
    ? `${d.getMonth() + 1}/${d.getDate()}`
    : `${d.getMonth() + 1}月${d.getDate()}日`;
  return opts.withTime ? `${date} ${hhmm}` : date;
}

/** 任务截止时间：无截止 / 已超时 n小时 / 今日 HH:mm / M/D HH:mm */
export function fmtDeadline(ts: number | null | undefined): string {
  if (!ts) return '无截止';
  const d = new Date(ts * 1000);
  const diff = ts * 1000 - Date.now();
  if (diff < 0) return `已超时 ${Math.abs(Math.floor(diff / 3_600_000))}小时`;
  if (diff < 86_400_000) return `今日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
