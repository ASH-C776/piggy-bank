import { onBeforeUnmount, watchEffect, type Ref } from 'vue';

/**
 * 对话框行为统一入口：Esc 关闭、焦点陷阱、焦点归还、滚动锁。
 *
 * 为什么要抽出来而不是每个弹窗各写一套：
 *
 * 1. **本项目存在真实嵌套** —— 账号管理 Modal 内套「编辑小朋友」Modal，
 *    任意 Modal 内还可嵌 ConfirmDialog。若每个对话框各自监听键盘，按一次 Esc
 *    会把背景里所有层一起关掉；焦点陷阱则会把 Tab 锁死在底层面板，
 *    用户根本够不到最上面的按钮。故用 stack 保证**只有最上层**响应。
 *
 * 2. **滚动锁必须引用计数**。旧实现直接 `body.style.overflow = open ? 'hidden' : ''`，
 *    于是「打开账号管理 → 打开编辑小朋友 → 关闭编辑小朋友」会把 overflow 还原成
 *    auto，而外层弹窗还开着，背景页面能滚动了。
 */

/** 全局打开栈，栈顶即最上层对话框 */
const stack: symbol[] = [];

/** 滚动锁引用计数：只有归零时才真正还原 overflow */
let scrollLocks = 0;
let savedOverflow = '';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** 面板内的可聚焦元素，排除不可见者（折叠面板里的隐藏输入、display:none 的分支） */
function focusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

function lockScroll() {
  if (scrollLocks === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks++;
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = savedOverflow;
}

export interface UseDialogOptions {
  /** 弹窗是否打开（通常来自 v-model） */
  open: Ref<boolean>;
  /** 面板根元素，必须带 tabindex="-1" 才能作为焦点兜底 */
  panel: Ref<HTMLElement | null>;
  /** 请求关闭（把 v-model 置 false） */
  close: () => void;
  /** 返回 false 可拦截本次 Esc —— 例如保存中不允许关闭 */
  canClose?: () => boolean;
  /** 打开时的初始焦点选择器；缺省用面板内第一个可聚焦元素 */
  initialFocus?: string;
}

export function useDialog(opts: UseDialogOptions) {
  const id = Symbol('dialog');
  /** 打开时把焦点从哪来记下来，关闭后还回去 */
  let restoreTo: HTMLElement | null = null;
  let active = false;

  /** 只有最上层对话框才处理键盘事件 */
  const isTop = () => stack[stack.length - 1] === id;

  function onKeydown(e: KeyboardEvent) {
    if (!isTop()) return;
    const panel = opts.panel.value;
    if (!panel) return;

    if (e.key === 'Escape') {
      if (opts.canClose && !opts.canClose()) return;
      e.preventDefault();
      e.stopPropagation();
      opts.close();
      return;
    }

    if (e.key !== 'Tab') return;

    const items = focusable(panel);
    if (!items.length) {
      // 面板内没有可聚焦元素时，焦点也要留在面板上而不是跑到背后的页面
      e.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const cur = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // 焦点已在面板外（或刚打开还没进来）——直接拉到边界，形成闭环
    if (!cur || !panel.contains(cur)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }
    if (e.shiftKey && cur === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && cur === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function activate() {
    if (active) return;
    active = true;
    stack.push(id);
    restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockScroll();
    // 捕获阶段监听：抢在页面其他按键处理之前，且不受子元素 stopPropagation 影响
    document.addEventListener('keydown', onKeydown, true);
    // 等 DOM 插入、Transition 起始帧之后再聚焦，否则部分框架下 focus 会被忽略
    requestAnimationFrame(() => {
      if (!active) return;
      const panel = opts.panel.value;
      if (!panel) return;
      const target =
        (opts.initialFocus ? panel.querySelector<HTMLElement>(opts.initialFocus) : null) ||
        focusable(panel)[0] ||
        panel;
      target.focus({ preventScroll: true });
    });
  }

  function deactivate() {
    if (!active) return;
    active = false;
    const i = stack.indexOf(id);
    if (i >= 0) stack.splice(i, 1);
    document.removeEventListener('keydown', onKeydown, true);
    unlockScroll();
    // 焦点归还触发元素，键盘用户才能接着往下操作；元素若已被移除就不强求
    if (restoreTo && document.contains(restoreTo)) restoreTo.focus({ preventScroll: true });
    restoreTo = null;
  }

  // flush: 'post' 很关键 —— 面板 ref 是在 DOM patch 之后才被赋值的，
  // 默认的 pre 阶段读到的是 null，会导致「打开了却不算激活」。
  watchEffect(
    () => {
      const shouldOpen = opts.open.value && !!opts.panel.value;
      if (shouldOpen === active) return;
      if (shouldOpen) activate();
      else deactivate();
    },
    { flush: 'post' },
  );

  onBeforeUnmount(deactivate);

  return { isTop };
}
