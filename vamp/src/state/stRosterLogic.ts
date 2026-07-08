/* Pure (Firebase-free) core for the Storyteller roster: the dashboard gate, the consent
   partition, and slug→name mapping. The Firestore reads live in persistence.ts. */
import type { StatName } from '../data/types';
import type { Clock, Debt } from './character';

/* A Conviction's associated Touchstone, trimmed to what the roster card shows. */
export interface RosterTouchstone {
  name: string;
  description: string;
}

export interface StRosterVitals {
  hunger: number;
  humanity: number;
  harm: { superficial: number; aggravated: number };
  maxHP: number;
  stats: Record<StatName, number>;
  disciplines: string[]; /* raw slugs; the card maps them to display names */
  convictions: string[];
  /* Paired by index with convictions; a missing entry means no Touchstone named yet. */
  touchstones: RosterTouchstone[];
}

/* One roster card. Identity always comes from the published member summary; vitals are
   present only for a consented member (null = locked, so no gated data reaches the card). */
export interface StRosterEntry {
  characterId: string;
  slug: string;
  name: string;
  pronouns: string;
  portraitUrl: string | null;
  playbook: string;
  ageBracket: string;
  consented: boolean;
  vitals: StRosterVitals | null;
  /* The player's custom-theme accent hex, for color-coding their Initiative row (null = no custom
     theme, or locked; the row falls back to a neutral accent). Consented-only, same gating as vitals. */
  themeAccent: string | null;
  /* Personal clocks feed the All-Clocks tile. Populated only for a consented member (the
     gated read), so a locked card never leaks them; empty for anyone else. */
  clocks: Clock[];
  /* Debts feed the Debt Tracker tile; consented-only, same gating as clocks. */
  debts: Debt[];
}

/* The dashboard gate: the viewer is this Coterie's Storyteller. */
export function isStorytellerOf(storytellerUid: string | null | undefined, uid: string | null | undefined): boolean {
  return !!uid && !!storytellerUid && storytellerUid === uid;
}

/* A character consents to THIS Storyteller only when its stConsent uid names them. */
export function consentMatchesSt(consentUid: string | null | undefined, stUid: string | null | undefined): boolean {
  return !!stUid && !!consentUid && consentUid === stUid;
}

export function partitionByConsent(entries: StRosterEntry[]): { consented: StRosterEntry[]; locked: StRosterEntry[] } {
  const consented: StRosterEntry[] = [];
  const locked: StRosterEntry[] = [];
  for (const e of entries) (e.consented ? consented : locked).push(e);
  return { consented, locked };
}

/* Map a Discipline slug to its display name, falling back to the slug when unmapped. */
export function disciplineName(slug: string, disciplines: readonly { slug: string; name: string }[] | null | undefined): string {
  return disciplines?.find(d => d.slug === slug)?.name ?? slug;
}

/* Split one character's debts into the Debt Tracker's two columns, from the ST's POV:
   'owed' = owed TO that character, 'owe' = that character owes someone. */
export function partitionDebts(debts: Debt[]): { owed: Debt[]; owe: Debt[] } {
  const owed: Debt[] = [];
  const owe: Debt[] = [];
  for (const d of debts) (d.direction === 'owed' ? owed : owe).push(d);
  return { owed, owe };
}

/* Consented members that actually carry debts, each pre-split into columns. Locked members
   (null vitals / no debts array) never appear, so no gated data leaks. */
export function rosterDebtGroups(
  entries: StRosterEntry[],
): { characterId: string; name: string; owed: Debt[]; owe: Debt[] }[] {
  return entries
    .filter(e => e.consented && e.debts.length > 0)
    .map(e => ({ characterId: e.characterId, name: e.name, ...partitionDebts(e.debts) }));
}
