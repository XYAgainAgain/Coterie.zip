import { signal } from '@preact/signals';
import type { RollBreakdown } from './rollMove';

const MAX_HISTORY = 20;

export const rollHistory = signal<RollBreakdown[]>([]);

export function logRoll(breakdown: RollBreakdown): void {
  rollHistory.value = [breakdown, ...rollHistory.value].slice(0, MAX_HISTORY);
}
