<script lang="ts">
/**
 * 底部导航用的图标名。
 * 用独立的 <script>（非 setup）导出，是为了让两端 Layout 能把 navItems 里的
 * icon 字段声明成这个联合类型 —— 图标名写错时编译期就报错，而不是渲染成一个空白。
 */
export type NavIconName =
  | 'home'
  | 'tasks'
  | 'points'
  | 'log'
  | 'growth'
  | 'shop'
  | 'review'
  // 头像菜单用的功能图标（两端 Layout 的 .mi-icon），和底部导航同一套画法，
  // 替换掉原来的 ⚙️/💾/👋 emoji —— emoji 各系统长相不一且改不动颜色。
  | 'settings'
  | 'backup'
  | 'about'
  | 'logout';
</script>

<script setup lang="ts">
/**
 * 底部导航图标（单色 SVG，跟随 currentColor）
 *
 * 为什么要把 emoji 换掉：B2 把选中态做成了「深色加粗文字 + 黄色指示条」，
 * 但 emoji 是彩色位图、**color 改不动它** —— 于是图标在选中/未选中之间完全没有
 * 变化，「我现在在哪一页」只能靠一行小字和一根 3px 细条，线索极弱。
 * 换成 stroke="currentColor" 的 SVG 后，图标会自动跟随 .tab / .tab.active 的 color，
 * 状态一眼可辨；顺带解决 emoji 在不同系统上长相不一的问题。
 *
 * 描边式（而非填充式）是刻意的：填充图标在 22px 下容易糊成一团，
 * 本项目底色是浅粉玻璃，细描边更清爽，也和现有线性 UI 一致。
 */
defineProps<{ name: NavIconName }>();
</script>

<template>
  <svg
    class="nav-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <!-- 主页 -->
    <template v-if="name === 'home'">
      <path d="M3.6 10.9 12 3.8l8.4 7.1" />
      <path d="M6.1 9.6V19a1.3 1.3 0 0 0 1.3 1.3h9.2A1.3 1.3 0 0 0 17.9 19V9.6" />
      <path d="M9.9 20.3v-4.6a1 1 0 0 1 1-1h2.2a1 1 0 0 1 1 1v4.6" />
    </template>

    <!-- 任务：一页带折角的清单 -->
    <template v-else-if="name === 'tasks'">
      <path d="M14 3.6H7A2 2 0 0 0 5 5.6v12.8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.6z" />
      <path d="M14 3.6v5h5" />
      <path d="M8.6 12.6h6.8M8.6 16.2h4.4" />
    </template>

    <!-- 积分：五角星 -->
    <template v-else-if="name === 'points'">
      <path d="M12 3.4 14.29 8.85 20.18 9.34 15.71 13.2 17.05 18.96 12 15.9 6.95 18.96 8.29 13.2 3.82 9.34 9.71 8.85Z" />
    </template>

    <!-- 成长：上扬的折线 + 箭头（比「尺子」更能表达"在长高"） -->
    <template v-else-if="name === 'growth'">
      <path d="M3.6 19.6h16.8" />
      <path d="M6.2 16.3 10.4 10.7 13.6 13.7 20 5.5" />
      <path d="M15.5 5.5H20v4.4" />
    </template>

    <!-- 商城：礼盒（盒身 + 盒盖 + 丝带 + 蝴蝶结） -->
    <template v-else-if="name === 'shop'">
      <path d="M3.8 9.3h16.4v9.6a1.6 1.6 0 0 1-1.6 1.6H5.4a1.6 1.6 0 0 1-1.6-1.6z" />
      <path d="M2.7 5.4h18.6v3.9H2.7z" />
      <path d="M12 5.4v15.1" />
      <path d="M12 5.3c-2.3 0-4-.6-4-1.8 0-1.1 1-1.6 2-1.3 1.4.5 2 2.2 2 3.1" />
      <path d="M12 5.3c2.3 0 4-.6 4-1.8 0-1.1-1-1.6-2-1.3-1.4.5-2 2.2-2 3.1" />
    </template>

    <!-- 流水：时钟（历史记录） -->
    <template v-else-if="name === 'log'">
      <circle cx="12" cy="12" r="8.7" />
      <path d="M12 7.6V12l3 1.9" />
    </template>

    <!-- 审核：圆圈打勾 -->
    <template v-else-if="name === 'review'">
      <circle cx="12" cy="12" r="8.7" />
      <path d="m8.2 12.3 2.7 2.7 5-5.5" />
    </template>

    <!-- 设置：齿轮（齿圈 + 中轴） -->
    <template v-else-if="name === 'settings'">
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      />
      <circle cx="12" cy="12" r="3" />
    </template>

    <!-- 备份与恢复：软盘（外壳 + 标签槽 + 写保护口） -->
    <template v-else-if="name === 'backup'">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8V3" />
    </template>

    <!-- 退出登录：房门 + 向外指的箭头 -->
    <template v-else-if="name === 'logout'">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </template>

    <!-- 关于：圆圈里的 i（信息） -->
    <template v-else-if="name === 'about'">
      <circle cx="12" cy="12" r="8.7" />
      <path d="M12 11.2v5" />
      <path d="M12 7.9h.01" />
    </template>
  </svg>
</template>

<style scoped>
/* 用 1em 而不是写死 px：尺寸由父级 .tab .icon 的 font-size token 决定，
   既保证尺寸可统一调整，也不会给「魔法数值」扫描引入新的字面量。 */
.nav-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>
