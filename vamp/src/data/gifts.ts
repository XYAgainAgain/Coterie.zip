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

/* Verbs for the "moved X to Y" toast; all read cleanly with a "to <zone>" tail.
   Kept separate from GIFT_VERBS so a hand-off and a self-move never sound alike. */
export const MOVE_VERBS = [
  'moved', 'shifted', 'relocated', 'shuffled', 'carried', 'ferried', 'carted',
  'hauled', 'stowed', 'whisked', 'sent', 'scooted', 'transferred', 'migrated',
  'shunted', 'spirited', 'schlepped', 'yeeted', 'teleported', 'beamed',
];

let lastMoveVerb: string | null = null;

export function pickMoveVerb(): string {
  const pool = lastMoveVerb ? MOVE_VERBS.filter(v => v !== lastMoveVerb) : MOVE_VERBS;
  const verb = pool[Math.floor(Math.random() * pool.length)];
  lastMoveVerb = verb;
  return verb;
}

/* "Scooted the Room to the Haven." — verb-varied twin of the hand-off toast. */
export function moveToast(itemName: string, zoneLabel: string): string {
  const verb = pickMoveVerb();
  return `${verb[0].toUpperCase()}${verb.slice(1)} ${itemName || 'item'} to ${zoneLabel}.`;
}

/* Grab verbs for moves that land On You; lets the toast drop the clunky "to On You" tail. */
export const TAKE_VERBS = [
  'yoinked', 'grabbed', 'swiped', 'pinched', 'scooped', 'nabbed', 'snagged',
  'snatched', 'pocketed', 'lifted', 'acquired', 'procured', 'requisitioned',
  'commandeered', 'claimed', 'liberated', 'filched', 'pilfered', 'picked up',
  "totally didn't steal",
];

let lastTakeVerb: string | null = null;

export function pickTakeVerb(): string {
  const pool = lastTakeVerb ? TAKE_VERBS.filter(v => v !== lastTakeVerb) : TAKE_VERBS;
  const verb = pool[Math.floor(Math.random() * pool.length)];
  lastTakeVerb = verb;
  return verb;
}

/* On-You twin of moveToast; drops the destination so it reads "Yoinked Crowbar." */
export function takeToast(itemName: string): string {
  const verb = pickTakeVerb();
  return `${verb[0].toUpperCase()}${verb.slice(1)} ${itemName || 'item'}.`;
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
