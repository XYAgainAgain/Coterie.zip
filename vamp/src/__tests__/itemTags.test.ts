import { describe, it, expect } from 'vitest';
import { orderTags, tagDisplay, tagNumber, canEquip } from '../data/itemTags';
import type { TagRef, Item } from '../data/types';

describe('orderTags', () => {
  it('snaps leading slots to canonical order regardless of input order', () => {
    const tags: TagRef[] = [
      { base: 'Ignore-Armor' },
      { base: 'N-Armor', param: '2' },
      { base: 'N-Harm', param: '3' },
      { base: 'Range', param: 'Close' },
    ];
    expect(orderTags(tags).leading.map(t => t.base)).toEqual([
      'N-Harm', 'Range', 'N-Armor', 'Ignore-Armor',
    ]);
  });

  it('snaps trailing slots and keeps the middle in storage order', () => {
    const tags: TagRef[] = [
      { base: 'Recharge-X', param: 'Dawn' },
      { base: 'Noisy' },
      { base: 'N-Charge', param: '3' },
      { base: 'Stylish' },
      { base: 'N-Use', param: '2' },
    ];
    const { middle, trailing } = orderTags(tags);
    expect(trailing.map(t => t.base)).toEqual(['N-Use', 'N-Charge', 'Recharge-X']);
    expect(middle.map(t => t.base)).toEqual(['Noisy', 'Stylish']);
  });

  it('treats unknown and custom bases as middle', () => {
    const { leading, middle, trailing } = orderTags([
      { base: 'Sturdy' },
      { base: '__custom__', custom: { label: 'Glowy', description: '' } },
    ]);
    expect(leading).toHaveLength(0);
    expect(trailing).toHaveLength(0);
    expect(middle).toHaveLength(2);
  });
});

describe('tagDisplay', () => {
  it('folds N- templates in front of the param', () => {
    expect(tagDisplay({ base: 'N-Harm', param: '3' })).toBe('3-Harm');
    expect(tagDisplay({ base: 'N-Use', param: '2' })).toBe('2-Use');
    expect(tagDisplay({ base: 'N-Armor', param: '1' })).toBe('1-Armor');
    expect(tagDisplay({ base: 'N-Fireproof', param: '3' })).toBe('3-Fireproof');
  });

  it('folds -X templates behind the param', () => {
    expect(tagDisplay({ base: 'Recharge-X', param: 'Dawn' })).toBe('Recharge-Dawn');
    expect(tagDisplay({ base: 'Explosive-X', param: 'Close' })).toBe('Explosive-Close');
  });

  it('renders Range as its band and the Trespasser sentinel with its type', () => {
    expect(tagDisplay({ base: 'Range', param: 'Close-Far' })).toBe('Close-Far');
    expect(tagDisplay({ base: '[Trespasser]-Warded', param: 'Ghoul' })).toBe('Ghoul-Warded');
    expect(tagDisplay({ base: '[Trespasser]-Warded' })).toBe('[Trespasser]-Warded');
  });

  it('renders custom labels and plain/no-param tags', () => {
    expect(tagDisplay({ base: '__custom__', custom: { label: 'Glowy', description: 'x' } })).toBe('Glowy');
    expect(tagDisplay({ base: 'Sturdy' })).toBe('Sturdy');
    expect(tagDisplay({ base: 'Ignore-Armor' })).toBe('Ignore-Armor');
  });
});

describe('tagNumber', () => {
  it('extracts the numeric param only for the matching base', () => {
    expect(tagNumber({ base: 'N-Armor', param: '2' }, 'N-Armor')).toBe(2);
    expect(tagNumber({ base: 'N-Harm', param: '3' }, 'N-Armor')).toBe(0);
    expect(tagNumber({ base: 'N-Armor' }, 'N-Armor')).toBe(0);
  });
});

describe('canEquip', () => {
  const base: Item = {
    id: 'x', name: '', type: 'Weapon', tags: [], description: '',
    qty: 1, equipped: false, isContainer: false, containerId: null,
  };

  it('allows loose items of an equippable type', () => {
    expect(canEquip(base)).toBe(true);
  });

  it('rejects items stowed in any container', () => {
    expect(canEquip({ ...base, containerId: 'stash' })).toBe(false);
    expect(canEquip({ ...base, containerId: 'haven' })).toBe(false);
  });

  it('rejects vehicles and structures', () => {
    expect(canEquip({ ...base, type: 'Vehicle' })).toBe(false);
    expect(canEquip({ ...base, type: 'Structure' })).toBe(false);
  });
});
