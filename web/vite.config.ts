import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // 相对 base（'./'）：这是让同一份产物同时服务三种入口的关键。
  //   局域网直连        http://<ip>:3000/
  //   飞牛统一网关      https://<飞牛域名>/app/com.piggybank.app/
  //   APK（Capacitor）  http://localhost/
  // 三者的「挂载路径」都不同，浏览器只有拿到相对 URL 才能自己算对。
  // 用绝对 base（'/'）会让网关模式下 /assets/*.js 打到飞牛站点根目录而 404；
  // 用写死的 '/app/com.piggybank.app/' 则会把 APK 与局域网直连一起弄坏。
  // 前提：文档 URL 必须以 / 结尾，否则 ./x 会解析到上一级 —— 服务端对裸前缀做了 302 补斜杠。
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});
