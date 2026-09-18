export interface ProductCategory {
  key: string;
  label: string;
  color: string;
}

// 8 个分类，选择器里排两行（每行 4 个）
export const PRODUCT_CATEGORIES: ProductCategory[] = [
  { key: 'snack', label: '零食', color: '#ff9bb0' },
  { key: 'toy', label: '玩具', color: '#84c5ff' },
  { key: 'activity', label: '活动', color: '#ffb454' },
  { key: 'game', label: '游戏', color: '#7ed4b9' },
  { key: 'study', label: '学习', color: '#b39ddb' },
  { key: 'privilege', label: '特权', color: '#ffd166' },
  { key: 'food', label: '美食', color: '#ffab91' },
  { key: 'gift', label: '其他', color: '#e8b4c8' },
];

export function getCategory(key?: string | null): ProductCategory {
  return PRODUCT_CATEGORIES.find((c) => c.key === key) ?? PRODUCT_CATEGORIES[PRODUCT_CATEGORIES.length - 1];
}
