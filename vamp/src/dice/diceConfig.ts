import { signal } from '@preact/signals';
import type { RollMode } from './types';

export const rollMode = signal<RollMode>('standard');

export const SPEED_MULTIPLIERS: Record<RollMode, number> = {
  standard: 1.0,
  fast: 1.5,
  no3d: 1.0,
};

export function getRollSpeed(): number {
  return SPEED_MULTIPLIERS[rollMode.value];
}

/* Dev console toggle: window.__setRollMode('fast') or ('standard') */
(window as any).__setRollMode = (mode: RollMode) => { rollMode.value = mode; };
