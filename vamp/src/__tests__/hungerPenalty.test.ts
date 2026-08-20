import { describe, it, expect } from 'vitest';
import { character, setHunger } from '../state/character';
import { hungerPenalty, feedingRoll, toggleFeedingRoll } from '../state/derived';

describe('hungerPenalty (hunger.md ladder)', () => {
  it('is 0 below 3 Hunger, −1 at 3, −2 at 4 and 5', () => {
    const expected: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: -1, 4: -2, 5: -2 };
    for (const [h, pen] of Object.entries(expected)) {
      setHunger(Number(h));
      expect(hungerPenalty.value).toBe(pen);
    }
    expect(character.value.hunger).toBe(5);
  });

  it('feedingRoll is an ephemeral one-shot toggle, never part of character state', () => {
    expect(feedingRoll.value).toBe(false);
    toggleFeedingRoll();
    expect(feedingRoll.value).toBe(true);
    expect('feedingRoll' in character.value).toBe(false);
    toggleFeedingRoll();
    expect(feedingRoll.value).toBe(false);
  });
});
