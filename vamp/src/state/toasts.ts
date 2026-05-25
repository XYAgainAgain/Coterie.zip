import { signal } from '@preact/signals';

export type ToastType = 'error' | 'warning' | 'info' | 'success';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  hue?: number;
}

export const toasts = signal<Toast[]>([]);

let nextToastId = 1;
const DISMISS_MS = 8_000;

export function showToast(message: string, type: 'error' | 'warning' = 'error') {
  const id = nextToastId++;
  toasts.value = [...toasts.value, { id, message, type }];
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, DISMISS_MS);
}

export function dismissToast(id: number) {
  toasts.value = toasts.value.filter(t => t.id !== id);
}

export function forceToast(message: string, type: ToastType = 'info', hue?: number) {
  const id = nextToastId++;
  toasts.value = [...toasts.value, { id, message, type, hue }];
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, DISMISS_MS);
}
