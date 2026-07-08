import { signal } from '@preact/signals';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { debounce } from '../utils/debounce';
import {
  blankStState, coerceStState, shouldCommitStWrite, ST_GRID_VERSION,
  type StState, type StTile, type StNote, type StRollMode,
} from './stStateLogic';
import { defaultLayout, addTileInstance, removeTile, GRID_COLS } from './stCanvasLogic';
import type { InitiativeState } from './stInitiativeLogic';
import type { Clock } from './character';
import type { CustomTheme } from '../themes/customTheme';

export { blankStState, type StState, type StTile };

/* The dashboard's current Coterie code; guards debounced writes against a switch. */
export const activeStCode = signal<string | null>(null);
export const stState = signal<StState>(blankStState());

/* True only while the ST dashboard is mounted, so the global header can surface its extra
   controls without parsing the URL. StDashboard flips it on mount/unmount. */
export const stDashboardActive = signal(false);

/* Whether the stState doc existed at load: distinguishes a first-ever visit (seed the
   day-one tiles) from a deliberately emptied canvas (respect it). */
export const stDocExisted = signal(false);

function stDoc(code: string) {
  return doc(db, 'stState', code);
}

/* Persist the current stState for `code`, unless the ST has since switched Coteries.
   A permission error (rules pending, or ST status lost) must not crash or toast. */
async function writeStState(code: string): Promise<void> {
  if (!auth.currentUser?.uid) return;
  if (!shouldCommitStWrite(code, activeStCode.value)) return;
  const { layout, notes, initiative, clocks, theme, stRollMode } = stState.value;
  /* JSON round-trip strips any undefined theme keys (e.g. a cleared accent2) so setDoc,
     which rejects undefined values, never throws on a partially-edited theme. */
  const themePayload = theme ? JSON.parse(JSON.stringify(theme)) : null;
  try {
    await setDoc(stDoc(code), { layout, notes, initiative, clocks, theme: themePayload, stRollMode, gridVersion: ST_GRID_VERSION, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    /* Silent to the user (denial is an expected state), logged so network/quota
       failures on ST notes stay debuggable. */
    console.warn('[stState] write failed:', err);
  }
}

const scheduleWrite = debounce((code: string) => { void writeStState(code); }, 3000);

/* Load the ST-state doc for a Coterie. Missing doc or denied read (rules pending) both
   yield a blank canvas rather than an error. Sets the guard code before any await. */
export async function loadStState(rawCode: string): Promise<StState> {
  const code = rawCode.trim().toUpperCase();
  activeStCode.value = code;
  let loaded = blankStState();
  let existed = false;
  try {
    const snap = await getDoc(stDoc(code));
    existed = snap.exists();
    if (existed) loaded = coerceStState(snap.data());
  } catch (err) {
    /* Blank dashboard is the graceful fallback; logged for debuggability. */
    console.warn('[stState] read failed:', err);
  }
  if (activeStCode.value === code) {
    stState.value = loaded;
    stDocExisted.value = existed;
  }
  return loaded;
}

export function setStLayout(layout: StTile[]): void {
  stState.value = { ...stState.value, layout };
  const code = activeStCode.value;
  if (code) scheduleWrite(code);
}

function commit(next: StState): void {
  stState.value = next;
  const code = activeStCode.value;
  if (code) scheduleWrite(code);
}

/* Seed the day-one canvas plus its paired ST Note on a first-ever visit (empty layout). */
export function seedStDefaults(): void {
  const cur = stState.value;
  if (cur.layout.length > 0) return;
  const noteId = cur.notes[0]?.id ?? crypto.randomUUID();
  const notes: StNote[] = cur.notes.length ? cur.notes : [{ id: noteId, text: '' }];
  commit({ ...cur, notes, layout: defaultLayout(noteId) });
}

export function updateStNote(id: string, text: string): void {
  commit({ ...stState.value, notes: stState.value.notes.map(n => (n.id === id ? { ...n, text } : n)) });
}

/* Create a new note and its canvas tile together, returning the new note id so the caller
   can open its editor. */
export function addStNote(): string {
  const id = crypto.randomUUID();
  const cur = stState.value;
  commit({
    ...cur,
    notes: [...cur.notes, { id, text: '' }],
    layout: addTileInstance(cur.layout, 'notes', `notes:${id}`, GRID_COLS),
  });
  return id;
}

/* Delete a note and its tile in one write (the note editor's trash control does this behind a
   confirm; closing the tile never deletes). */
export function removeStNote(id: string): void {
  const cur = stState.value;
  commit({
    ...cur,
    notes: cur.notes.filter(n => n.id !== id),
    layout: removeTile(cur.layout, `notes:${id}`, GRID_COLS),
  });
}

/* Close a note's tile without deleting the note, so its text survives and can be reopened. */
export function closeNoteTile(id: string): void {
  const cur = stState.value;
  commit({ ...cur, layout: removeTile(cur.layout, `notes:${id}`, GRID_COLS) });
}

/* Bring a closed (tile-less) note back onto the canvas. */
export function reopenNoteTile(id: string): void {
  const cur = stState.value;
  commit({ ...cur, layout: addTileInstance(cur.layout, 'notes', `notes:${id}`, GRID_COLS) });
}

export function setStInitiative(initiative: InitiativeState): void {
  commit({ ...stState.value, initiative });
}

export function setStClocks(clocks: Clock[]): void {
  commit({ ...stState.value, clocks });
}

export function setStRollMode(mode: StRollMode): void {
  commit({ ...stState.value, stRollMode: mode });
}

/* Set or clear this Coterie's dashboard theme (mirrors character.setCustomTheme). */
export function setStTheme(theme: CustomTheme | null): void {
  stState.value = { ...stState.value, theme };
  const code = activeStCode.value;
  if (code) scheduleWrite(code);
}

/* Merge a partial into the existing ST theme; no-ops if none is set (mirrors patchCustomTheme). */
export function patchStTheme(patch: Partial<CustomTheme>): void {
  const current = stState.value.theme;
  if (!current) return;
  stState.value = { ...stState.value, theme: { ...current, ...patch } };
  const code = activeStCode.value;
  if (code) scheduleWrite(code);
}

/* Force any pending debounced write out now (e.g. before leaving the dashboard). */
export function flushStState(): void {
  scheduleWrite.flush();
}

/* Detach from the current Coterie's ST state: cancel pending writes, clear signals. */
export function resetStState(): void {
  scheduleWrite.cancel();
  activeStCode.value = null;
  stState.value = blankStState();
  stDocExisted.value = false;
}

/* Tab close inside the 3s debounce window would drop the last ST edit; unmount cleanup
   never runs then, so flush on pagehide like the sheet does (persistence.ts). */
window.addEventListener('pagehide', () => { flushStState(); });
