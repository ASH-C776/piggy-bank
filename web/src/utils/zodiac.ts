export interface Zodiac {
  key: string;
  name: string;
  emoji: string;
  color: string;
}

export const ZODIACS: Zodiac[] = [
  { key: 'rat',      name: '小鼠', emoji: '🐭', color: '#c9a0dc' },
  { key: 'ox',       name: '小牛', emoji: '🐮', color: '#d2b48c' },
  { key: 'tiger',    name: '小虎', emoji: '🐯', color: '#ffb347' },
  { key: 'rabbit',   name: '小兔', emoji: '🐰', color: '#ffc8dd' },
  { key: 'dragon',   name: '小龙', emoji: '🐲', color: '#7ed4b9' },
  { key: 'snake',    name: '小蛇', emoji: '🐍', color: '#a3d9a5' },
  { key: 'horse',    name: '小马', emoji: '🐴', color: '#deb887' },
  { key: 'goat',     name: '小羊', emoji: '🐑', color: '#fef0c1' },
  { key: 'monkey',   name: '小猴', emoji: '🐵', color: '#ffd166' },
  { key: 'rooster',  name: '小鸡', emoji: '🐤', color: '#ff9bb0' },
  { key: 'dog',      name: '小狗', emoji: '🐶', color: '#b5a6c9' },
  { key: 'pig',      name: '小猪', emoji: '🐷', color: '#ffb6c1' },
];

export function getZodiac(key: string | undefined): Zodiac {
  return ZODIACS.find((z) => z.key === key) ?? ZODIACS[4];
}
