import { describe, it, expect } from 'vitest';
import { BLANK_CHARACTER } from '../state/character';
import { startingXPPool } from '../state/derived';

const base = (over: Partial<typeof BLANK_CHARACTER>) => ({ ...BLANK_CHARACTER, ...over });
const flaw = (xpGain: string) => ({ name: xpGain, xpGain });
const bane = (xpGain: string) => ({ baneName: xpGain, xpGain, fromPlaybookBane: false });

describe('startingXPPool', () => {
  it('grants BP × 2 with a floor of BP 1', () => {
    expect(startingXPPool(base({ bp: 3 }))).toBe(6);
    expect(startingXPPool(base({ bp: 1 }))).toBe(2);
    expect(startingXPPool(base({ bp: 0 }))).toBe(2); // max(1, bp)
  });

  it('adds Flaw, Folkloric Bane, and Both-Bane gains', () => {
    expect(startingXPPool(base({ bp: 1, flaws: [flaw('+4 XP')] }))).toBe(6);
    expect(startingXPPool(base({ bp: 1, folkloricBanes: [bane('+3 XP')] }))).toBe(5);
    expect(startingXPPool(base({ bp: 1, baneChoice: 'both' }))).toBe(7);
  });

  it('caps the pool at 10', () => {
    expect(startingXPPool(base({ bp: 3, flaws: [flaw('+8 XP'), flaw('+4 XP')] }))).toBe(10);
  });

  it('depends only on the selected set, not order', () => {
    const a = base({ bp: 1, flaws: [flaw('+4 XP'), flaw('+2 XP')] });
    const b = base({ bp: 1, flaws: [flaw('+2 XP'), flaw('+4 XP')] });
    expect(startingXPPool(a)).toBe(startingXPPool(b));
  });
});
