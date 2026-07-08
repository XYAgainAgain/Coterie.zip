import { describe, it, expect } from 'vitest';
import {
  GRID_COLS, GRID_COLS_NARROW,
  clampColSpan, clampRowSpan, minColSpanFor, packLayout, defaultLayout,
  addTile, addTileInstance, removeTile, addableTypes, moveTile, resizeTile, fitsAt, overlaps,
  layoutRows, reflowLayout, tileMeta, tileType, isStTileType, effRowSpan, toggleMinimize,
} from '../state/stCanvasLogic';
import type { StTile } from '../state/stStateLogic';
import { clocksForCanvas, type ClocksSource } from '../components/st/tiles/clockAggregate';

const tile = (id: string, colSpan: number, rowSpan = 1): StTile =>
  ({ id, col: 0, row: 0, colSpan, rowSpan });

const at = (id: string, col: number, row: number, colSpan: number, rowSpan: number): StTile =>
  ({ id, col, row, colSpan, rowSpan });

const min = (t: StTile): StTile => ({ ...t, min: true });

/* True when no two tiles share any cell (the packing contract). */
function noOverlap(tiles: StTile[], cols: number): boolean {
  const occ = new Set<string>();
  for (const t of tiles) {
    for (let r = t.row; r < t.row + t.rowSpan; r++) {
      for (let c = t.col; c < t.col + t.colSpan; c++) {
        const key = `${r},${c}`;
        if (occ.has(key)) return false;
        occ.add(key);
      }
    }
    if (t.col + t.colSpan - 1 > cols) return false;
  }
  return true;
}

describe('span clamping', () => {
  it('clamps a column span into the tile min and the grid width', () => {
    expect(clampColSpan('clocks', 99, GRID_COLS)).toBe(12); // grid ceiling
    expect(clampColSpan('clocks', 1, GRID_COLS)).toBe(3);   // clocks min is 3
    expect(clampColSpan('rolllog', 1, GRID_COLS)).toBe(2);  // rolllog min tightened to 2
    expect(clampColSpan('notes', 1, GRID_COLS)).toBe(2);    // notes min is 2
  });

  it('caps a tile min at the grid width in the narrow reflow', () => {
    expect(minColSpanFor('clocks', GRID_COLS_NARROW)).toBe(3);
    expect(minColSpanFor('clocks', 2)).toBe(2); // min would be 3, but grid is only 2
    expect(clampColSpan('clocks', 8, GRID_COLS_NARROW)).toBe(8);
  });

  it('clamps a row span to a floor of 1 and rounds (no upper cap)', () => {
    expect(clampRowSpan(0)).toBe(1);
    expect(clampRowSpan(2.4)).toBe(2);
    expect(clampRowSpan(99)).toBe(99);
  });
});

describe('packLayout (seed + reflow only)', () => {
  it('places tiles left to right, wrapping to the next row, with no overlaps', () => {
    const packed = packLayout([tile('prompts', 4), tile('notes', 4), tile('haven', 4), tile('clocks', 8)], GRID_COLS);
    expect(noOverlap(packed, GRID_COLS)).toBe(true);
    const byId = Object.fromEntries(packed.map(t => [t.id, t]));
    expect(byId.prompts).toMatchObject({ col: 1, row: 1 });
    expect(byId.notes).toMatchObject({ col: 5, row: 1 });
    expect(byId.haven).toMatchObject({ col: 9, row: 1 });
    expect(byId.clocks.row).toBe(2); // no room left on row 1 for an 8-wide tile
  });

  it('backfills a gap a wider tile leaves (dense fill)', () => {
    const packed = packLayout([tile('clocks', 8), tile('notes', 4)], GRID_COLS);
    const notes = packed.find(t => t.id === 'notes')!;
    expect(notes).toMatchObject({ col: 9, row: 1 });
    expect(noOverlap(packed, GRID_COLS)).toBe(true);
  });
});

describe('defaultLayout', () => {
  it('seeds only the four day-one tiles (notes carries the default note id), packed without overlap', () => {
    const layout = defaultLayout();
    expect(layout.map(t => t.id).sort()).toEqual(['clocks', 'haven', 'notes:default', 'prompts']);
    expect(noOverlap(layout, GRID_COLS)).toBe(true);
  });

  it('puts prompts tall on the left at the 4.5rem-grid spans', () => {
    const byId = Object.fromEntries(defaultLayout().map(t => [t.id, t]));
    expect(byId.prompts).toMatchObject({ col: 1, row: 1, colSpan: 4, rowSpan: 4 });
    expect(byId['notes:default'].rowSpan).toBe(2);
    expect(byId.clocks.rowSpan).toBe(2);
  });
});

describe('add / remove / singletons + notes', () => {
  it('offers the singleton tiles absent on the day-one canvas (notes excluded: always addable)', () => {
    expect(addableTypes(defaultLayout())).toEqual(['initiative', 'debts', 'rolllog', 'quickref']);
  });

  it('adds a removed tile back into the first free anchor, keeping others put', () => {
    const layout = removeTile(defaultLayout(), 'haven', GRID_COLS);
    expect(addableTypes(layout)).toEqual(['haven', 'initiative', 'debts', 'rolllog', 'quickref']);
    const back = addTile(layout, 'haven', GRID_COLS);
    expect(back.filter(t => t.id === 'haven')).toHaveLength(1);
    expect(noOverlap(back, GRID_COLS)).toBe(true);
    const again = addTile(back, 'haven', GRID_COLS); // already present
    expect(again).toBe(back); // unchanged reference
  });

  it('removing a missing id is a no-op by reference', () => {
    const layout = defaultLayout();
    expect(removeTile(layout, 'ghost', GRID_COLS)).toBe(layout);
  });

  it('remove keeps the surviving anchors untouched (no repack)', () => {
    const layout = defaultLayout();
    const notes = layout.find(t => t.id === 'notes:default')!;
    const without = removeTile(layout, 'clocks', GRID_COLS);
    expect(without.find(t => t.id === 'notes:default')).toMatchObject({ col: notes.col, row: notes.row });
  });
});

describe('overlaps + fitsAt', () => {
  it('detects a shared cell and clears adjacency', () => {
    expect(overlaps(at('a', 1, 1, 2, 2), at('b', 2, 2, 2, 2))).toBe(true);
    expect(overlaps(at('a', 1, 1, 2, 2), at('b', 3, 1, 2, 2))).toBe(false); // side by side
    expect(overlaps(at('a', 1, 1, 2, 2), at('b', 1, 3, 2, 2))).toBe(false); // stacked
  });

  const L = [at('a', 1, 1, 3, 2), at('b', 5, 1, 3, 2)];

  it('fits an empty anchor and rejects an occupied or out-of-bounds one', () => {
    expect(fitsAt(L, 'a', 8, 3, GRID_COLS)).toBe(true);   // open ground
    expect(fitsAt(L, 'a', 4, 1, GRID_COLS)).toBe(false);  // overlaps b
    expect(fitsAt(L, 'a', 11, 1, GRID_COLS)).toBe(false); // spills past col 12
    expect(fitsAt(L, 'ghost', 1, 1, GRID_COLS)).toBe(false); // unknown id
  });
});

describe('moveTile (free placement)', () => {
  const L = [at('a', 1, 1, 3, 2), at('b', 5, 1, 3, 2)];

  it('anchors a tile at an open cell', () => {
    const moved = moveTile(L, 'a', 8, 3, GRID_COLS);
    expect(moved.find(t => t.id === 'a')).toMatchObject({ col: 8, row: 3 });
    expect(noOverlap(moved, GRID_COLS)).toBe(true);
  });

  it('rejects a move onto another tile (unchanged reference)', () => {
    expect(moveTile(L, 'a', 4, 1, GRID_COLS)).toBe(L);
  });

  it('clamps the column so a wide tile never spills off the grid', () => {
    const moved = moveTile(L, 'a', 20, 3, GRID_COLS); // clamps to col 10 (12 - 3 + 1)
    expect(moved.find(t => t.id === 'a')).toMatchObject({ col: 10, row: 3 });
  });

  it('a move to the same cell is a no-op by reference', () => {
    expect(moveTile(L, 'a', 1, 1, GRID_COLS)).toBe(L);
  });
});

describe('resizeTile (collision-clamped)', () => {
  const L = [at('a', 1, 1, 3, 2), at('b', 5, 1, 3, 2)];

  it('clamps a horizontal grow so it stops at the neighbour', () => {
    const resized = resizeTile(L, 'a', 5, 2, GRID_COLS); // wants 5 wide, b blocks at col 5
    expect(resized.find(t => t.id === 'a')!.colSpan).toBe(4); // grows to the wall, not past
    expect(noOverlap(resized, GRID_COLS)).toBe(true);
  });

  it('grows freely downward into open rows', () => {
    const resized = resizeTile(L, 'a', 3, 4, GRID_COLS);
    expect(resized.find(t => t.id === 'a')!.rowSpan).toBe(4);
    expect(noOverlap(resized, GRID_COLS)).toBe(true);
  });
});

describe('layoutRows (canvas sizer)', () => {
  it('reports the lowest occupied row edge', () => {
    expect(layoutRows([at('a', 1, 1, 3, 2), at('b', 5, 3, 3, 4)])).toBe(6); // b: row 3 + span 4 - 1
    expect(layoutRows([])).toBe(0);
  });

  it('counts a minimized tile as one row tall', () => {
    expect(layoutRows([min(at('a', 1, 1, 3, 5))])).toBe(1);
  });
});

describe('minimize (header-row footprint)', () => {
  it('effRowSpan collapses a minimized tile to one row, else its full span', () => {
    expect(effRowSpan(at('a', 1, 1, 3, 4))).toBe(4);
    expect(effRowSpan(min(at('a', 1, 1, 3, 4)))).toBe(1);
  });

  it('toggleMinimize flips the flag and drops it entirely on restore', () => {
    const L = [at('a', 1, 1, 3, 3), at('b', 5, 1, 3, 2)];
    const minned = toggleMinimize(L, 'a', GRID_COLS);
    expect(minned.find(t => t.id === 'a')).toEqual({ id: 'a', col: 1, row: 1, colSpan: 3, rowSpan: 3, min: true });
    expect(minned.find(t => t.id === 'b')).toBe(L[1]); // neighbour untouched by reference

    const restored = toggleMinimize(minned, 'a', GRID_COLS);
    const a = restored.find(t => t.id === 'a')!;
    expect(a).toEqual({ id: 'a', col: 1, row: 1, colSpan: 3, rowSpan: 3 });
    expect('min' in a).toBe(false); // clean round-trip, span preserved for restore
  });

  it('relocates on restore when a tile moved into the vacated rows', () => {
    // B parks directly under A's collapsed header, inside A's original footprint
    const L = [min(at('a', 1, 1, 3, 4)), at('b', 1, 2, 3, 2)];
    const restored = toggleMinimize(L, 'a', GRID_COLS);
    const a = restored.find(t => t.id === 'a')!;
    const b = restored.find(t => t.id === 'b')!;
    expect('min' in a).toBe(false);
    expect(a.rowSpan).toBe(4); // span survives relocation
    expect(overlaps(a, b)).toBe(false); // never restores into an occupied rect
  });

  it('does not overlap a tile sitting in the rows it visually spanned', () => {
    const a = min(at('a', 1, 1, 3, 4));
    const b = at('b', 1, 2, 3, 2); // directly under A's collapsed header row
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(at('a', 1, 1, 3, 4), b)).toBe(true); // full-height A would collide
  });

  it('lets another tile move into a minimized tile\'s freed rows', () => {
    const L = [min(at('a', 1, 1, 3, 4)), at('b', 5, 1, 3, 2)];
    expect(fitsAt(L, 'b', 1, 2, GRID_COLS)).toBe(true);
    const moved = moveTile(L, 'b', 1, 2, GRID_COLS);
    expect(moved.find(t => t.id === 'b')).toMatchObject({ col: 1, row: 2 });
  });
});

describe('narrow reflow (12 -> 8 cols)', () => {
  it('clamps wide tiles into the 8-col grid with no overflow', () => {
    const wide = packLayout([tile('clocks', 12), tile('prompts', 10)], GRID_COLS);
    const narrow = reflowLayout(wide, GRID_COLS_NARROW);
    expect(noOverlap(narrow, GRID_COLS_NARROW)).toBe(true);
    for (const t of narrow) expect(t.col + t.colSpan - 1).toBeLessThanOrEqual(GRID_COLS_NARROW);
  });

  it('the full default layout survives the reflow intact and gap-safe', () => {
    const narrow = reflowLayout(defaultLayout(), GRID_COLS_NARROW);
    expect(narrow.map(t => t.id).sort()).toEqual(['clocks', 'haven', 'notes:default', 'prompts']);
    expect(noOverlap(narrow, GRID_COLS_NARROW)).toBe(true);
  });
});

describe('tile catalog helpers', () => {
  it('resolves known types and rejects strangers', () => {
    expect(isStTileType('haven')).toBe(true);
    expect(isStTileType('rolllog')).toBe(true);
    expect(isStTileType('quickref')).toBe(true);
    expect(isStTileType('initiative')).toBe(true);
    expect(isStTileType('debts')).toBe(true);
    expect(isStTileType('nope')).toBe(false);
    expect(tileMeta('prompts')?.label).toBe('Moves Reference');
    expect(tileMeta('rolllog')?.label).toBe('Roll Log');
    expect(tileMeta('initiative')?.label).toBe('Initiative');
    expect(tileMeta('debts')?.label).toBe('Debt Tracker');
    expect(tileMeta('nope')).toBeUndefined();
  });

  it('resolves a prefixed notes tile id to its underlying type', () => {
    expect(tileType('notes:abc-123')).toBe('notes');
    expect(tileType('haven')).toBe('haven');
    expect(isStTileType('notes:abc-123')).toBe(true);
    expect(tileMeta('notes:abc-123')?.label).toBe('ST Notes');
  });
});

describe('addTileInstance (multi-instance notes)', () => {
  it('places distinct note tiles by explicit id and rejects a duplicate id', () => {
    let layout = addTileInstance([], 'notes', 'notes:a', GRID_COLS);
    layout = addTileInstance(layout, 'notes', 'notes:b', GRID_COLS);
    expect(layout.map(t => t.id)).toEqual(['notes:a', 'notes:b']);
    expect(noOverlap(layout, GRID_COLS)).toBe(true);
    expect(addTileInstance(layout, 'notes', 'notes:a', GRID_COLS)).toBe(layout); // duplicate no-op
  });
});

describe('clocksForCanvas (All-Clocks aggregation)', () => {
  const clock = (id: string, name: string) => ({ id, name, segments: 4 as const, filled: 1 });

  it('gathers consented members personal clocks (no shared clock here anymore)', () => {
    const src: ClocksSource = {
      roster: [
        { name: 'Moe', consented: true, clocks: [clock('a', 'Heat'), clock('b', 'Frenzy')] },
        { name: 'Lor', consented: true, clocks: [clock('c', 'Hunt')] },
      ],
    };
    const out = clocksForCanvas(src);
    expect(out).not.toHaveProperty('shared');
    expect(out.members).toEqual([
      { name: 'Moe', clocks: [clock('a', 'Heat'), clock('b', 'Frenzy')] },
      { name: 'Lor', clocks: [clock('c', 'Hunt')] },
    ]);
    expect(out.totalPersonal).toBe(3);
  });

  it('excludes locked members and members with no clocks', () => {
    const src: ClocksSource = {
      roster: [
        { name: 'Locked', consented: false, clocks: [clock('x', 'Secret')] },
        { name: 'Empty', consented: true, clocks: [] },
        { name: 'Moe', consented: true, clocks: [clock('a', 'Heat')] },
      ],
    };
    const out = clocksForCanvas(src);
    expect(out.members).toEqual([{ name: 'Moe', clocks: [clock('a', 'Heat')] }]);
    expect(out.totalPersonal).toBe(1);
  });
});
