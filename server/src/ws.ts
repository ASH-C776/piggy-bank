import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { stripGatewayPrefix } from './gateway.js';
import { verifyToken } from './auth.js';

type ClientInfo = {
  ws: WebSocket;
  userId: number;
  role: 'parent' | 'child';
};

const clients = new Map<number, Set<ClientInfo>>();

export let wss: WebSocketServer | null = null;

export function initWs(server: Server, gatewayPrefix = ''): void {
  // 用 noServer + 手动接管 upgrade，而不是 new WebSocketServer({ server, path }):
  //   1) 飞牛统一网关会把 /app/<appname>/ws 原样转发过来，判断路径前必须先剥前缀；
  //   2) 内置的 path 选项只做精确字符串比较，做不了前缀还原。
  // 官方文档也支持网关承载 WebSocket（复用同一 gatewayPrefix 与 socket）。
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const stripped = stripGatewayPrefix(req.url ?? '', gatewayPrefix);
    if (stripped.split('?')[0] !== '/ws') {
      // 非法路径直接断开：交给别人处理等于把这个 socket 悬着不放
      socket.destroy();
      return;
    }
    // 在握手阶段验签：无效 token 直接销毁 socket，不让连接进入 open 状态
    const url = new URL(stripped, 'http://localhost');
    const token = url.searchParams.get('token');
    (async () => {
      const payload = token ? await verifyToken(token) : null;
      if (!payload) {
        socket.destroy();
        return;
      }
      req.url = stripped;
      wss!.handleUpgrade(req, socket, head, (ws) => {
        wss!.emit('connection', ws, req, payload);
      });
    })();
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, payload: { sub: number; role: 'parent' | 'child' }) => {
    // 身份以 JWT 为准，不再信任 query 里自报的 userId/role（否则同网任意连接可冒充接收推送）
    const info: ClientInfo = { ws, userId: payload.sub, role: payload.role };
    if (!clients.has(info.userId)) clients.set(info.userId, new Set());
    clients.get(info.userId)!.add(info);

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        /* ignore */
      }
    });

    ws.on('close', () => {
      clients.get(info.userId)?.delete(info);
      if (clients.get(info.userId)?.size === 0) clients.delete(info.userId);
    });
  });
}

// 推送给指定用户
export function pushToUser(userId: number, message: unknown): void {
  const set = clients.get(userId);
  if (!set) return;
  const payload = JSON.stringify(message);
  for (const c of set) {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(payload);
    }
  }
}

// 推送给所有家长
export function pushToParents(message: unknown): void {
  for (const [userId, set] of clients.entries()) {
    for (const c of set) {
      if (c.role === 'parent' && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(JSON.stringify(message));
      }
    }
    // 仅检查第一个连接的角色即可，但循环里已经做了
  }
}

// 推送给所有在线客户端（数据恢复后让全端刷新，含孩子端）
export function pushToAll(message: unknown): void {
  const payload = JSON.stringify(message);
  for (const set of clients.values()) {
    for (const c of set) {
      if (c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(payload);
      }
    }
  }
}
