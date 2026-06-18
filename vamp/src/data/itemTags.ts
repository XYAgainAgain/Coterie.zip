import type { TagRef, Item, ItemType } from './types';

/* Reserved virtual container ids (not real items). */
export const STASH_ID = 'stash';
export const HAVEN_ID = 'haven';

export const CUSTOM_TAG = '__custom__';
export const RANGE_TAG = 'Range';

export const RANGE_BANDS = ['Intimate', 'Hand', 'Close', 'Far', 'Distant'];

/* Fold a min/max pair into one param: single band if equal, else "Min-Max". */
export function rangeParam(min: string, max: string): string {
  const lo = RANGE_BANDS.indexOf(min);
  const hi = RANGE_BANDS.indexOf(max);
  if (lo < 0 || hi < 0) return min || max;
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
  return a === b ? RANGE_BANDS[a] : `${RANGE_BANDS[a]}-${RANGE_BANDS[b]}`;
}

/* Single bands plus every min-before-max span, valid by construction. */
export const RANGE_OPTIONS: string[] = RANGE_BANDS.flatMap((band, i) =>
  RANGE_BANDS.slice(i).map((to) => (to === band ? band : `${band}-${to}`)),
);

type TagSlot = 'leading' | 'middle' | 'trailing';
type TagParamKind = 'none' | 'number' | 'text';

interface TemplateTagMeta {
  slot: TagSlot;
  param: TagParamKind;
}

/* Presentation metadata for tags with a numeric/param slot. Lives in the app, not
   the parser, which stays pure-content. Bases absent here are plain middle tags. */
export const TEMPLATE_TAGS: Record<string, TemplateTagMeta> = {
  'N-Harm': { slot: 'leading', param: 'number' },
  Range: { slot: 'leading', param: 'text' },
  'N-Armor': { slot: 'leading', param: 'number' },
  'Ignore-Armor': { slot: 'leading', param: 'none' },
  'Ignore-BP-Armor': { slot: 'leading', param: 'none' },
  'N-Use': { slot: 'trailing', param: 'number' },
  'N-Charge': { slot: 'trailing', param: 'number' },
  'Recharge-X': { slot: 'trailing', param: 'text' },
  'Explosive-X': { slot: 'middle', param: 'text' },
  'N-Fireproof': { slot: 'middle', param: 'number' },
  '[Trespasser]-Warded': { slot: 'middle', param: 'text' },
};

/* Must list every leading/trailing base in TEMPLATE_TAGS; an omitted one sorts last
   (via rankIn) instead of jumping to the front, degrading gracefully if unsynced. */
const LEADING_ORDER = ['N-Harm', 'Range', 'N-Armor', 'Ignore-Armor', 'Ignore-BP-Armor'];
const TRAILING_ORDER = ['N-Use', 'N-Charge', 'Recharge-X'];

const rankIn = (order: string[], base: string): number => {
  const i = order.indexOf(base);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
};

export interface OrderedTags {
  leading: TagRef[];
  middle: TagRef[];
  trailing: TagRef[];
}

/* Split tags into fixed leading/trailing slots plus the player-ordered (draggable)
   middle. The item name renders between leading and middle. */
export function orderTags(tags: TagRef[]): OrderedTags {
  const leading: TagRef[] = [];
  const middle: TagRef[] = [];
  const trailing: TagRef[] = [];

  for (const t of tags) {
    const slot = TEMPLATE_TAGS[t.base]?.slot ?? 'middle';
    if (slot === 'leading') leading.push(t);
    else if (slot === 'trailing') trailing.push(t);
    else middle.push(t);
  }

  leading.sort((a, b) => rankIn(LEADING_ORDER, a.base) - rankIn(LEADING_ORDER, b.base));
  trailing.sort((a, b) => rankIn(TRAILING_ORDER, a.base) - rankIn(TRAILING_ORDER, b.base));

  return { leading, middle, trailing };
}

/* Display string for a tag. N- templates fold the param in front (N-Harm + '3' ->
   '3-Harm'); -X templates fold it behind (Recharge-X + 'Dawn' -> Recharge-Dawn). */
export function tagDisplay(ref: TagRef): string {
  if (ref.base === CUSTOM_TAG) return ref.custom?.label ?? '';
  if (ref.base === RANGE_TAG) return ref.param ?? 'Range';
  if (ref.base === '[Trespasser]-Warded') {
    return ref.param ? `${ref.param}-Warded` : '[Trespasser]-Warded';
  }
  if (ref.param) {
    if (ref.base.startsWith('N-')) return `${ref.param}-${ref.base.slice(2)}`;
    if (ref.base.endsWith('-X')) return `${ref.base.slice(0, -1)}${ref.param}`;
  }
  return ref.base;
}

/* The numeric Harm/Armor/Use/etc. value a tag carries, or 0 if not that template. */
export function tagNumber(ref: TagRef, base: string): number {
  if (ref.base !== base) return 0;
  const n = parseInt(ref.param ?? '', 10);
  return Number.isFinite(n) ? n : 0;
}

/* Vehicles and Structures aren't carried on your person, so they get no equip pip. */
const EQUIPPABLE_TYPES: ReadonlySet<ItemType> = new Set<ItemType>([
  'Weapon', 'Wearable', 'Artifact', 'Consumable', 'Tech', 'Intel', 'Miscellaneous',
]);

export function isEquippableType(type: ItemType): boolean {
  return EQUIPPABLE_TYPES.has(type);
}

/* Only loose-carried items of an equippable type can be at the ready. */
export function canEquip(item: Item): boolean {
  return item.containerId === null && isEquippableType(item.type);
}
