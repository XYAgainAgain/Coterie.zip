import { describe, it, expect, beforeEach } from 'vitest';
import { character, BLANK_CHARACTER, addItem, toggleEquip } from '../state/character';
import { totalArmor, gameData } from '../state/derived';

beforeEach(() => {
  character.value = structuredClone(BLANK_CHARACTER);
  gameData.value = null;
});

const gargoyleData = {
  playbooks: [{ name: 'Gargoyle', perks: [{ name: 'Stone Hide', description: '' }] }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('totalArmor', () => {
  it('sums N-Armor on equipped items only', () => {
    const vest = addItem({ name: 'Vest', type: 'Wearable', tags: [{ base: 'N-Armor', param: '2' }] });
    toggleEquip(vest);
    addItem({ name: 'Spare', type: 'Wearable', tags: [{ base: 'N-Armor', param: '3' }] });
    expect(totalArmor.value).toEqual({ total: 2, vsAggravated: 0 });
  });

  it('adds Stone Hide = max(1, BP), flagged vsAggravated, for a Gargoyle', () => {
    character.value = { ...character.value, playbook: 'Gargoyle', bp: 3 };
    gameData.value = gargoyleData;
    expect(totalArmor.value).toEqual({ total: 3, vsAggravated: 3 });
  });

  it('floors Stone Hide at 1 when BP is 0, and stacks with item Armor', () => {
    const vest = addItem({ name: 'Vest', type: 'Wearable', tags: [{ base: 'N-Armor', param: '2' }] });
    toggleEquip(vest);
    character.value = { ...character.value, playbook: 'Gargoyle', bp: 0 };
    gameData.value = gargoyleData;
    expect(totalArmor.value).toEqual({ total: 3, vsAggravated: 1 });
  });

  it('grants no perk armor to a non-Gargoyle', () => {
    character.value = { ...character.value, playbook: 'Brujah', bp: 4 };
    gameData.value = { playbooks: [{ name: 'Brujah', perks: [] }] } as typeof gargoyleData;
    expect(totalArmor.value).toEqual({ total: 0, vsAggravated: 0 });
  });
});
