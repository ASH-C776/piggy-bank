/**
 * 累计积分等级体系（按总积分，与「今日表现」的临时评价标签分开）。
 * 阈值为家庭小工具的可调默认值，后续想调整只改这一张表。
 */
export interface Level {
  name: string;
  emoji: string;
  min: number;
}

export const LEVELS: Level[] = [
  { name: '萌芽新手', emoji: '🌱', min: 0 },
  { name: '小星星', emoji: '⭐', min: 50 },
  { name: '小达人', emoji: '🌟', min: 150 },
  { name: '小能手', emoji: '💪', min: 350 },
  { name: '小学者', emoji: '🎓', min: 700 },
  { name: '传奇之星', emoji: '👑', min: 1200 },
];

export interface LevelInfo {
  current: Level;
  next: Level | null;
  /** 距下一级进度 0~100，满级为 100 */
  progress: number;
  need: number;
}

export function getLevel(points: number): LevelInfo {
  let current = LEVELS[0];
  let next: Level | null = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].min) {
      current = LEVELS[i];
      next = LEVELS[i + 1] ?? null;
    }
  }
  if (!next) return { current, next: null, progress: 100, need: 0 };
  const span = next.min - current.min;
  const progress = Math.min(100, Math.round(((points - current.min) / span) * 100));
  return { current, next, progress, need: next.min - points };
}
