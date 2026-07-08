import { describe, it, expect } from 'vitest';
import {
  isStorytellerOf, consentMatchesSt, partitionByConsent, disciplineName,
  partitionDebts, rosterDebtGroups,
  type StRosterEntry,
} from '../state/stRosterLogic';
import type { Debt } from '../state/character';

function entry(id: string, consented: boolean, debts: Debt[] = []): StRosterEntry {
  return {
    characterId: id, slug: id, name: id, pronouns: '', portraitUrl: null,
    playbook: '', ageBracket: '', consented, vitals: null, themeAccent: null, clocks: [], debts,
  };
}

const debt = (id: string, direction: 'owed' | 'owe'): Debt =>
  ({ id, who: id, text: `${id} text`, direction, state: 'empty' });

describe('isStorytellerOf (dashboard gate)', () => {
  it('passes only when the storyteller uid matches the viewer', () => {
    expect(isStorytellerOf('sam', 'sam')).toBe(true);
    expect(isStorytellerOf('sam', 'jaz')).toBe(false);
  });
  it('fails on an unclaimed Coterie or a signed-out viewer', () => {
    expect(isStorytellerOf(null, 'sam')).toBe(false);
    expect(isStorytellerOf('sam', null)).toBe(false);
    expect(isStorytellerOf(undefined, undefined)).toBe(false);
  });
});

describe('consentMatchesSt', () => {
  it('is true only when the consent uid names this Storyteller', () => {
    expect(consentMatchesSt('sam', 'sam')).toBe(true);
    expect(consentMatchesSt('vi', 'sam')).toBe(false);
  });
  it('treats missing consent or a null ST as no consent', () => {
    expect(consentMatchesSt(null, 'sam')).toBe(false);
    expect(consentMatchesSt('sam', null)).toBe(false);
    expect(consentMatchesSt(undefined, undefined)).toBe(false);
  });
});

describe('partitionByConsent', () => {
  it('splits consented from locked, preserving order within each group', () => {
    const rows = [entry('a', true), entry('b', false), entry('c', true), entry('d', false)];
    const { consented, locked } = partitionByConsent(rows);
    expect(consented.map(e => e.characterId)).toEqual(['a', 'c']);
    expect(locked.map(e => e.characterId)).toEqual(['b', 'd']);
  });
  it('handles an all-locked or empty roster', () => {
    expect(partitionByConsent([]).consented).toEqual([]);
    expect(partitionByConsent([entry('a', false)]).consented).toEqual([]);
  });
});

describe('partitionDebts (ST-POV columns)', () => {
  it("splits a character's debts into owed-to-them and they-owe", () => {
    const debts = [debt('a', 'owed'), debt('b', 'owe'), debt('c', 'owed')];
    const { owed, owe } = partitionDebts(debts);
    expect(owed.map(d => d.id)).toEqual(['a', 'c']);
    expect(owe.map(d => d.id)).toEqual(['b']);
  });
  it('handles a character with no debts', () => {
    expect(partitionDebts([])).toEqual({ owed: [], owe: [] });
  });
});

describe('rosterDebtGroups (Debt Tracker aggregation)', () => {
  it('groups only consented members that carry debts, pre-split per column', () => {
    const roster = [
      entry('locked', false, [debt('x', 'owed')]),   // excluded: not consented
      entry('empty', true, []),                       // excluded: no debts
      entry('moe', true, [debt('a', 'owed'), debt('b', 'owe')]),
    ];
    const groups = rosterDebtGroups(roster);
    expect(groups).toHaveLength(1);
    expect(groups[0].characterId).toBe('moe');
    expect(groups[0].owed.map(d => d.id)).toEqual(['a']);
    expect(groups[0].owe.map(d => d.id)).toEqual(['b']);
  });
  it('is empty for an all-locked or debt-free roster', () => {
    expect(rosterDebtGroups([entry('a', false, [debt('x', 'owe')]), entry('b', true, [])])).toEqual([]);
  });
});

describe('disciplineName (slug -> name with fallback)', () => {
  const disciplines = [
    { slug: 'auspex', name: 'Auspex' },
    { slug: 'thin-blood-alchemy', name: 'Thin-Blood Alchemy' },
  ];
  it('maps a known slug to its display name', () => {
    expect(disciplineName('auspex', disciplines)).toBe('Auspex');
    expect(disciplineName('thin-blood-alchemy', disciplines)).toBe('Thin-Blood Alchemy');
  });
  it('falls back to the raw slug when unmapped or data is missing', () => {
    expect(disciplineName('mystery-power', disciplines)).toBe('mystery-power');
    expect(disciplineName('auspex', null)).toBe('auspex');
    expect(disciplineName('auspex', undefined)).toBe('auspex');
  });
});
