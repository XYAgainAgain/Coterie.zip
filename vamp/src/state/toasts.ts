import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';

export type ToastType = 'error' | 'warning' | 'info' | 'success';

export interface Toast {
  id: number;
  message: ComponentChildren;
  type: ToastType;
  title?: string;
  duration?: number;
  bg?: string;
  border?: string;
  isRoll?: boolean;
}

export const toasts = signal<Toast[]>([]);

let nextToastId = 1;
const DISMISS_MS = 8_000;
const MAX_ROLL_TOASTS = 5;

export function showToast(message: ComponentChildren, type: 'error' | 'warning' = 'error') {
  const id = nextToastId++;
  toasts.value = [...toasts.value, { id, message, type }];
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, DISMISS_MS);
}

export function dismissToast(id: number) {
  toasts.value = toasts.value.filter(t => t.id !== id);
}

export function forceToast(message: ComponentChildren, type: ToastType = 'info', title?: string, opts?: {
  duration?: number;
  bg?: string;
  border?: string;
  isRoll?: boolean;
}) {
  const id = nextToastId++;
  const duration = opts?.duration ?? DISMISS_MS;
  const toast: Toast = { id, message, type, title, ...opts, duration };

  let list = [...toasts.value, toast];

  if (opts?.isRoll) {
    const rollToasts = list.filter(t => t.isRoll);
    if (rollToasts.length > MAX_ROLL_TOASTS) {
      const evictId = rollToasts[0].id;
      list = list.filter(t => t.id !== evictId);
    }
  }

  toasts.value = list;
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, duration);
}
