import { signal } from '@preact/signals';
import type { Clock } from './character';
import type { CoterieStatName, StatName, Item, Gift } from '../data/types';
import type { RollLogEntry } from '../dice/types';

export interface CoterieMember {
  characterId: string;
  slug: string;
  name: string;
  pronouns: string;
  portraitUrl: string | null;
  ageBracket: string;
  bp: number;
  playbook: string;
  /* Expanded summary the player publishes for the ST roster quick-view. All optional:
     docs written before this landed lack them. Disciplines are the raw slugs. */
  stats?: Record<StatName, number>;
  hunger?: number;
  humanity?: number;
  disciplines?: string[];
  convictions?: string[];
  /* Table-owned Initiative for the ST Initiative ladder. NOT part of the published summary:
     both the player (SceneTools) and the ST write it via a members-array transaction, so
     syncMemberToCoterie must preserve it rather than overwrite. */
  initiative?: number;
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
  /* Shared live roll log, capped at 50, newest-first. Externally owned (any member
     appends via transaction), so it always applies from snapshots like havenItems. */
  diceRolls: RollLogEntry[];
  /* The claimed Storyteller's uid, or null if unclaimed. Externally owned: set by claim,
     cleared by step-down or member kick; applies from snapshots like the roster. */
  storytellerUid: string | null;
  /* Open kick-vote: uids of members who voted to remove the ST. Externally owned
     (transactional writes); unanimity vs live memberUids resolves inside the transaction. */
  stKickVotes: string[];
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
    diceRolls: [],
    storytellerUid: null,
    stKickVotes: [],
  };
}

export const coterieState = signal<CoterieState>(blankCoterie());

/* The owned (non-transactional) Coterie fields this client saves directly. */
export type CoterieOwnedField = 'typeName' | 'stats' | 'havenDescription' | 'havenPositives' | 'havenNegatives';

/* Per-field dirty set: a marked field wins over incoming snapshots until its own save
   lands (last-write-wins per whole field), so edits to different fields can't clobber. */
export const coterieDirtyFields = signal<ReadonlySet<CoterieOwnedField>>(new Set());

export function markCoterieDirty(...fields: CoterieOwnedField[]) {
  const next = new Set(coterieDirtyFields.value);
  for (const f of fields) next.add(f);
  coterieDirtyFields.value = next;
}

/* No args = clear everything (leave/switch/save-give-up). */
export function clearCoterieDirty(fields?: CoterieOwnedField[]) {
  if (!fields) {
    if (coterieDirtyFields.value.size > 0) coterieDirtyFields.value = new Set();
    return;
  }
  if (fields.length === 0) return;
  const next = new Set(coterieDirtyFields.value);
  for (const f of fields) next.delete(f);
  coterieDirtyFields.value = next;
}

export function setCoterieType(name: string, stats: Record<CoterieStatName, number>) {
  coterieState.value = { ...coterieState.value, typeName: name, stats };
  markCoterieDirty('typeName', 'stats');
}

export function setHavenDescription(text: string) {
  coterieState.value = { ...coterieState.value, havenDescription: text };
  markCoterieDirty('havenDescription');
}

export function setHavenPicks(havenPositives: string[], havenNegatives: string[]) {
  coterieState.value = { ...coterieState.value, havenPositives, havenNegatives };
  markCoterieDirty('havenPositives', 'havenNegatives');
}

export function adjustCoterieStat(stat: CoterieStatName, delta: number) {
  const current = coterieState.value.stats[stat] ?? 0;
  const next = Math.max(-3, Math.min(3, current + delta));
  coterieState.value = {
    ...coterieState.value,
    stats: { ...coterieState.value.stats, [stat]: next },
  };
  markCoterieDirty('stats');
  console.log('[CoterieSync] adjustCoterieStat', stat, '->', coterieState.value.stats[stat], 'dirty=', [...coterieDirtyFields.value]);
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
