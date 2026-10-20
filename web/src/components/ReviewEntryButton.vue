<script setup lang="ts">
import NavIcon from '@/components/NavIcon.vue';

/**
 * 家长端「审核」入口：右下角浮动按钮。
 *
 * 它取代了原来底部导航的第 6 个 tab —— 审核不是一个"页面"，而是一件**待办**，
 * 放在导航里等于要求家长为了看一眼有没有事要处理而切一次页；右下角浮动按钮则始终
 * 在总览页可见、点开即弹窗，并且能把"N 条待处理"直接写在按钮上。
 *
 * 几何与「账号管理」（.btn / .btn-primary）逐项对齐：padding var(--space-10) var(--space-20)、
 * 圆角 --r-md、字重 600、字号 --fs-md(16px)、gap --space-8。
 *
 * 底色 = **与「总览」排名框完全相同的一套玻璃配方**，直接复用同一组 token
 * （背景 rgba(255,255,255,.8) 半透明白 + 毛玻璃模糊 + 白色细描边，三者都来自
 *  --glass-bg / --glass-blur / --glass-border）。
 * 机缘在于 .btn 基础类本身就是玻璃态（.btn-primary 的浅橙只是覆盖出来的），
 * 所以"跟排名框同底色"与"跟账号管理同形态"其实是同一件事，不必二选一。
 *
 * 为什么不写一个近似的 hex：排名框的底色根本不是固定色值 —— 它是半透明白，
 * 观感色 = 采样背景 → 提饱和 → 叠 80% 白，随所在位置漂移（实测 #fffdfa ~ #fef8f1）。
 * 写死某个 hex 只会在背景或玻璃参数变化时悄悄跑偏；用同一个 token 才是定义上的同色。
 *
 * 两处**刻意偏离** GlassCard / .btn，都有具体原因：
 *   1. 不加 overflow:hidden —— 玻璃卡有它，但本按钮的角标是 top:-6px/right:-6px
 *      溢出边界的，照抄会把角标裁掉。
 *   2. 投影用浮层档 --glass-shadow-float（而非玻璃卡的 --glass-shadow 粉色光晕）：
 *      本按钮悬在滚动内容之上、不是躺在页面里的卡片，需要能真正分层的阴影。
 *
 * 文字：底色是 80% 白，配 --text-primary(#5a3a4a) 约 9.5:1，白字则 1.03:1（不可读），
 * 所以只能深字 —— 与"越亮的底越必须配深字"这条规律一致。
 *
 * 角标：白描边 + 用户指定的 #f75000。白字压 #f75000 是 3.44:1，**低于小字号 4.5 阈值**，
 * 属"指定了具体色值"之后的取舍（计数同时写在按钮 aria-label 里，读屏用户不靠肉眼读），
 * 已在验收脚本里单独登记为一条窄例外。
 */
withDefaults(defineProps<{ count?: number }>(), { count: 0 });

defineEmits<{ click: [] }>();

/** >99 显示 99+：否则三位数会把圆形角标撑成椭圆，反而看不清 */
function badgeText(n: number) {
  return n > 99 ? '99+' : String(n);
}
</script>

<template>
  <button
    type="button"
    class="review-entry"
    :aria-label="count > 0 ? `审核中心，${count} 条待处理` : '审核中心'"
    @click="$emit('click')"
  >
    <NavIcon name="review" />
    <span class="text">审核</span>
    <!-- 数字已在按钮的 aria-label 里读过一遍，这里不重复播报 -->
    <span v-if="count > 0" class="badge" aria-hidden="true">{{ badgeText(count) }}</span>
  </button>
</template>

<style scoped>
/* 几何与「账号管理」(.btn / .btn-primary) 逐项对齐：padding var(--space-10) var(--space-20)、
   圆角 --r-md、字重 600、字号 --fs-md(16px)、gap --space-8；
   底色与「总览」排名框(.glass-card)同源 —— 见文件头说明。
   验收脚本会把这个按钮的计算样式与页面上**真实排名卡**逐项对比来钉住"同底色"。 */
.review-entry {
  position: absolute;
  right: var(--space-20);
  /* bottom:100% = 贴着导航栏上沿，再抬 12px。
     用百分比而不是写死导航栏高度：安全区、字号、标签换行任何一处变化都不用回来改这个数。 */
  bottom: calc(100% + var(--space-12));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-8);
  padding: var(--space-10) var(--space-20);
  border-radius: var(--r-md);
  /* 玻璃三件套：与 .glass-card / .btn 用同一组 token，这就是"同底色"的定义式写法 */
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  color: var(--text-primary);
  font-size: var(--fs-md);
  font-weight: 600;
  /* 浮层档阴影：本按钮悬在滚动内容之上（不是躺在页面里的卡片），
     需要能真正分层的阴影；玻璃卡的 --glass-shadow 是粉色光晕，压在米黄背景上看不见。 */
  box-shadow: var(--glass-shadow-float);
  transition: transform var(--dur-fast), box-shadow var(--dur-fast), background var(--dur-base);
}
/* hover / active 照抄 .btn 的既有行为（含非彩色按钮 hover 换成 --glass-bg-strong）：
   既然底色已经与 .btn 同源，反馈方式也跟着走，不再单独发明。 */
.review-entry:hover {
  transform: translateY(-1px);
  background: var(--glass-bg-strong);
  box-shadow: var(--glass-shadow-hover);
}
.review-entry:active {
  transform: translateY(0) scale(0.96);
}

/* 图标尺寸跟随按钮字号，与底部导航用同一套图标 */
.review-entry :deep(.nav-icon) {
  font-size: var(--fs-lg);
}

.badge {
  position: absolute;
  top: calc(-1 * var(--space-6));
  right: calc(-1 * var(--space-6));
  min-width: 20px;
  height: 20px;
  padding: 0 var(--space-4);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-pill);
  /* 白圈沿用 B7 的做法（把角标从按钮上"抠"出来，微信头像角标同款）；
     底色 #f75000 与数字颜色都由用户指定 —— 白字压它是 3.44:1，低于小字 4.5 阈值，
     属指定色值后的取舍（见文件头注释，验收脚本里单独登记了这条窄例外）。 */
  border: 2px solid #fff;
  background: var(--accent-orange-red);
  color: #fff;
  font-size: var(--fs-2xs);
  font-weight: 700;
  line-height: 1;
}
</style>
