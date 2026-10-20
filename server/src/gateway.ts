/**
 * 飞牛 fnOS「统一网关」接入
 * ---------------------------------------------------------------------------
 * 背景：飞牛桌面点应用图标时，入口配置（app/ui/config）如果是「端口直连」模式
 *   （protocol + port），打开的是 `{protocol}://{当前浏览器 hostname}:{port}{url}`。
 *   局域网里没问题，但经 FN Connect / 域名远程访问时，页面是 HTTPS、hostname 是
 *   飞牛的中转域名，而 3000 端口在公网上根本不存在 —— 结果就是远程打不开。
 *
 * 官方给的解法是「统一网关」：应用在 app/ui/config 里声明
 *   gatewayPrefix（公开路径，如 /app/com.piggybank.app）
 *   gatewaySocket（应用自己监听的 unix socket，放在 TRIM_APPDEST 下）
 * 飞牛会在系统域名下把 /app/<appname>/** 的请求（含 WebSocket）校验登录态后
 * 转发到该 socket，于是局域网、FN Connect 远程、域名访问用同一个地址，全部可用。
 *
 * 官方文档明确说明 **Docker 应用也可以使用统一网关**：把 ${TRIM_APPDEST} 挂载进容器，
 * 让容器内的服务在该目录下创建 socket 即可 —— 也就是本文件做的事。
 *
 * 两个实现要点：
 *   1. 网关转发时**不剥前缀**（官方示例请求仍是 GET /app/myapp/list），
 *      所以应用侧要自己剥，才能用一套根路径路由同时服务两种入口。
 *   2. socket 上只需要做**纯 TCP 透传**：HTTP 与 WebSocket 在传输层是同一种东西，
 *      直接 pipe 就能两者通吃，不必解析协议。
 *
 * 参考：https://developer.fnnas.com/docs/core-concepts/gateway-registration/
 */
import { createServer, connect } from 'node:net';
import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 规整网关公开路径：补上开头的 /、去掉结尾的 /。
 * 之所以剥尾斜杠，是因为后续判断统一按 `prefix + '/'` 做前缀匹配。
 * 未配置时返回空串（表示不启用网关模式）。
 */
export function normalizeGatewayPrefix(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return '';
  const withLeading = v.startsWith('/') ? v : `/${v}`;
  return withLeading.replace(/\/+$/, '');
}

/**
 * 把网关公开路径还原成应用内部路径：
 *   /app/com.piggybank.app/api/children  ->  /api/children
 *   /app/com.piggybank.app/ws?userId=1   ->  /ws?userId=1
 *   /app/com.piggybank.app               ->  /
 * 未配置前缀、或路径不以该前缀开头时原样返回（局域网直连走的就是这条）。
 */
export function stripGatewayPrefix(url: string, prefix: string): string {
  if (!prefix) return url;
  if (url === prefix) return '/';
  if (url.startsWith(`${prefix}/`)) return url.slice(prefix.length);
  return url;
}

/**
 * 判断是不是「裸前缀」（只有前缀、没有结尾斜杠）。
 * 前端产物一律用相对路径（vite base: './'），文档 URL 必须以 / 结尾，
 * 否则 ./assets/x.js 会被解析到上一级目录 —— 所以这种情况要补一次跳转。
 * 查询串不参与判断（`/app/xxx?a=1` 同样按裸前缀处理）。
 */
export function isBareGatewayPrefix(url: string, prefix: string): boolean {
  if (!prefix) return false;
  return url.split('?')[0] === prefix;
}

/**
 * 在 unix socket 上起一个纯 TCP 透传代理，指向本进程自己的 HTTP 端口。
 *
 * 为什么用透传而不是 HTTP 代理：
 *   - WebSocket 的 Upgrade 握手也是普通 HTTP 请求，透传天然支持；
 *   - 不解析/重组报文，就没有 body 大小、chunked、keep-alive 这些坑；
 *   - 飞牛网关侧的 Host / X-Trim-* 等头原封不动到达应用，便于后续接入飞牛身份。
 *
 * socket 权限放宽到 0666：飞牛网关以系统身份连接，而 socket 由容器内的 root
 * 创建，不放开连接方会被拒。文件本身位于应用安装目录内，不对外暴露。
 */
export function startGatewaySocket(socketPath: string, upstreamPort: number): void {
  mkdirSync(dirname(socketPath), { recursive: true });
  // 上一次进程异常退出可能残留同名 socket 文件，直接监听会 EADDRINUSE
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
    } catch {
      /* 删不掉就让 listen 去报错，别吞掉真实原因 */
    }
  }

  const server = createServer((client) => {
    const upstream = connect(upstreamPort, '127.0.0.1');
    client.pipe(upstream);
    upstream.pipe(client);
    // 任意一端出错都要把另一端也收掉，否则半开连接会一直挂着
    const teardown = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', teardown);
    upstream.on('error', teardown);
  });

  server.listen(socketPath, () => {
    try {
      chmodSync(socketPath, 0o666);
    } catch {
      /* 权限设置失败不致命，交给实际连接结果说话 */
    }
    console.log(`🔌 飞牛统一网关 socket 已就绪：${socketPath}（透传到 127.0.0.1:${upstreamPort}）`);
  });

  server.on('error', (err) => {
    // 网关不可用不该拖垮应用：局域网直连（TCP 端口）仍然照常服务
    console.error('⚠️ 飞牛统一网关 socket 启动失败：', err);
  });
}
