import { signal, effect } from '@preact/signals';
import { rollMode } from '../dice/diceConfig';
import type { RollMode } from '../dice/types';

/* Device-tier settings: live in localStorage, never touch Firestore.
   Per-character settings (customTheme) ride the character doc instead — see character.ts.
   Import direction rule: this file imports only diceConfig (signal-only) from dice/;
   dice modules import from here, never the reverse, so lazy-loading stays intact. */

export type DiceSurface =
  | 'hardwood' | 'cardboard' | 'felt' | 'glass' | 'neoprene' | 'plastic';

export const DICE_SURFACES: { id: DiceSurface; label: string }[] = [
  { id: 'hardwood', label: 'Hardwood' },
  { id: 'cardboard', label: 'Cardboard' },
  { id: 'felt', label: 'Felt' },
  { id: 'glass', label: 'Glass' },
  { id: 'neoprene', label: 'Neoprene' },
  { id: 'plastic', label: 'Plastic' },
];

const ROLL_MODES: RollMode[] = ['standard', 'fast', 'no3d'];

/* Ephemeral drawer state, never persisted. */
export const settingsOpen = signal(false);

function readString(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeString(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

function loadVolume(): number {
  const raw = readString('vamp-dice-volume');
  const n = raw === null ? NaN : parseFloat(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}

function loadSurface(): DiceSurface {
  const raw = readString('vamp-dice-surface');
  return DICE_SURFACES.some(s => s.id === raw) ? raw as DiceSurface : 'hardwood';
}

export const diceVolume = signal<number>(loadVolume());
export const diceMuted = signal<boolean>(readString('vamp-dice-muted') === 'true');
export const diceSurface = signal<DiceSurface>(loadSurface());

/* Roll mode lives in diceConfig (so dice modules read it without importing state/),
   but its persistence belongs here. Apply the stored value on boot before the engine
   lazy-loads, then mirror future changes — including the window.__setRollMode console
   alias, which writes the same signal. */
const storedRollMode = readString('vamp-roll-mode');
if (storedRollMode && ROLL_MODES.includes(storedRollMode as RollMode)) {
  rollMode.value = storedRollMode as RollMode;
}

effect(() => { writeString('vamp-roll-mode', rollMode.value); });
effect(() => { writeString('vamp-dice-volume', String(diceVolume.value)); });
effect(() => { writeString('vamp-dice-muted', String(diceMuted.value)); });
effect(() => { writeString('vamp-dice-surface', diceSurface.value); });

/* A drag to 0 engages mute; the last non-zero volume is remembered so unmuting restores
   it. Persisted separately from the live volume so it survives a reload while muted-at-0. */
function loadLastVolume(): number {
  const raw = readString('vamp-dice-volume-last');
  const n = raw === null ? NaN : parseFloat(raw);
  if (Number.isFinite(n) && n > 0) return Math.min(1, n);
  return diceVolume.value > 0 ? diceVolume.value : 0.5;
}
let lastNonZeroVolume = loadLastVolume();

export function setDiceVolume(v: number): void {
  const clamped = Math.max(0, Math.min(1, v));
  diceVolume.value = clamped;
  if (clamped > 0) {
    lastNonZeroVolume = clamped;
    writeString('vamp-dice-volume-last', String(clamped));
    if (diceMuted.value) diceMuted.value = false;
  } else {
    diceMuted.value = true;
  }
}

export function toggleDiceMute(): void {
  if (diceMuted.value) {
    diceMuted.value = false;
    if (diceVolume.value === 0) diceVolume.value = lastNonZeroVolume;
  } else {
    diceMuted.value = true;
  }
}

export function setRollMode(mode: RollMode): void {
  rollMode.value = mode;
}

export function setDiceSurface(surface: DiceSurface): void {
  diceSurface.value = surface;
}
