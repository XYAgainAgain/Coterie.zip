import { describe, it, expect, beforeEach } from 'vitest';
import {
  character, updateCharacter,
  setBP, setHunger, setHumanity, setHarm, setXP,
  fireXPTrigger, newNight, newSession,
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

  it('clamps stains to humanity', () => {
    setHumanity(3, 7);
    expect(character.value.stains).toBe(3);
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
