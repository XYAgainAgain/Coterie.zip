import { describe, it, expect, beforeEach } from 'vitest';
import {
  character, updateCharacter,
  setBP, setHunger, setHumanity, setHarm, setXP,
  fireXPTrigger, newNight, newSession,
  applyStain, resolveRemorse, superficialHealAmount, aggravatedHealAmount, slumberHeal,
  BP_HP, type CharacterState,
} from '../state/character';
import { maxHP, statCap } from '../state/derived';

function resetCharacter(overrides: Partial<CharacterState> = {}) {
  updateCharacter({
    bp: 1, hunger: 2, humanity: 8, stains: 1,
    harm: { superficial: 0, aggravated: 0 },
    xp: 0, xpTriggers: [false, false, false],
    ...overrides,
  });
}

describe('setBP', () => {
  beforeEach(() => resetCharacter());

  it('sets BP within range', () => {
    setBP(3);
    expect(character.value.bp).toBe(3);
  });

  it('clamps BP to 0 minimum', () => {
    setBP(-5);
    expect(character.value.bp).toBe(0);
  });

  it('clamps BP to 5 maximum', () => {
    setBP(99);
    expect(character.value.bp).toBe(5);
  });
});

describe('setHunger', () => {
  beforeEach(() => resetCharacter());

  it('sets hunger within range', () => {
    setHunger(4);
    expect(character.value.hunger).toBe(4);
  });

  it('clamps hunger to 0', () => {
    setHunger(-1);
    expect(character.value.hunger).toBe(0);
  });

  it('clamps hunger to 5', () => {
    setHunger(10);
    expect(character.value.hunger).toBe(5);
  });
});

describe('setHumanity', () => {
  beforeEach(() => resetCharacter());

  it('sets humanity and stains', () => {
    setHumanity(6, 2);
    expect(character.value.humanity).toBe(6);
    expect(character.value.stains).toBe(2);
  });

  it('clamps humanity to 0–10', () => {
    setHumanity(-3, 0);
    expect(character.value.humanity).toBe(0);
    setHumanity(15, 0);
    expect(character.value.humanity).toBe(10);
  });

  it('clamps stains to the remaining track (10 − humanity)', () => {
    setHumanity(3, 12);
    expect(character.value.stains).toBe(7);
  });

  it('clamps stains to 0 minimum', () => {
    setHumanity(5, -2);
    expect(character.value.stains).toBe(0);
  });
});

describe('setHarm', () => {
  beforeEach(() => resetCharacter({ bp: 1 }));

  it('sets harm within HP limits', () => {
    setHarm(2, 1);
    expect(character.value.harm).toEqual({ superficial: 2, aggravated: 1 });
  });

  it('clamps aggravated to max HP', () => {
    setHarm(0, 100);
    const hp = BP_HP[character.value.bp];
    expect(character.value.harm.aggravated).toBe(hp);
  });

  it('clamps superficial to remaining HP after aggravated', () => {
    const hp = BP_HP[1]; // 6
    setHarm(100, 4);
    expect(character.value.harm.aggravated).toBe(4);
    expect(character.value.harm.superficial).toBe(hp - 4);
  });

  it('floors both at 0', () => {
    setHarm(-5, -3);
    expect(character.value.harm).toEqual({ superficial: 0, aggravated: 0 });
  });
});

describe('setXP', () => {
  beforeEach(() => resetCharacter());

  it('sets XP within range', () => {
    setXP(5);
    expect(character.value.xp).toBe(5);
  });

  it('clamps XP to 0–10', () => {
    setXP(-1);
    expect(character.value.xp).toBe(0);
    setXP(20);
    expect(character.value.xp).toBe(10);
  });
});

describe('fireXPTrigger', () => {
  beforeEach(() => resetCharacter({ xp: 0 }));

  it('fires a trigger and increments XP', () => {
    fireXPTrigger(0);
    expect(character.value.xpTriggers[0]).toBe(true);
    expect(character.value.xp).toBe(1);
  });

  it('does not double-fire', () => {
    fireXPTrigger(1);
    fireXPTrigger(1);
    expect(character.value.xp).toBe(1);
  });

  it('caps XP at 10 even with many triggers', () => {
    resetCharacter({ xp: 10, xpTriggers: [false, false, false] });
    fireXPTrigger(0);
    expect(character.value.xp).toBe(10);
  });
});

describe('newNight', () => {
  it('increments hunger by 1', () => {
    resetCharacter({ hunger: 2 });
    newNight();
    expect(character.value.hunger).toBe(3);
  });

  it('caps hunger at 5', () => {
    resetCharacter({ hunger: 5 });
    newNight();
    expect(character.value.hunger).toBe(5);
  });
});

describe('newSession', () => {
  it('resets all XP triggers', () => {
    resetCharacter({ xpTriggers: [true, true, false] });
    newSession();
    expect(character.value.xpTriggers).toEqual([false, false, false]);
  });
});

describe('BP → maxHP cascade', () => {
  beforeEach(() => resetCharacter());

  it('returns correct HP for each BP level', () => {
    for (const [bp, expectedHP] of Object.entries(BP_HP)) {
      setBP(Number(bp));
      expect(maxHP.value).toBe(expectedHP);
    }
  });

  it('updates statCap when BP changes', () => {
    setBP(0);
    expect(statCap.value).toBe(3);
    setBP(4);
    expect(statCap.value).toBe(5);
  });
});

describe('harm clamping against BP-derived HP', () => {
  it('clamps existing harm when BP decreases', () => {
    resetCharacter({ bp: 3 }); // HP = 12
    setHarm(8, 3);
    expect(character.value.harm).toEqual({ superficial: 8, aggravated: 3 });

    setBP(1); // HP drops to 6
    setHarm(character.value.harm.superficial, character.value.harm.aggravated);
    expect(character.value.harm.aggravated).toBeLessThanOrEqual(BP_HP[1]);
    expect(character.value.harm.superficial + character.value.harm.aggravated).toBeLessThanOrEqual(BP_HP[1]);
  });
});

describe('statCap full table', () => {
  beforeEach(() => resetCharacter());

  it('caps stats correctly at every BP level', () => {
    const expected: Record<number, number> = { 0: 3, 1: 3, 2: 3, 3: 4, 4: 5, 5: 5 };
    for (const [bp, cap] of Object.entries(expected)) {
      setBP(Number(bp));
      expect(statCap.value).toBe(cap);
    }
  });
});

describe('applyStain', () => {
  it('increments stains below the threshold', () => {
    expect(applyStain(8, 0)).toEqual({ humanity: 8, stains: 1, lostHumanity: false });
  });

  it('loses 1 Humanity and clears stains at 5 Stains', () => {
    // Humanity 4 leaves a 6-box track, so the 5-Stain rule trips before the track fills.
    expect(applyStain(4, 4)).toEqual({ humanity: 3, stains: 0, lostHumanity: true });
  });

  it('loses 1 Humanity when stains fill the remaining track at high Humanity', () => {
    // Humanity 8 has only 2 boxes left, so 2 Stains trips the loss well before 5.
    expect(applyStain(8, 1)).toEqual({ humanity: 7, stains: 0, lostHumanity: true });
  });

  it('floors Humanity at 0', () => {
    expect(applyStain(0, 4)).toEqual({ humanity: 0, stains: 0, lostHumanity: true });
  });
});

describe('resolveRemorse', () => {
  it('keeps Humanity and clears stains when rolling over stains', () => {
    expect(resolveRemorse(6, 2, 3)).toEqual({ humanity: 6, stains: 0, safe: true });
  });

  it('loses 1 Humanity when rolling equal to stains (not over)', () => {
    expect(resolveRemorse(6, 3, 3)).toEqual({ humanity: 5, stains: 0, safe: false });
  });

  it('loses 1 Humanity when rolling under stains', () => {
    expect(resolveRemorse(6, 4, 2)).toEqual({ humanity: 5, stains: 0, safe: false });
  });

  it('floors Humanity at 0 on failure', () => {
    expect(resolveRemorse(0, 3, 1)).toEqual({ humanity: 0, stains: 0, safe: false });
  });
});

describe('healing formulae', () => {
  it('mends Superficial equal to BP, minimum 1', () => {
    expect(superficialHealAmount(0)).toBe(1);
    expect(superficialHealAmount(1)).toBe(1);
    expect(superficialHealAmount(3)).toBe(3);
    expect(superficialHealAmount(5)).toBe(5);
  });

  it('repairs Aggravated equal to 1 + BP', () => {
    expect(aggravatedHealAmount(0)).toBe(1);
    expect(aggravatedHealAmount(1)).toBe(2);
    expect(aggravatedHealAmount(4)).toBe(5);
  });
});

describe('slumberHeal', () => {
  it('clears all Superficial when fed, regardless of Hunger', () => {
    const r = slumberHeal({ superficial: 4, aggravated: 0 }, 1, 5, true);
    expect(r.superficial).toBe(0);
    expect(r.superficialHealed).toBe(4);
  });

  it('leaves Superficial untouched when not fed', () => {
    const r = slumberHeal({ superficial: 4, aggravated: 0 }, 1, 1, false);
    expect(r.superficial).toBe(4);
    expect(r.superficialHealed).toBe(0);
  });

  it('heals 1 + BP Aggravated when bedded at 2 Hunger or below', () => {
    const r = slumberHeal({ superficial: 0, aggravated: 5 }, 2, 2, false);
    expect(r.aggravated).toBe(2); // 5 − (1 + 2)
    expect(r.aggravatedHealed).toBe(3);
  });

  it('heals no Aggravated when bedded above 2 Hunger', () => {
    const r = slumberHeal({ superficial: 0, aggravated: 5 }, 2, 3, false);
    expect(r.aggravated).toBe(5);
    expect(r.aggravatedHealed).toBe(0);
  });

  it('floors Aggravated at 0', () => {
    const r = slumberHeal({ superficial: 0, aggravated: 1 }, 5, 0, false);
    expect(r.aggravated).toBe(0);
    expect(r.aggravatedHealed).toBe(1);
  });
});

describe('newNight slumber healing', () => {
  it('heals Aggravated by 1 + BP when bedded at 2 Hunger, then bumps Hunger', () => {
    resetCharacter({ bp: 1, hunger: 2, harm: { superficial: 0, aggravated: 3 } });
    newNight();
    expect(character.value.harm.aggravated).toBe(1); // 3 − (1 + 1)
    expect(character.value.hunger).toBe(3);
  });

  it('does not heal Aggravated when bedded above 2 Hunger', () => {
    resetCharacter({ bp: 2, hunger: 3, harm: { superficial: 0, aggravated: 4 } });
    newNight();
    expect(character.value.harm.aggravated).toBe(4);
    expect(character.value.hunger).toBe(4);
  });

  it('clears Superficial when fed but leaves Aggravated at high Hunger', () => {
    resetCharacter({ bp: 1, hunger: 5, harm: { superficial: 4, aggravated: 2 } });
    newNight(true);
    expect(character.value.harm.superficial).toBe(0);
    expect(character.value.harm.aggravated).toBe(2);
    expect(character.value.hunger).toBe(5);
  });
});
