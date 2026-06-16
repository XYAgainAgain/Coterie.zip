import { describe, it, expect } from 'vitest';
import { GIFT_VERBS, pickVerb, giftDisplayName, indefiniteArticle, giftRecipientToast } from '../data/gifts';
import type { Gift, Item } from '../data/types';

const item = (over: Partial<Item> = {}): Item => ({
  id: 'i', name: 'SMG', type: 'Weapon', tags: [], description: '',
  qty: 1, equipped: false, isContainer: false, containerId: null, ...over,
});

const gift = (over: Partial<Gift> = {}): Gift => ({
  id: 'g', item: item(), fromCharacterId: 'a', fromDisplayName: 'Moe',
  toCharacterId: 'b', verb: 'chucked', createdAt: 0, ...over,
});

describe('pickVerb', () => {
  it('always returns a known verb and never repeats back-to-back', () => {
    let prev = '';
    for (let i = 0; i < 60; i++) {
      const v = pickVerb();
      expect(GIFT_VERBS).toContain(v);
      expect(v).not.toBe(prev);
      prev = v;
    }
  });
});

describe('giftDisplayName', () => {
  it('uses a quoted nickname, quotes stripped', () => {
    expect(giftDisplayName('Maurice "Moe" Green')).toBe('Moe');
  });
  it('uses honorific + last name', () => {
    expect(giftDisplayName('Dr. Eleanor Vance')).toBe('Dr. Vance');
  });
  it('combines honorific + nickname when both present', () => {
    expect(giftDisplayName("Mr. Maurice 'Moe' Green")).toBe('Mr. Moe');
  });
  it('falls back to the first word', () => {
    expect(giftDisplayName('Vana Virabyan')).toBe('Vana');
  });
  it('returns a buddy fallback when empty', () => {
    expect(['An ally', 'A buddy']).toContain(giftDisplayName('   '));
  });
});

describe('indefiniteArticle', () => {
  it('uses spoken sound, not bare first letter', () => {
    expect(indefiniteArticle('SMG')).toBe('an');
    expect(indefiniteArticle('F-150')).toBe('an');
    expect(indefiniteArticle('hour')).toBe('an');
    expect(indefiniteArticle('honest mistake')).toBe('an');
    expect(indefiniteArticle('university')).toBe('a');
    expect(indefiniteArticle('unicorn')).toBe('a');
    expect(indefiniteArticle('crowbar')).toBe('a');
    expect(indefiniteArticle('apple')).toBe('an');
    expect(indefiniteArticle('Glock')).toBe('a');
  });
});

describe('giftRecipientToast', () => {
  it('uses the article for a single item', () => {
    expect(giftRecipientToast(gift())).toBe('Moe chucked you an SMG!');
  });
  it('uses the count for a stack, no pluralization', () => {
    expect(giftRecipientToast(gift({ item: item({ name: 'Blood Bag', qty: 3 }) })))
      .toBe('Moe chucked you 3 Blood Bag!');
  });
});
