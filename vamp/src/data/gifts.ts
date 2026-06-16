import type { Gift } from './types';

/* 20 plausible verbs + 5 deliberately silly ones for the hand-off toast. */
export const GIFT_VERBS = [
  'tossed', 'threw', 'chucked', 'handed', 'slid', 'lobbed', 'passed', 'gave',
  'flipped', 'pitched', 'hurled', 'flung', 'slung', 'bowled', 'shoved',
  'delivered', 'dealt', 'palmed', 'launched', 'sent',
  'alley-ooped', 'yeeted', 'fastballed', 'drop-kicked', 'wormholed',
];

/* Device-local; excludes the previous pick so you never see the same verb twice
   in a row. Resets on reload, which is fine — it's pure flavor. */
let lastVerb: string | null = null;

export function pickVerb(): string {
  const pool = lastVerb ? GIFT_VERBS.filter(v => v !== lastVerb) : GIFT_VERBS;
  const verb = pool[Math.floor(Math.random() * pool.length)];
  lastVerb = verb;
  return verb;
}

const HONORIFICS = ['Ms.', 'Mr.', 'Mrs.', 'Mx.', 'Dr.', 'Prof.', 'Miss', 'Sir', 'Dame', 'Lady', 'Lord'];

/* The label shown in the recipient's toast. Prefers a quoted nickname, then an
   honorific + last name, then the first word; random buddy fallback if empty. */
export function giftDisplayName(fullName: string): string {
  const name = (fullName ?? '').trim();
  if (!name) return Math.random() < 0.5 ? 'An ally' : 'A buddy';

  const quote = name.match(/["']([^"']+)["']/);
  const nick = quote ? quote[1].trim() : null;
  const words = name.split(/\s+/);
  const honorific = HONORIFICS.find(h => name.toLowerCase().startsWith(h.toLowerCase()));

  if (honorific) return `${honorific} ${nick ?? words[words.length - 1]}`;
  if (nick) return nick;
  return words[0];
}

/* Letters whose spoken name opens with a vowel sound (so "an F", "an SMG"). */
const LETTER_VOWEL_SOUND = new Set('AEFHILMNORSX'.split(''));

function isInitialism(w: string): boolean {
  const run = w.match(/^[A-Za-z]+/)?.[0] ?? '';
  return (run.length >= 2 && run === run.toUpperCase()) || /^[A-Z][-\d]/.test(w);
}

/* a vs an, by spoken sound rather than bare first letter. Nails SMG, hour, university. */
export function indefiniteArticle(word: string): 'a' | 'an' {
  const w = (word ?? '').trim();
  if (!w) return 'a';
  if (isInitialism(w)) return LETTER_VOWEL_SOUND.has(w[0].toUpperCase()) ? 'an' : 'a';
  const lower = w.toLowerCase();
  if (/^(hour|honest|heir|honou?r)/.test(lower)) return 'an';
  if (/^(uni|use|euro|ewe|one|once)/.test(lower)) return 'a';
  return /^[aeiou]/.test(lower) ? 'an' : 'a';
}

/* qty 1 -> article; qty > 1 -> the count (item name is NOT auto-pluralized). */
export function giftRecipientToast(gift: Gift): string {
  const itemName = gift.item.name || 'something';
  const amount = gift.item.qty > 1 ? String(gift.item.qty) : indefiniteArticle(itemName);
  return `${gift.fromDisplayName} ${gift.verb} you ${amount} ${itemName}!`;
}
