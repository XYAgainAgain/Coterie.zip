/* Pure (Firebase-free, DOM-free) core for the Storyteller canvas: tile catalog, default layout,
   and free-placement math (Obsidian-Canvas style — anchored cells, no overlaps). Move/resize stay unit-testable here; pointer wiring lives in StCanvas.tsx. */
import type { StTile } from './stStateLogic';
import { DEFAULT_NOTE_ID } from './stStateLogic';

export type StTileType = 'prompts' | 'notes' | 'haven' | 'clocks' | 'rolllog' | 'quickref' | 'initiative' | 'debts';

export interface StTileMeta {
  type: StTileType;
  label: string;
  minColSpan: number;
  defColSpan: number;
  defRowSpan: number;
}

/* Singleton tiles use their type as their id (max-1 enforced in addTile). Notes are the one
   multi-instance type: their ids are `notes:{noteId}`, so tileType() strips the suffix. Row
   spans are authored at the 4.5rem grid (ST_GRID_VERSION 2), so day-one tiles look unchanged. */
export const ST_TILES: readonly StTileMeta[] = [
  { type: 'prompts', label: 'Moves Reference', minColSpan: 3, defColSpan: 4, defRowSpan: 4 },
  { type: 'notes', label: 'ST Notes', minColSpan: 2, defColSpan: 4, defRowSpan: 2 },
  { type: 'haven', label: 'Haven', minColSpan: 3, defColSpan: 4, defRowSpan: 2 },
  { type: 'clocks', label: 'All Clocks', minColSpan: 3, defColSpan: 8, defRowSpan: 2 },
  { type: 'initiative', label: 'Initiative', minColSpan: 2, defColSpan: 3, defRowSpan: 4 },
  { type: 'debts', label: 'Debt Tracker', minColSpan: 3, defColSpan: 5, defRowSpan: 4 },
  { type: 'rolllog', label: 'Roll Log', minColSpan: 2, defColSpan: 4, defRowSpan: 4 },
  { type: 'quickref', label: 'Quick Ref', minColSpan: 3, defColSpan: 4, defRowSpan: 6 },
];

/* The four tiles a first-time Storyteller sees; Roll Log and Quick Ref are opt-in. */
const DEFAULT_TILES: readonly StTileType[] = ['prompts', 'notes', 'haven', 'clocks'];

export const GRID_COLS = 12;
export const GRID_COLS_NARROW = 8;

const META = new Map(ST_TILES.map(m => [m.type, m] as const));

/* A tile id's underlying type: `notes:{id}` → 'notes', everything else is its own type. */
export function tileType(id: string): string {
  const i = id.indexOf(':');
  return i === -1 ? id : id.slice(0, i);
}

/* Accepts a bare type or a prefixed tile id (resolves the type either way). */
export function tileMeta(idOrType: string): StTileMeta | undefined {
  return META.get(tileType(idOrType) as StTileType);
}

export function isStTileType(id: string): boolean {
  return META.has(tileType(id) as StTileType);
}

/* Smallest a tile may shrink to at a given grid width: its own minimum, capped at the grid
   so a wide tile clamps in the narrow reflow instead of overflowing. */
export function minColSpanFor(idOrType: string, cols: number): number {
  const m = META.get(tileType(idOrType) as StTileType);
  return Math.min(cols, Math.max(1, m?.minColSpan ?? 1));
}

export function clampColSpan(idOrType: string, span: number, cols: number): number {
  const lo = minColSpanFor(idOrType, cols);
  return Math.max(lo, Math.min(cols, Math.round(span)));
}

/* No upper cap: the ST lays tiles out however they want (sanity floor of 1 only). */
export function clampRowSpan(span: number): number {
  return Math.max(1, Math.round(span));
}

/* A minimized tile occupies only its header row, so every collision/sizer calc reads its
   height through here rather than the raw rowSpan (which is preserved for restore). */
export function effRowSpan(t: StTile): number {
  return t.min ? 1 : t.rowSpan;
}

/* Two placed tiles share at least one cell (minimized tiles count as one row tall). */
export function overlaps(a: StTile, b: StTile): boolean {
  return a.col < b.col + b.colSpan && b.col < a.col + a.colSpan
    && a.row < b.row + effRowSpan(b) && b.row < a.row + effRowSpan(a);
}

/* A w×h rect anchored at (col,row) sits inside the grid and clears every tile except `id`. */
function rectFits(tiles: StTile[], id: string, col: number, row: number, w: number, h: number, cols: number): boolean {
  if (col < 1 || row < 1 || col + w - 1 > cols) return false;
  const probe: StTile = { id, col, row, colSpan: w, rowSpan: h };
  return tiles.every(t => t.id === id || !overlaps(probe, t));
}

/* Can the tile move to (col,row) at its current size without colliding? */
export function fitsAt(tiles: StTile[], id: string, col: number, row: number, cols: number): boolean {
  const t = tiles.find(x => x.id === id);
  return !!t && rectFits(tiles, id, col, row, t.colSpan, effRowSpan(t), cols);
}

/* First open anchor (row-major scan) that fits a fresh w×h tile among the existing anchors. */
function firstFreeSpot(tiles: StTile[], w: number, h: number, cols: number): { col: number; row: number } {
  for (let row = 1; row < 10000; row++) {
    for (let col = 1; col + w - 1 <= cols; col++) {
      if (rectFits(tiles, '\0', col, row, w, h, cols)) return { col, row };
    }
  }
  return { col: 1, row: 1 };
}

/* First-fit-dense pack (seed layout + narrow reflow only): scan row by row, cell by cell,
   drop each tile at the first spot its clamped span fits an occupancy grid. Guarantees no
   overlap and backfills gaps a wider later tile leaves. Emits 1-based col/row. */
export function packLayout(tiles: StTile[], cols: number): StTile[] {
  const occ: boolean[][] = [];
  const row = (r: number) => {
    while (occ.length <= r) occ.push(new Array(cols).fill(false));
    return occ[r];
  };
  const fits = (r: number, c: number, w: number, h: number): boolean => {
    if (c + w > cols) return false;
    for (let dr = 0; dr < h; dr++) {
      const line = row(r + dr);
      for (let dc = 0; dc < w; dc++) if (line[c + dc]) return false;
    }
    return true;
  };

  return tiles.map(t => {
    const w = clampColSpan(t.id, t.colSpan, cols);
    const fullH = clampRowSpan(t.rowSpan);
    const h = t.min ? 1 : fullH; // a minimized tile occupies one row but keeps its stored span
    let pr = 0, pc = 0, done = false;
    for (let r = 0; !done; r++) {
      for (let c = 0; c + w <= cols; c++) {
        if (fits(r, c, w, h)) { pr = r; pc = c; done = true; break; }
      }
      if (r > 1000) { done = true; } // unreachable guard against a degenerate span
    }
    for (let dr = 0; dr < h; dr++) {
      const line = row(pr + dr);
      for (let dc = 0; dc < w; dc++) line[pc + dc] = true;
    }
    const placed: StTile = { id: t.id, col: pc + 1, row: pr + 1, colSpan: w, rowSpan: fullH };
    if (t.min) placed.min = true;
    return placed;
  });
}

/* The four tiles a first-time Storyteller sees: prompts tall on the left, notes + haven
   across the top-right, clocks filling the rest of row two. Packed at full width. The notes
   tile carries the seeded note's id (see seedStDefaults). */
export function defaultLayout(noteId: string = DEFAULT_NOTE_ID): StTile[] {
  const seed: StTile[] = DEFAULT_TILES.map(type => {
    const m = META.get(type)!;
    const id = type === 'notes' ? `notes:${noteId}` : type;
    return { id, col: 0, row: 0, colSpan: m.defColSpan, rowSpan: m.defRowSpan };
  });
  return packLayout(seed, GRID_COLS);
}

export function presentTypes(tiles: StTile[]): Set<string> {
  return new Set(tiles.map(t => t.id));
}

/* Singleton tile types not yet on the canvas, in catalog order (drives the picker). Notes are
   excluded: they're always addable and created through addTileInstance (see AddTilePicker). */
export function addableTypes(tiles: StTile[]): StTileType[] {
  const have = presentTypes(tiles);
  return ST_TILES.map(m => m.type).filter(t => t !== 'notes' && !have.has(t));
}

/* Drop a singleton tile type into the first free anchor (no-op if already present). Existing
   anchors are preserved — only the new tile is placed. */
export function addTile(tiles: StTile[], type: StTileType, cols: number): StTile[] {
  return addTileInstance(tiles, type, type, cols);
}

/* Place a tile with an explicit id (for multi-instance notes: `notes:{noteId}`). No-op if the
   id is already placed or the type is unknown. */
export function addTileInstance(tiles: StTile[], type: StTileType, id: string, cols: number): StTile[] {
  if (!META.has(type) || presentTypes(tiles).has(id)) return tiles;
  const m = META.get(type)!;
  const w = clampColSpan(type, m.defColSpan, cols);
  const h = clampRowSpan(m.defRowSpan);
  const { col, row } = firstFreeSpot(tiles, w, h, cols);
  return [...tiles, { id, col, row, colSpan: w, rowSpan: h }];
}

/* Remove a tile; the rest keep their anchors (free placement, no repack). */
export function removeTile(tiles: StTile[], id: string, _cols: number): StTile[] {
  const next = tiles.filter(t => t.id !== id);
  return next.length === tiles.length ? tiles : next;
}

/* Collapse/restore a tile to its header bar. While minimized its hidden rows read as FREE
   (effRowSpan), so another tile may move in; restore must re-check and relocate if blocked. */
export function toggleMinimize(tiles: StTile[], id: string, cols: number): StTile[] {
  const t = tiles.find(x => x.id === id);
  if (!t) return tiles;
  if (!t.min) return tiles.map(x => (x.id === id ? { ...x, min: true } : x));

  const { min, ...restored } = t;
  const others = tiles.map(x => (x.id === id ? restored : x));
  if (rectFits(others, id, t.col, t.row, t.colSpan, t.rowSpan, cols)) {
    return others;
  }
  for (let row = 1; ; row++) {
    for (let col = 1; col + t.colSpan - 1 <= cols; col++) {
      if (rectFits(others, id, col, row, t.colSpan, t.rowSpan, cols)) {
        return tiles.map(x => (x.id === id ? { ...restored, col, row } : x));
      }
    }
  }
}

/* Move a tile to a new anchor, clamped into the grid. Rejects (returns the input unchanged)
   when the target cells are occupied by another tile — the caller snaps back. */
export function moveTile(tiles: StTile[], id: string, col: number, row: number, cols: number): StTile[] {
  const t = tiles.find(x => x.id === id);
  if (!t) return tiles;
  const c = Math.max(1, Math.min(Math.round(col), cols - t.colSpan + 1));
  const r = Math.max(1, Math.round(row));
  if (c === t.col && r === t.row) return tiles;
  if (!rectFits(tiles, id, c, r, t.colSpan, effRowSpan(t), cols)) return tiles;
  return tiles.map(x => x.id === id ? { ...x, col: c, row: r } : x);
}

/* Resize a tile from its fixed anchor. Spans clamp to the tile min/grid, then shrink as
   needed so growth never overlaps a neighbor (collision clamps rather than pushes). */
export function resizeTile(tiles: StTile[], id: string, colSpan: number, rowSpan: number, cols: number): StTile[] {
  const t = tiles.find(x => x.id === id);
  if (!t) return tiles;
  const minW = minColSpanFor(id, cols);
  let w = clampColSpan(id, colSpan, cols);
  let h = clampRowSpan(rowSpan);
  while (w > minW && !rectFits(tiles, id, t.col, t.row, w, t.rowSpan, cols)) w--;
  while (h > 1 && !rectFits(tiles, id, t.col, t.row, w, h, cols)) h--;
  if (w === t.colSpan && h === t.rowSpan) return tiles;
  if (!rectFits(tiles, id, t.col, t.row, w, h, cols)) return tiles;
  return tiles.map(x => x.id === id ? { ...x, colSpan: w, rowSpan: h } : x);
}

/* Rows the layout spans (max bottom edge), so the canvas sizer can add drop-headroom below.
   A minimized tile only reaches one row past its anchor. */
export function layoutRows(tiles: StTile[]): number {
  return tiles.reduce((max, t) => Math.max(max, t.row - 1 + effRowSpan(t)), 0);
}

/* Re-clamp every tile's colSpan to a new grid width (the 12→8 reflow) and repack, so a
   wide tile snaps down instead of overflowing the narrower canvas. Display-only. */
export function reflowLayout(tiles: StTile[], cols: number): StTile[] {
  return packLayout(tiles, cols);
}
