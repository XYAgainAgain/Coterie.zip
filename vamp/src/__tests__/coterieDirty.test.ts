import { describe, it, expect, beforeEach } from 'vitest';
import {
  coterieState, blankCoterie, coterieDirtyFields, markCoterieDirty, clearCoterieDirty,
  setCoterieType, setHavenDescription, setHavenPicks, adjustCoterieStat,
} from '../state/coterie';

beforeEach(() => {
  coterieState.value = blankCoterie();
  clearCoterieDirty();
});

describe('per-field dirty set', () => {
  it('marks and clears individual fields without touching the rest', () => {
    markCoterieDirty('stats', 'havenDescription');
    clearCoterieDirty(['stats']);
    expect([...coterieDirtyFields.value]).toEqual(['havenDescription']);
  });

  it('clears everything with no args', () => {
    markCoterieDirty('typeName', 'stats', 'havenPositives');
    clearCoterieDirty();
    expect(coterieDirtyFields.value.size).toBe(0);
  });

  it('replaces the set object on change (signal subscribers must re-run)', () => {
    const before = coterieDirtyFields.value;
    markCoterieDirty('stats');
    expect(coterieDirtyFields.value).not.toBe(before);
  });
});

describe('mutators mark exactly the fields they touch', () => {
  it('adjustCoterieStat dirties stats only, replacing the stats ref', () => {
    const statsBefore = coterieState.value.stats;
    adjustCoterieStat('Clout', 1);
    expect([...coterieDirtyFields.value]).toEqual(['stats']);
    /* saveCoterie's guard-clear detects mid-write edits by ref replacement */
    expect(coterieState.value.stats).not.toBe(statsBefore);
    expect(coterieState.value.stats.Clout).toBe(1);
  });

  it('setHavenDescription dirties havenDescription only', () => {
    setHavenDescription('A crumbling brownstone.');
    expect([...coterieDirtyFields.value]).toEqual(['havenDescription']);
  });

  it('setHavenPicks dirties both haven pick fields', () => {
    setHavenPicks(['Hidden'], ['Creepy']);
    expect([...coterieDirtyFields.value].sort()).toEqual(['havenNegatives', 'havenPositives']);
  });

  it('setCoterieType dirties typeName and stats together', () => {
    setCoterieType('Nomads', { Clout: 1, Cohesion: 0, Charm: 0, Claim: -1, Currency: 0 });
    expect([...coterieDirtyFields.value].sort()).toEqual(['stats', 'typeName']);
  });
});
