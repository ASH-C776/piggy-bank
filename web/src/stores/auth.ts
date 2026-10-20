import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api/client';

export interface AuthUser {
  id: number;
  name: string;
  role: 'parent' | 'child';
  avatar?: string;
  totalPoints?: number;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('mj_token'));
  const user = ref<AuthUser | null>(
    JSON.parse(localStorage.getItem('mj_user') || 'null')
  );

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  function setAuth(t: string, u: AuthUser) {
    token.value = t;
    user.value = u;
    localStorage.setItem('mj_token', t);
    localStorage.setItem('mj_user', JSON.stringify(u));
  }

  async function parentLogin(username: string, password: string) {
    const data = await api.post<{ token: string; user: AuthUser }>(
      '/auth/parent-login',
      { username, password }
    );
    setAuth(data.token, data.user);
  }

  async function childLogin(userId: number, pin: string) {
    const data = await api.post<{ token: string; user: AuthUser }>(
      '/auth/child-login',
      { userId, pin }
    );
    setAuth(data.token, data.user);
  }

  async function fetchChildren() {
    return api.get<{ children: Array<{ id: number; name: string; avatar: string }> }>(
      '/auth/children'
    );
  }

  async function refreshMe() {
    const data = await api.get<{ user: AuthUser }>('/auth/me');
    if (data.user) user.value = data.user;
    return data.user;
  }

  // 家长更新自身资料（头像/账号/密码），成功后同步本地 user
  async function updateMe(payload: { avatar?: string; name?: string; password?: string }) {
    const data = await api.patch<{ user: AuthUser }>('/auth/me', payload);
    if (data.user) {
      user.value = data.user;
      localStorage.setItem('mj_user', JSON.stringify(data.user));
    }
    return data.user;
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('mj_token');
    localStorage.removeItem('mj_user');
  }

  // 更新本地 user（用于小孩端设置后同步）
  function setUser(u: AuthUser) {
    user.value = u;
    localStorage.setItem('mj_user', JSON.stringify(u));
  }

  return {
    token,
    user,
    isAuthenticated,
    parentLogin,
    childLogin,
    fetchChildren,
    refreshMe,
    updateMe,
    setUser,
    logout,
  };
});
