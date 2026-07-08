import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { blankStState, coerceStState, shouldCommitStWrite, noteTitle, tilelessNotes, LEGACY_NOTE_ID, ST_GRID_VERSION, type StNote, type StTile } from '../state/stStateLogic';
import { debounce } from '../utils/debounce';

/* A v2 doc reads straight through with no row migration. */
const V2 = { gridVersion: 2 };
const BLANK_EXTRAS = { initiative: { opponents: [], turns: [], turn: 0, round: 1 }, clocks: [], stRollMode: 'public' };

describe('coerceStState', () => {
  it('returns a blank state (current grid version) for null/undefined/empty', () => {
    const blank = { layout: [], notes: [], ...BLANK_EXTRAS, gridVersion: ST_GRID_VERSION, theme: null };
    expect(coerceStState(null)).toEqual(blank);
    expect(coerceStState(undefined)).toEqual(blank);
    expect(coerceStState({})).toEqual(blank);
  });

  it('reads a well-formed v2 doc through', () => {
    const doc = {
      ...V2,
      layout: [{ id: 'haven', col: 0, row: 0, colSpan: 4, rowSpan: 2 }],
      notes: [{ id: 'n1', text: 'watch the Sheriff' }],
    };
    expect(coerceStState(doc)).toEqual({
      layout: doc.layout, notes: doc.notes, ...BLANK_EXTRAS, gridVersion: ST_GRID_VERSION, theme: null,
    });
  });

  it('drops tiles without an id and backfills missing spans', () => {
    const out = coerceStState({
      ...V2,
      layout: [
        { col: 1, row: 1 }, // no id → dropped
        { id: 'haven', col: 2, row: 3 }, // spans default to 1
      ],
    });
    expect(out.layout).toEqual([{ id: 'haven', col: 2, row: 3, colSpan: 1, rowSpan: 1 }]);
  });

  it('coerces malformed numbers and clamps spans to at least 1', () => {
    const out = coerceStState({
      ...V2,
      layout: [{ id: 'x', col: '3', row: null, colSpan: 0, rowSpan: -5 }],
    });
    expect(out.layout[0]).toEqual({ id: 'x', col: 0, row: 0, colSpan: 1, rowSpan: 1 });
  });

  it('ignores a non-array layout and a non-string, non-array notes field', () => {
    expect(coerceStState({ ...V2, layout: 'nope', notes: 42 }))
      .toEqual({ layout: [], notes: [], ...BLANK_EXTRAS, gridVersion: ST_GRID_VERSION, theme: null });
  });

  it('coerces the ST roll mode, defaulting anything unknown to public', () => {
    expect(coerceStState({ ...V2, stRollMode: 'secret' }).stRollMode).toBe('secret');
    expect(coerceStState({ ...V2, stRollMode: 'hidden' }).stRollMode).toBe('hidden');
    expect(coerceStState({ ...V2, stRollMode: 'nonsense' }).stRollMode).toBe('public');
    expect(coerceStState({ ...V2 }).stRollMode).toBe('public');
  });

  it('blankStState is a fresh object each call', () => {
    expect(blankStState()).not.toBe(blankStState());
  });
});

describe('minimize flag coercion', () => {
  it('keeps min only when strictly true', () => {
    const out = coerceStState({
      ...V2,
      layout: [
        { id: 'prompts', col: 1, row: 1, colSpan: 4, rowSpan: 2, min: true },
        { id: 'haven', col: 5, row: 1, colSpan: 4, rowSpan: 2, min: false },
        { id: 'clocks', col: 1, row: 3, colSpan: 8, rowSpan: 2, min: 'yes' },
      ],
    });
    expect(out.layout[0]).toEqual({ id: 'prompts', col: 1, row: 1, colSpan: 4, rowSpan: 2, min: true });
    // false/truthy-non-boolean both drop the key entirely (clean round-trip)
    expect(out.layout[1]).toEqual({ id: 'haven', col: 5, row: 1, colSpan: 4, rowSpan: 2 });
    expect(out.layout[2]).toEqual({ id: 'clocks', col: 1, row: 3, colSpan: 8, rowSpan: 2 });
  });
});

describe('theme coercion', () => {
  it('drops a theme with no valid base or accent', () => {
    expect(coerceStState({ ...V2, theme: { accent: '#fff' } }).theme).toBeNull();
    expect(coerceStState({ ...V2, theme: { base: 'chartreuse', accent: '#fff' } }).theme).toBeNull();
    expect(coerceStState({ ...V2, theme: { base: 'night' } }).theme).toBeNull();
    expect(coerceStState({ ...V2, theme: 'nope' }).theme).toBeNull();
  });

  it('reads a valid theme through and defaults a missing eyeAnim', () => {
    const out = coerceStState({ ...V2, theme: { base: 'abyss', accent: '#A88BFF' } });
    expect(out.theme).toEqual({ base: 'abyss', accent: '#A88BFF', eyeAnim: 'heartbeat' });
  });

  it('carries the optional theme fields when present and well-typed', () => {
    const out = coerceStState({
      ...V2,
      theme: { base: 'sunset', accent: '#E84545', accent2: '#2B2E4A', accentB: false, eyeAnim: 'glow', diceFont: 'Sinistre, fantasy', diceMetalness: 0.5 },
    });
    expect(out.theme).toEqual({
      base: 'sunset', accent: '#E84545', accent2: '#2B2E4A', accentB: false, eyeAnim: 'glow', diceFont: 'Sinistre, fantasy', diceMetalness: 0.5,
    });
  });
});

describe('row-grid migration (v1 9rem -> v2 4.5rem)', () => {
  it('doubles spans and remaps anchors for a legacy (versionless) doc', () => {
    const out = coerceStState({
      layout: [
        { id: 'prompts', col: 1, row: 1, colSpan: 4, rowSpan: 2 }, // top-left, 2 rows tall
        { id: 'clocks', col: 1, row: 2, colSpan: 8, rowSpan: 1 },  // one row down
      ],
    });
    expect(out.gridVersion).toBe(ST_GRID_VERSION);
    expect(out.layout[0]).toMatchObject({ row: 1, rowSpan: 4 }); // (1-1)*2+1, 2*2
    expect(out.layout[1]).toMatchObject({ row: 3, rowSpan: 2 }); // (2-1)*2+1, 1*2
    // columns are untouched by the row migration
    expect(out.layout[0].col).toBe(1);
    expect(out.layout[1].colSpan).toBe(8);
  });

  it('leaves a v2 doc rows alone', () => {
    const out = coerceStState({ ...V2, layout: [{ id: 'notes', col: 2, row: 3, colSpan: 4, rowSpan: 2 }] });
    expect(out.layout[0]).toMatchObject({ row: 3, rowSpan: 2 });
  });
});

describe('notes migration (legacy string -> note list)', () => {
  it('migrates a non-empty legacy string into one note, and renames the singleton tile', () => {
    const out = coerceStState({
      layout: [{ id: 'notes', col: 1, row: 1, colSpan: 4, rowSpan: 4 }], // v1 spans double on migration
      notes: 'watch the Sheriff',
    });
    expect(out.notes).toEqual([{ id: LEGACY_NOTE_ID, text: 'watch the Sheriff' }]);
    expect(out.layout[0].id).toBe(`notes:${LEGACY_NOTE_ID}`);
  });

  it('drops an empty legacy string to no notes when no notes tile references it', () => {
    expect(coerceStState({ ...V2, notes: '' }).notes).toEqual([]);
    expect(coerceStState({ ...V2, notes: '   ' }).notes).toEqual([]);
  });

  it('backfills an empty legacy note when a migrated notes tile would otherwise dangle', () => {
    const out = coerceStState({ ...V2, layout: [{ id: 'notes', col: 1, row: 1, colSpan: 4, rowSpan: 2 }], notes: '' });
    expect(out.layout[0].id).toBe(`notes:${LEGACY_NOTE_ID}`);
    expect(out.notes).toEqual([{ id: LEGACY_NOTE_ID, text: '' }]);
  });

  it('is idempotent: re-coercing an already-migrated doc is a fixed point', () => {
    const once = coerceStState({ layout: [{ id: 'notes', col: 1, row: 1, colSpan: 4, rowSpan: 2 }], notes: 'plans' });
    const twice = coerceStState(once as unknown as Record<string, unknown>);
    expect(twice).toEqual(once);
  });

  it('coerces a note list through, dropping malformed entries', () => {
    const out = coerceStState({ ...V2, notes: [{ id: 'a', text: 'x' }, { text: 'no id' }, null, { id: 'b', text: '' }] });
    expect(out.notes).toEqual([{ id: 'a', text: 'x' }, { id: 'b', text: '' }]);
  });
});

describe('tilelessNotes (reopen list for closed notes)', () => {
  const notes: StNote[] = [
    { id: 'a', text: '# The Sheriff\nnotes' },
    { id: 'b', text: 'no heading, just prose' },
    { id: 'c', text: '## Safehouse' },
  ];
  const tile = (id: string): StTile => ({ id, col: 1, row: 1, colSpan: 4, rowSpan: 2 });

  it('lists only notes with no open tile, titled by their first heading (else "ST Notes")', () => {
    const layout = [tile('notes:a'), tile('haven')];
    expect(tilelessNotes(notes, layout)).toEqual([
      { id: 'b', title: 'ST Notes' },
      { id: 'c', title: 'Safehouse' },
    ]);
  });

  it('is empty when every note has a tile', () => {
    const layout = [tile('notes:a'), tile('notes:b'), tile('notes:c')];
    expect(tilelessNotes(notes, layout)).toEqual([]);
  });
});

describe('noteTitle (tile title from first heading)', () => {
  it('takes the first markdown heading of any level', () => {
    expect(noteTitle('# The Sheriff')).toBe('The Sheriff');
    expect(noteTitle('### Small heading')).toBe('Small heading');
    expect(noteTitle('intro line\n## Second line is the heading')).toBe('Second line is the heading');
  });
  it('trims trailing closing hashes and surrounding space', () => {
    expect(noteTitle('##  Padded  ##')).toBe('Padded');
  });
  it('returns empty when there is no heading (caller falls back to "ST Notes")', () => {
    expect(noteTitle('just a paragraph, no heading here')).toBe('');
    expect(noteTitle('not a heading #inline')).toBe('');
    expect(noteTitle('')).toBe('');
  });
});

describe('clock coercion (ST-private clocks)', () => {
  it('reads valid clocks through and clamps fill into segment range', () => {
    const out = coerceStState({ ...V2, clocks: [
      { id: 'c1', name: 'Heat', segments: 6, filled: 3, condition: 'rising' },
      { id: 'c2', name: 'Over', segments: 4, filled: 99 },
    ] });
    expect(out.clocks).toEqual([
      { id: 'c1', name: 'Heat', segments: 6, filled: 3, condition: 'rising' },
      { id: 'c2', name: 'Over', segments: 4, filled: 4 },
    ]);
  });
  it('defaults bad segments to 4 and drops entries with no id', () => {
    const out = coerceStState({ ...V2, clocks: [
      { id: 'c1', name: 'Weird', segments: 5, filled: -2 },
      { name: 'no id', segments: 4, filled: 1 },
    ] });
    expect(out.clocks).toEqual([{ id: 'c1', name: 'Weird', segments: 4, filled: 0 }]);
  });
  it('yields no clocks for a missing or non-array field', () => {
    expect(coerceStState({ ...V2 }).clocks).toEqual([]);
    expect(coerceStState({ ...V2, clocks: 'nope' }).clocks).toEqual([]);
  });
});

describe('shouldCommitStWrite (stale-switch guard)', () => {
  it('commits when the intended code is still active', () => {
    expect(shouldCommitStWrite('77SZB', '77SZB')).toBe(true);
  });
  it('drops a write whose Coterie was switched away from', () => {
    expect(shouldCommitStWrite('77SZB', 'ABCDE')).toBe(false);
  });
  it('never commits with no active dashboard', () => {
    expect(shouldCommitStWrite('77SZB', null)).toBe(false);
    expect(shouldCommitStWrite(null, null)).toBe(false);
  });
});

describe('debounced write + guard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces rapid edits and only the last scheduled code fires', () => {
    const commits: string[] = [];
    let active: string | null = 'A';
    const save = debounce((code: string) => {
      if (shouldCommitStWrite(code, active)) commits.push(code);
    }, 3000);

    save('A');
    save('A'); // rapid re-edit within the window
    vi.advanceTimersByTime(3000);
    expect(commits).toEqual(['A']);

    /* Edit A, then switch to B before the timer fires: the stale A write is dropped. */
    save('A');
    active = 'B';
    vi.advanceTimersByTime(3000);
    expect(commits).toEqual(['A']); // no second entry; the A write was guarded out
  });
});
