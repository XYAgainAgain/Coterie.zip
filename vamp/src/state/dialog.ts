import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface PromptOptions {
  title?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmRequest {
  kind: 'confirm';
  message: ComponentChildren;
  opts: ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface PromptRequest {
  kind: 'prompt';
  message: ComponentChildren;
  opts: PromptOptions;
  resolve: (value: string | null) => void;
}

export type DialogRequest = ConfirmRequest | PromptRequest;

export const activeDialog = signal<DialogRequest | null>(null);

/* A new request cancel-resolves any still-open one so its promise can't dangle. */
function supersede() {
  const open = activeDialog.value;
  if (!open) return;
  if (open.kind === 'confirm') open.resolve(false);
  else open.resolve(null);
}

/* Themed replacement for window.confirm(). Resolves true on confirm, false on cancel/dismiss. */
export function vampConfirm(message: ComponentChildren, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise(resolve => {
    supersede();
    activeDialog.value = { kind: 'confirm', message, opts, resolve };
  });
}

/* Themed replacement for window.prompt(). Resolves the entered string, or null on cancel/dismiss. */
export function vampPrompt(message: ComponentChildren, opts: PromptOptions = {}): Promise<string | null> {
  return new Promise(resolve => {
    supersede();
    activeDialog.value = { kind: 'prompt', message, opts, resolve };
  });
}

/* Resolve the open request and tear it down. Called by VampDialog. */
export function closeDialog(value: boolean | string | null) {
  const open = activeDialog.value;
  if (!open) return;
  activeDialog.value = null;
  if (open.kind === 'confirm') open.resolve(value as boolean);
  else open.resolve(value as string | null);
}
