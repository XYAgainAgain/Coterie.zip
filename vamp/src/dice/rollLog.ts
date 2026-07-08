import { signal, effect } from '@preact/signals';
import type { RollLogEntry } from './types';
import { character } from '../state/character';
import { activeCharacterId, activeCoterie, appendCoterieRoll } from '../state/persistence';
import { stDashboardActive, stState } from '../state/stState';

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
   to the Coterie doc or the local log. On /st the roller has no character, so rolls are
   attributed to the Storyteller and honour the ST's roll-visibility mode. */
export function recordRoll(input: RollInput): void {
  const isStRoll = stDashboardActive.value;
  const mode = isStRoll ? stState.value.stRollMode : 'public';

  const entry: RollLogEntry = {
    ...input,
    id: crypto.randomUUID(),
    who: isStRoll ? 'Storyteller' : (character.value.name.trim() || 'Someone'),
    characterId: isStRoll ? '' : (activeCharacterId.value ?? ''),
    ts: Date.now(),
  };

  /* Hidden: the ST already saw the real result in the toast; nothing is shared. */
  if (isStRoll && mode === 'hidden') return;

  /* Secret: write a flagged, data-free entry so no player can read the true dice/total from the
     Coterie doc; every client renders it as "Storyteller rolled something." */
  if (isStRoll && mode === 'secret') {
    void appendCoterieRoll({
      id: entry.id, who: 'Storyteller', characterId: '', ts: entry.ts,
      kept: [], dropped: [], statName: '', statValue: 0, forwardMod: 0, ongoingMod: 0, total: 0,
      secret: true,
    });
    return;
  }

  /* One source per mode: shared log in a Coterie, local when solo. Keeping local empty
     in a Coterie stops its rolls leaking into the solo view if the character leaves. */
  if (activeCoterie.value) void appendCoterieRoll(entry);
  else rollLog.value = [entry, ...rollLog.value].slice(0, MAX_LOG);
}
