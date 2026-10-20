import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { serverBaseOrigin } from '@/utils/server';

// 这里**故意不再维护**一份"待审核数量"。
// R3 之前本文件有一个模块级 pendingCount（由 refreshPendingCount 初始化、
// new_exchange_request 自增、decPending 自减），但它只数兑换、而且全项目没有任何地方渲染它 ——
// 真正驱动徽标的一直是 parent/Layout.vue 从 /dashboard 的 pendingReview.total 拉的那份。
// 两份计数并存意味着迟早会显示不一致（一个数兑换一个数全部），所以 R3 把它删掉了，
// 只保留"喊一声去重拉"的事件通道（见下面 handleMessage 里的 window.dispatchEvent）。

let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let heartbeatTimer: number | null = null;
let manualClose = false;

export function useWsStore() {
  const connected = ref(false);

  function connect() {
    const auth = useAuthStore();
    if (!auth.user) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    // 配置了服务器地址时按配置走（APK 指向内网/远端），否则从当前文档推导同源地址。
    // 两点都不能省，否则「页面能开、实时推送永远连不上、每 3s 重连一次」：
    //  · 协议必须跟当前页面走（https → wss）。写死 ws:// 会被浏览器按混合内容拦掉。
    //  · 路径必须相对推导，不能写死 '/ws'：经飞牛统一网关访问时页面在
    //    /app/com.piggybank.app/ 下，'/ws' 会打到网关站点根目录（不是我们的应用）。
    //    new URL('ws', location.href) 会自动带上当前目录前缀，三种入口通用。
    const origin = serverBaseOrigin();
    let url: string;
    const token = encodeURIComponent(auth.token ?? '');
    if (origin) {
      const parsed = new URL(origin);
      const proto = parsed.protocol === 'https:' ? 'wss' : 'ws';
      url = `${proto}://${parsed.host}/ws?token=${token}`;
    } else {
      const u = new URL('ws', location.href);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.search = `?token=${token}`;
      url = u.toString();
    }
    manualClose = false;
    ws = new WebSocket(url);

    ws.onopen = () => {
      connected.value = true;
      startHeartbeat();
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleMessage(msg);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      connected.value = false;
      stopHeartbeat();
      if (!manualClose) scheduleReconnect();
    };

    ws.onerror = () => {
      connected.value = false;
    };
  }

  function disconnect() {
    manualClose = true;
    stopHeartbeat();
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (ws) { ws.close(); ws = null; }
    connected.value = false;
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 3000);
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = window.setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  function handleMessage(msg: any) {
    const toast = useToastStore();
    const auth = useAuthStore();

    if (msg.type === 'pong') return;

    // 全端：家长刚执行了数据恢复。换库后各端内存里的数据全部作废，
    // token_version 也可能变化导致下次请求 401 —— 统一整页刷新最稳妥。
    if (msg.type === 'data_restored') {
      toast.warning('数据已被恢复，页面即将刷新');
      setTimeout(() => window.location.reload(), 1500);
      return;
    }

    // 家长端：新兑换申请
    if (msg.type === 'new_exchange_request' && auth.user?.role === 'parent') {
      const itemText = msg.exchangeType === 'cash'
        ? `现金 ${msg.amount}元`
        : `商品「${msg.productName}」`;
      toast.info(`🔔 ${msg.userName} 申请兑换${itemText}（-${msg.points}分）`);
      window.dispatchEvent(new CustomEvent('ws:new_exchange_request', { detail: msg }));
    }

    // 小孩端：审核结果
    if (msg.type === 'exchange_reviewed' && auth.user?.role === 'child') {
      const itemText = msg.exchangeType === 'cash'
        ? `${msg.amount}元现金`
        : `「${msg.productName}」`;
      if (msg.status === 'approved') {
        toast.success(`✅ 你的${itemText}兑换已通过！剩余 ${msg.newBalance} 分`);
      } else {
        toast.warning(`❌ 你的${itemText}兑换被拒绝${msg.reason ? '：' + msg.reason : ''}`);
      }
      window.dispatchEvent(new CustomEvent('ws:exchange_reviewed', { detail: msg }));
    }

    // 家长端：小孩提交任务完成申请
    if (msg.type === 'task_completion_submitted' && auth.user?.role === 'parent') {
      toast.info(`📤 ${msg.userName} 提交了「${msg.taskName}」完成申请，待审核`);
      window.dispatchEvent(new CustomEvent('ws:task_completion_submitted', { detail: msg }));
    }

    // 小孩端：家长录入了新的身高体重
    if (msg.type === 'growth_recorded' && auth.user?.role === 'child') {
      const grow = Number(msg.growCm ?? 0);
      if (grow > 0) {
        const bonus = msg.awarded > 0 ? `　+${msg.awarded} 分 🎉` : '';
        toast.success(`📏 你长高啦 +${grow.toFixed(1)}cm！${bonus}`);
      } else {
        toast.info('📏 爸爸妈妈更新了你的成长记录');
      }
      window.dispatchEvent(new CustomEvent('ws:growth_recorded', { detail: msg }));
    }

    // 小孩端：任务审核结果
    if (msg.type === 'task_review' && auth.user?.role === 'child') {
      if (msg.status === 'approved') {
        toast.success(`✅ 任务审核通过！+${msg.points} 分`);
      } else {
        toast.warning(`❌ 任务被拒绝${msg.reason ? '：' + msg.reason : ''}，可重新提交`);
      }
      window.dispatchEvent(new CustomEvent('ws:task_review', { detail: msg }));
    }
  }

  return {
    connected,
    connect,
    disconnect,
  };
}
