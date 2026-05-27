import { signal } from '@preact/signals';

export interface DiceEngineHandle {
  spawnFromSpinner(count?: number): Promise<void>;
  fixDieResults(desiredValues: number[]): void;
  fadeDiceOut(delayMs?: number, durationMs?: number): void;
  playRollAudio(diceCount: number): void;
  clearDice(): void;
  waitForSettle(): Promise<void>;
  handleResize(w: number, h: number): void;
  getSpinnerScreenPosition(): { x: number; y: number } | null;
  dispose(): void;
}

export const diceEngine = signal<DiceEngineHandle | null>(null);
