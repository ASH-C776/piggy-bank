import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

let nextId = 1;

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);

  function push(type: Toast['type'], message: string, duration = 3500) {
    const id = nextId++;
    toasts.value.push({ id, type, message });
    setTimeout(() => dismiss(id), duration);
  }
  function success(msg: string) { push('success', msg); }
  function error(msg: string) { push('error', msg); }
  function info(msg: string) { push('info', msg); }
  function warning(msg: string) { push('warning', msg); }
  function dismiss(id: number) {
    const idx = toasts.value.findIndex((t) => t.id === id);
    if (idx >= 0) toasts.value.splice(idx, 1);
  }

  return { toasts, success, error, info, warning, dismiss };
});
