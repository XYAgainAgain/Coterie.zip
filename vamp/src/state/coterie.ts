import { signal } from '@preact/signals';
import type { Clock } from './character';
import type { CoterieStatName, Item, Gift } from '../data/types';

export interface CoterieMember {
  characterId: string;
  slug: string;
  name: string;
  pronouns: string;
  portraitUrl: string | null;
  ageBracket: string;
  bp: number;
  playbook: string;
}

export interface CoterieState {
  typeName: string;
  stats: Record<CoterieStatName, number>;
  havenDescription: string;
  havenPositives: string[];
  havenNegatives: string[];
  members: CoterieMember[];
  /* Shared inventory and pending hand-offs. Externally owned (any member writes via
     transaction), so they always apply from snapshots — never dirty-gated. */
  havenItems: Item[];
  giftQueue: Gift[];
  /* The claimed Storyteller's uid, or null if unclaimed. Externally owned: set by claim,
     cleared by step-down or member kick; applies from snapshots like the roster. */
  storytellerUid: string | null;
}

export function blankCoterie(): CoterieState {
  return {
    typeName: '',
    stats: { Clout: 0, Cohesion: 0, Charm: 0, Claim: 0, Currency: 0 },
    havenDescription: '',
    havenPositives: [],
    havenNegatives: [],
    members: [],
    havenItems: [],
    giftQueue: [],
    storytellerUid: null,
  };
}

export const coterieState = signal<CoterieState>(blankCoterie());

/* Set when this client makes a local edit to the shared Coterie fields, cleared
   once saveCoterie persists. While true, the realtime listener won't overwrite
   those fields from an incoming snapshot, so an unrelated roster/clock write
   can't revert an in-flight stat or Haven edit before it's saved. */
export const coterieDirty = signal(false);

export function setCoterieType(name: string, stats: Record<CoterieStatName, number>) {
  coterieState.value = { ...coterieState.value, typeName: name, stats };
  coterieDirty.value = true;
}

export function setHavenDescription(text: string) {
  coterieState.value = { ...coterieState.value, havenDescription: text };
  coterieDirty.value = true;
}

export function setHavenPicks(havenPositives: string[], havenNegatives: string[]) {
  coterieState.value = { ...coterieState.value, havenPositives, havenNegatives };
  coterieDirty.value = true;
}

export function adjustCoterieStat(stat: CoterieStatName, delta: number) {
  const current = coterieState.value.stats[stat] ?? 0;
  const next = Math.max(-3, Math.min(3, current + delta));
  coterieState.value = {
    ...coterieState.value,
    stats: { ...coterieState.value.stats, [stat]: next },
  };
  coterieDirty.value = true;
  console.log('[CoterieSync] adjustCoterieStat', stat, '->', coterieState.value.stats[stat], 'dirty=', coterieDirty.value);
}

/* Always 8 segments. Shared across all Coterie members' sheets. */
export const masqueradeClock = signal<Clock>({
  id: 'masquerade',
  name: 'The Masquerade',
  segments: 8,
  filled: 0,
});

/* Guards a just-changed local clock value from being reverted by a stale remote
   snapshot before its own save lands. Cleared once saveCoterie persists it. */
export const masqueradeDirty = signal(false);

export function fillMasquerade() {
  const c = masqueradeClock.value;
  if (c.filled >= c.segments) return;
  masqueradeDirty.value = true;
  masqueradeClock.value = { ...c, filled: c.filled + 1 };
}

export function unfillMasquerade() {
  const c = masqueradeClock.value;
  if (c.filled <= 0) return;
  masqueradeDirty.value = true;
  masqueradeClock.value = { ...c, filled: c.filled - 1 };
}
