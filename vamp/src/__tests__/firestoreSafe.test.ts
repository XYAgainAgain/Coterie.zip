import { describe, it, expect, beforeEach } from 'vitest';
import { firestoreSafe } from '../state/firestoreSafe';
import { character, updateCharacter, fireXPTrigger, newSession, addClock } from '../state/character';

function hasUndefined(v: unknown): boolean {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) if (!(i in v) || v[i] === undefined || hasUndefined(v[i])) return true;
    return false;
  }
  if (v && typeof v === 'object') return Object.values(v).some(x => x === undefined || hasUndefined(x));
  return false;
}

describe('firestoreSafe', () => {
  it('drops undefined props and nulls undefined or sparse array slots in place', () => {
    const sparse: boolean[] = [];
    sparse[2] = true;
    const out = firestoreSafe({ a: undefined, b: 1, xs: sparse, nested: [{ c: undefined, d: [undefined, 2] }] });
    expect(out).toEqual({ b: 1, xs: [null, null, true], nested: [{ d: [null, 2] }] });
    expect('a' in out).toBe(false);
    expect(hasUndefined(out)).toBe(false);
  });

  it('passes primitives and null through untouched', () => {
    expect(firestoreSafe(null)).toBe(null);
    expect(firestoreSafe(0)).toBe(0);
    expect(firestoreSafe('x')).toBe('x');
  });
});

describe('sheet mutations never introduce undefined', () => {
  beforeEach(() => updateCharacter({ xp: 0, xpTriggers: [], clocks: [] }));

  it('fireXPTrigger on a later index keeps the array dense', () => {
    fireXPTrigger(2);
    expect(character.value.xpTriggers).toEqual([false, false, true]);
    expect(hasUndefined(character.value.xpTriggers)).toBe(false);
  });

  it('newSession densifies an already-sparse array', () => {
    const sparse: boolean[] = [];
    sparse[1] = true;
    updateCharacter({ xpTriggers: sparse });
    newSession();
    expect(character.value.xpTriggers).toEqual([false, false]);
  });

  it('addClock without a condition omits the key entirely', () => {
    addClock('Rent', 4);
    const clock = character.value.clocks[0];
    expect('condition' in clock).toBe(false);
    addClock('Heat', 6, 'cops show up');
    expect(character.value.clocks[1].condition).toBe('cops show up');
  });
});
