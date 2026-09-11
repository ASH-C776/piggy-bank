import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  // 使用 hash 路由：在 Capacitor/WebView 内不依赖服务端路径回退，
  // 避免登录后 history 跳转失效停在登录页的问题
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/Login.vue') },
    // 家长端
    {
      path: '/parent',
      component: () => import('@/views/parent/Layout.vue'),
      meta: { role: 'parent' },
      children: [
        { path: '', name: 'parent-dashboard', component: () => import('@/views/parent/Dashboard.vue') },
        { path: 'tasks', name: 'parent-tasks', component: () => import('@/views/parent/Tasks.vue') },
        { path: 'points', name: 'parent-points', component: () => import('@/views/parent/Points.vue') },
        { path: 'shop', name: 'parent-shop', component: () => import('@/views/parent/Shop.vue') },
        { path: 'review', name: 'parent-review', component: () => import('@/views/parent/Review.vue') },
        { path: 'logs', name: 'parent-logs', component: () => import('@/views/parent/Logs.vue') },
      ],
    },
    // 小孩端
    {
      path: '/child',
      component: () => import('@/views/child/Layout.vue'),
      meta: { role: 'child' },
      children: [
        { path: '', name: 'child-home', component: () => import('@/views/child/Home.vue') },
        { path: 'tasks', name: 'child-tasks', component: () => import('@/views/child/Tasks.vue') },
        { path: 'shop', name: 'child-shop', component: () => import('@/views/child/Shop.vue') },
      ],
    },
    { path: '/', redirect: '/login' },
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  const role = to.meta.role as 'parent' | 'child' | undefined;
  if (role && !auth.isAuthenticated) {
    return { name: 'login' };
  }
  if (role && auth.user?.role && role !== auth.user.role) {
    return { name: auth.user.role === 'parent' ? 'parent-dashboard' : 'child-home' };
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: auth.user!.role === 'parent' ? 'parent-dashboard' : 'child-home' };
  }
});

export default router;
