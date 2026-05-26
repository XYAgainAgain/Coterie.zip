import { signal } from '@preact/signals';
import type { Clock } from './character';
import type { CoterieStatName } from '../data/types';

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
}

export const coterieState = signal<CoterieState>({
  typeName: 'The Fang Gang',
  stats: { Clout: 0, Cohesion: 1, Charm: -1, Claim: 1, Currency: 1 },
  havenDescription: '',
  havenPositives: ['getaway vehicle', 'reliable fence', 'weapons stash'],
  havenNegatives: ['rival territory', 'persistent detective'],
  members: [
    {
      characterId: 'mock-bridget',
      slug: 'bridget-cavanaugh',
      name: 'Bridget Cavanaugh',
      pronouns: 'she/her',
      portraitUrl: 'https://i.imgur.com/tJbArZo.jpeg',
      ageBracket: 'Ancilla',
      bp: 2,
      playbook: 'Tremere',
    },
  ],
});

export function setCoterieType(name: string, stats: Record<CoterieStatName, number>) {
  coterieState.value = { ...coterieState.value, typeName: name, stats };
}

export function setHavenDescription(text: string) {
  coterieState.value = { ...coterieState.value, havenDescription: text };
}

export function adjustCoterieStat(stat: CoterieStatName, delta: number) {
  const current = coterieState.value.stats[stat] ?? 0;
  const next = Math.max(-3, Math.min(3, current + delta));
  coterieState.value = {
    ...coterieState.value,
    stats: { ...coterieState.value.stats, [stat]: next },
  };
}

/* Always 8 segments. Shared across all Coterie members' sheets. */
export const masqueradeClock = signal<Clock>({
  id: 'masquerade',
  name: 'The Masquerade',
  segments: 8,
  filled: 0,
});

export function fillMasquerade() {
  const c = masqueradeClock.value;
  if (c.filled >= c.segments) return;
  masqueradeClock.value = { ...c, filled: c.filled + 1 };
}

export function unfillMasquerade() {
  const c = masqueradeClock.value;
  if (c.filled <= 0) return;
  masqueradeClock.value = { ...c, filled: c.filled - 1 };
}
