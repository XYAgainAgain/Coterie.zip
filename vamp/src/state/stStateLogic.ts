/* Pure (Firebase-free) core for the Storyteller-state doc, so the coercion and
   stale-write guard stay unit-testable. The Firestore I/O lives in stState.ts. */
import type { CustomTheme, ThemeBase, EyeAnim } from '../themes/customTheme';
import type { Clock } from './character';
import { coerceInitiative, blankInitiative, type InitiativeState } from './stInitiativeLogic';

/* One dashboard tile's placement on the 12-column snap grid. */
export interface StTile {
  id: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  /* Collapsed to its header bar: body hidden, occupies only its header row for collision.
     Restores to the stored col/row spans when un-minimized. Omitted when false. */
  min?: boolean;
}

/* Current row-grid generation. Bumped when the row unit changes so stored layouts
   migrate on load (v1 = 9rem rows, v2 = 4.5rem rows / spans doubled). */
export const ST_GRID_VERSION = 2;

/* One Storyteller note (multi-instance). The tile that renders it carries id `notes:{id}`. */
export interface StNote {
  id: string;
  text: string;
}

/* Fixed id for the single note a pre-multi-instance (string) doc migrates into, so the
   migration is deterministic and idempotent. */
export const LEGACY_NOTE_ID = 'legacy';
/* Note id seeded for a first-ever dashboard; paired with the day-one notes tile. */
export const DEFAULT_NOTE_ID = 'default';

/* How the ST's own dice rolls reach the shared log: Public posts as normal (attributed to the
   Storyteller), Secret posts a data-free "rolled something" entry, Hidden posts nothing. */
export type StRollMode = 'public' | 'secret' | 'hidden';
const ST_ROLL_MODES: StRollMode[] = ['public', 'secret', 'hidden'];

/* The `stState/{CODE}` document: canvas layout, the ST's notes (markdown, multi-instance),
   the ST-local initiative tracker, ST-private clocks, the ST's roll-visibility mode, and an
   optional per-Coterie custom theme that reskins only the /st route (see StDashboard). */
export interface StState {
  layout: StTile[];
  notes: StNote[];
  initiative: InitiativeState;
  clocks: Clock[];
  gridVersion: number;
  theme: CustomTheme | null;
  stRollMode: StRollMode;
}

export function blankStState(): StState {
  return { layout: [], notes: [], initiative: blankInitiative(), clocks: [], gridVersion: ST_GRID_VERSION, theme: null, stRollMode: 'public' };
}

/* Notes with no tile currently on the canvas, titled for the reopen list (closing a note tile
   keeps the note; this is how the ST brings one back). */
export function tilelessNotes(notes: StNote[], layout: StTile[]): { id: string; title: string }[] {
  const open = new Set(layout.filter(t => t.id.startsWith('notes:')).map(t => t.id.slice('notes:'.length)));
  return notes.filter(n => !open.has(n.id)).map(n => ({ id: n.id, title: noteTitle(n.text) || 'ST Notes' }));
}

/* A note's tile title is its first markdown heading (any level); blank falls back at the
   call site to "ST Notes". Scans line-by-line so a `#` mid-paragraph never counts. */
export function noteTitle(text: string): string {
  for (const line of text.split('\n')) {
    const m = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (m) return m[1].trim();
  }
  return '';
}

const CLOCK_SEGMENTS = [4, 6, 8];

/* Validate a stored clock (ST-private list, or a migrated string). Segments must be 4/6/8,
   fill clamps into range. Mirrors the Clock shape the sheet's ClockDisplay consumes. */
function coerceClock(raw: unknown): Clock | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== 'string' || !c.id) return null;
  const segments = CLOCK_SEGMENTS.includes(c.segments as number) ? (c.segments as 4 | 6 | 8) : 4;
  const filled = typeof c.filled === 'number' && Number.isFinite(c.filled)
    ? Math.max(0, Math.min(Math.trunc(c.filled), segments))
    : 0;
  const out: Clock = { id: c.id, name: typeof c.name === 'string' ? c.name : '', segments, filled };
  if (typeof c.condition === 'string' && c.condition) out.condition = c.condition;
  return out;
}

function coerceStClocks(raw: unknown): Clock[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(coerceClock).filter((c): c is Clock => c !== null);
}

/* Normalize the notes field, migrating the legacy single-string form to a one-note list.
   Idempotent: an already-migrated array reads straight through. */
function coerceStNotes(raw: unknown): StNote[] {
  if (typeof raw === 'string') {
    return raw.trim() ? [{ id: LEGACY_NOTE_ID, text: raw }] : [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
    .map(n => ({ id: typeof n.id === 'string' ? n.id : '', text: typeof n.text === 'string' ? n.text : '' }))
    .filter(n => n.id !== '');
}

function toInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

const THEME_BASES = ['night', 'sunset', 'abyss'];
const EYE_ANIMS = ['heartbeat', 'shimmer', 'dilate', 'glow', 'breathe', 'blink'];

/* Validate a stored ST theme: needs a known base + a string accent, else it's discarded.
   Mirrors the CustomTheme shape the player-sheet engine (themes/customTheme.ts) consumes. */
function coerceStTheme(raw: unknown): CustomTheme | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.base !== 'string' || !THEME_BASES.includes(t.base)) return null;
  if (typeof t.accent !== 'string') return null;
  const out: CustomTheme = {
    base: t.base as ThemeBase,
    accent: t.accent,
    eyeAnim: typeof t.eyeAnim === 'string' && EYE_ANIMS.includes(t.eyeAnim) ? (t.eyeAnim as EyeAnim) : 'heartbeat',
  };
  if (typeof t.accent2 === 'string') out.accent2 = t.accent2;
  if (typeof t.accentB === 'boolean') out.accentB = t.accentB;
  if (typeof t.diceFont === 'string') out.diceFont = t.diceFont;
  if (typeof t.diceMetalness === 'number' && Number.isFinite(t.diceMetalness)) out.diceMetalness = t.diceMetalness;
  return out;
}

/* Normalize a raw Firestore doc into a well-formed StState: drop malformed tiles,
   backfill missing spans, tolerate absent fields (old/empty docs), and migrate the
   row grid from any older generation up to ST_GRID_VERSION. */
export function coerceStState(data: Record<string, unknown> | null | undefined): StState {
  if (!data) return blankStState();
  const version = toInt(data.gridVersion, 1);
  const rawLayout = Array.isArray(data.layout) ? data.layout : [];
  let layout: StTile[] = rawLayout
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map(t => {
      /* The old singleton notes tile (id 'notes') becomes the migrated legacy note's tile. */
      const rawId = typeof t.id === 'string' ? t.id : '';
      const id = rawId === 'notes' ? `notes:${LEGACY_NOTE_ID}` : rawId;
      const base: StTile = {
        id,
        col: toInt(t.col, 0),
        row: toInt(t.row, 0),
        colSpan: Math.max(1, toInt(t.colSpan, 1)),
        rowSpan: Math.max(1, toInt(t.rowSpan, 1)),
      };
      /* Only stored when true, so clean (non-minimized) tiles round-trip without the key. */
      return t.min === true ? { ...base, min: true } : base;
    })
    .filter(t => t.id !== '');
  /* v1 rows were 9rem; halving the unit to 4.5rem doubles every span and remaps each
     anchor to the finer grid so old layouts land in the same visual place. */
  if (version < 2) {
    layout = layout.map(t => ({
      ...t,
      row: Math.max(1, (t.row - 1) * 2 + 1),
      rowSpan: t.rowSpan * 2,
    }));
  }
  let notes = coerceStNotes(data.notes);
  /* A migrated legacy notes tile needs a backing note even when the old string was empty,
     else the tile would render (and title) against nothing. */
  const hasLegacyTile = layout.some(t => t.id === `notes:${LEGACY_NOTE_ID}`);
  if (hasLegacyTile && !notes.some(n => n.id === LEGACY_NOTE_ID)) {
    notes = [{ id: LEGACY_NOTE_ID, text: '' }, ...notes];
  }
  return {
    layout,
    notes,
    initiative: coerceInitiative(data.initiative),
    clocks: coerceStClocks(data.clocks),
    gridVersion: ST_GRID_VERSION,
    theme: coerceStTheme(data.theme),
    stRollMode: ST_ROLL_MODES.includes(data.stRollMode as StRollMode) ? (data.stRollMode as StRollMode) : 'public',
  };
}

/* Guard mirroring the sheet's activeCharacterId pattern: a debounced write only lands
   if the Coterie it was scheduled for is still the active one, so a slow save can't
   stomp a Coterie the ST switched to. */
export function shouldCommitStWrite(intendedCode: string | null, activeCode: string | null): boolean {
  return intendedCode !== null && intendedCode === activeCode;
}
