import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { serverBaseOrigin } from '@/utils/server';

// 审核待办徽标计数
const pendingCount = ref(0);

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

    // 配置了服务器地址时按配置走（App 内网），否则使用当前页面同源（Web 部署）
    const origin = serverBaseOrigin();
    const proto = origin?.startsWith('https') ? 'wss' : 'ws';
    const host = origin ? new URL(origin).host : location.host;
    const url = `${proto}://${host}/ws?userId=${auth.user.id}&role=${auth.user.role}`;
    manualClose = false;
    ws = new WebSocket(url);

    ws.onopen = () => {
      connected.value = true;
      startHeartbeat();
      // 家长端拉取一次待审核数量作为初始徽标
      if (auth.user!.role === 'parent') refreshPendingCount();
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
    pendingCount.value = 0;
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

    // 家长端：新兑换申请
    if (msg.type === 'new_exchange_request' && auth.user?.role === 'parent') {
      pendingCount.value++;
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

    // 家长端：小孩接受全员任务
    if (msg.type === 'task_accepted' && auth.user?.role === 'parent') {
      toast.info(`🤝 ${msg.userName} 接受了任务`);
      window.dispatchEvent(new CustomEvent('ws:task_accepted', { detail: msg }));
    }

    // 家长端：小孩提交任务完成申请
    if (msg.type === 'task_completion_submitted' && auth.user?.role === 'parent') {
      toast.info(`📤 ${msg.userName} 提交了「${msg.taskName}」完成申请，待审核`);
      window.dispatchEvent(new CustomEvent('ws:task_completion_submitted', { detail: msg }));
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

  async function refreshPendingCount() {
    try {
      const { api } = await import('@/api/client');
      const r = await api.get<{ requests: any[] }>('/exchange-requests?status=pending');
      pendingCount.value = r.requests.length;
    } catch { /* ignore */ }
  }

  function decPending() {
    if (pendingCount.value > 0) pendingCount.value--;
  }

  return {
    connected,
    pendingCount: computed(() => pendingCount.value),
    connect,
    disconnect,
    refreshPendingCount,
    decPending,
  };
}
