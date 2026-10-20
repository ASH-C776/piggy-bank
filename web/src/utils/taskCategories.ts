/** 任务分类固定集（与后端 adhoc-tasks 的 zod enum 保持一致） */
export const TASK_CATEGORIES = ['学习', '生活', '运动', '兴趣', '其他'] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const CATEGORY_EMOJI: Record<TaskCategory, string> = {
  学习: '📚',
  生活: '🏠',
  运动: '⚽',
  兴趣: '🎨',
  其他: '📌',
};

export function categoryEmoji(cat: string | null | undefined): string {
  return CATEGORY_EMOJI[(cat as TaskCategory) ?? '其他'] ?? '📌';
}
