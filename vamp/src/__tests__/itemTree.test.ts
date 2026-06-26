import { describe, it, expect } from 'vitest';
import { collectSubtree, isDescendant, isContainerItem } from '../data/itemTree';
import type { Item } from '../data/types';

function mk(id: string, containerId: string | null = null, extra: Partial<Item> = {}): Item {
  return { id, name: id, type: 'Miscellaneous', tags: [], description: '', qty: 1, equipped: false, isContainer: false, containerId, ...extra };
}

describe('collectSubtree', () => {
  it('returns just the root when it has no children', () => {
    expect(collectSubtree([mk('a'), mk('b')], 'a').map(i => i.id)).toEqual(['a']);
  });

  it('gathers the root and every descendant, any depth', () => {
    const items = [
      mk('room', 'haven', { isContainer: true }),
      mk('bag', 'room', { isContainer: true }),
      mk('pistol', 'bag'),
      mk('coffin', 'room', { isContainer: true }),
      mk('loose', 'haven'),
    ];
    expect(collectSubtree(items, 'room').map(i => i.id).sort()).toEqual(['bag', 'coffin', 'pistol', 'room']);
  });

  it('returns empty when the root id is absent', () => {
    expect(collectSubtree([mk('a')], 'missing')).toEqual([]);
  });

  it('does not hang on a malformed cycle', () => {
    expect(collectSubtree([mk('a', 'b'), mk('b', 'a')], 'a').map(i => i.id).sort()).toEqual(['a', 'b']);
  });
});

describe('isDescendant', () => {
  const items = [
    mk('room', 'haven', { isContainer: true }),
    mk('bag', 'room', { isContainer: true }),
    mk('pistol', 'bag'),
    mk('loose', 'haven'),
  ];

  it('is true for a nested child or grandchild', () => {
    expect(isDescendant(items, 'room', 'bag')).toBe(true);
    expect(isDescendant(items, 'room', 'pistol')).toBe(true);
  });

  it('is false for a sibling, an ancestor, or an unrelated item', () => {
    expect(isDescendant(items, 'bag', 'loose')).toBe(false);
    expect(isDescendant(items, 'pistol', 'room')).toBe(false);
  });

  it('is false for the item itself', () => {
    expect(isDescendant(items, 'room', 'room')).toBe(false);
  });

  it('does not hang on a malformed cycle', () => {
    const cyc = [mk('a', 'b'), mk('b', 'a')];
    expect(isDescendant(cyc, 'a', 'b')).toBe(true);
    expect(isDescendant(cyc, 'x', 'a')).toBe(false);
  });
});

describe('isContainerItem', () => {
  it('reads the legacy flag', () => {
    expect(isContainerItem(mk('a', null, { isContainer: true }))).toBe(true);
  });
  it('reads the Container tag', () => {
    expect(isContainerItem(mk('a', null, { tags: [{ base: 'Container' }] }))).toBe(true);
  });
  it('is false for a plain item', () => {
    expect(isContainerItem(mk('a'))).toBe(false);
  });
});
