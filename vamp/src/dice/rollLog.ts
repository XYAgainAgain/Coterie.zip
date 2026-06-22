import { signal, effect } from '@preact/signals';
import type { RollLogEntry } from './types';
import { character } from '../state/character';
import { activeCharacterId, activeCoterie, appendCoterieRoll } from '../state/persistence';

const MAX_LOG = 50;

/* Local log for solo (no-Coterie) play; in a Coterie the panel reads the shared list
   instead. Newest-first. */
export const rollLog = signal<RollLogEntry[]>([]);

function readLS(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLS(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

export const rollLogCollapsed = signal(readLS('vamp-rolllog-collapsed') === 'true');
effect(() => { writeLS('vamp-rolllog-collapsed', String(rollLogCollapsed.value)); });

type RollInput = Omit<RollLogEntry, 'id' | 'who' | 'characterId' | 'ts'>;

/* The single sink every roll path feeds. Stamps identity + time, then routes the entry
   to the Coterie doc or the local log. */
export function recordRoll(input: RollInput): void {
  const entry: RollLogEntry = {
    ...input,
    id: crypto.randomUUID(),
    who: character.value.name.trim() || 'Someone',
    characterId: activeCharacterId.value ?? '',
    ts: Date.now(),
  };
  /* One source per mode: shared log in a Coterie, local when solo. Keeping local empty
     in a Coterie stops its rolls leaking into the solo view if the character leaves. */
  if (activeCoterie.value) void appendCoterieRoll(entry);
  else rollLog.value = [entry, ...rollLog.value].slice(0, MAX_LOG);
}
