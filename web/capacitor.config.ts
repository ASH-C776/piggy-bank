import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.piggybank.app',
  appName: 'Piggy Bank',
  webDir: 'dist',
  server: {
    // 内网后端走明文 HTTP：App 页面也用 http://localhost 加载，
    // 避免从 https 页面请求 http 被当作混合内容(mixed content)拦截。
    // 注意必须放在 server.androidScheme（顶层 androidScheme 不会被读取）
    androidScheme: 'http'
  }
};

export default config;
