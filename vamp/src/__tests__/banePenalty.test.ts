import { describe, it, expect, vi, beforeEach } from 'vitest';
import { character } from '../state/character';
import { banePenalty } from '../state/derived';

const dice = { next: [3, 4] };
vi.mock('../dice/DiceFairness', () => ({
  rollD6: () => 1,
  rollMultipleD6: () => [...dice.next],
  rollWithAdvantage: () => ({ kept: [...dice.next], dropped: [1] }),
  rollWithDisadvantage: () => ({ kept: [...dice.next], dropped: [6] }),
}));
vi.mock('../dice/rollLog', () => ({ recordRoll: () => {} }));
vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

describe('Inner Song Bane (Daughter of Cacophony)', () => {
  beforeEach(() => {
    character.value = { ...character.value, playbook: 'Daughter of Cacophony', bp: 3, hunger: 0, modifiers: [] };
  });

  it('penalizes by BP with a floor of 1, only for that Playbook', () => {
    expect(banePenalty.value).toBe(-3);
    character.value = { ...character.value, bp: 0 };
    expect(banePenalty.value).toBe(-1);
    character.value = { ...character.value, playbook: 'Toreador' };
    expect(banePenalty.value).toBe(0);
  });

  it('applies to Wits only, lifts on two sixes, and skips bare rolls', async () => {
    const { rollMove } = await import('../dice/rollMove');
    expect(rollMove('Wits').baneMod).toBe(-3);
    expect(rollMove('Blood').baneMod).toBe(0);
    expect(rollMove('Wits', { bare: true }).baneMod).toBe(0);
    dice.next = [6, 6];
    const r = rollMove('Wits');
    expect(r.baneMod).toBe(0);
    expect(r.result.total).toBe(12 + character.value.stats.Wits);
  });
});
