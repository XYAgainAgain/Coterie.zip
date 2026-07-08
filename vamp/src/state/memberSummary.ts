/* Pure builder for the roster summary the player publishes to the Coterie doc on save.
   Firebase-free so the shape + no-op-skip logic stay unit-testable. */
import type { StatName } from '../data/types';
import { STAT_NAMES } from '../data/types';
import type { CharacterState } from './character';
import type { CoterieMember } from './coterie';

/* Everything a member entry carries except the transaction-supplied identity keys. */
export type MemberSummary = Omit<CoterieMember, 'characterId' | 'slug'>;

/* Build the roster summary from a character. The expanded vitals (stats, Hunger, Humanity,
   Disciplines, Convictions) let the ST roster quick-view render without opening each sheet.
   Disciplines are the raw slugs the character already stores; the reader maps to names. */
export function buildMemberSummary(state: CharacterState): MemberSummary {
  const pronouns = state.bio.pronouns.filter(Boolean).join('/');
  return {
    name: state.name || 'Unnamed',
    pronouns: pronouns || '?/?',
    portraitUrl: state.portraits[0]?.url ?? null,
    ageBracket: state.ageBracket,
    bp: state.bp,
    playbook: state.playbook,
    stats: { ...state.stats },
    hunger: state.hunger,
    humanity: state.humanity,
    disciplines: [...state.unlockedDisciplines],
    convictions: state.convictions.filter(Boolean),
  };
}

function arraysEqual(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

function statsEqual(a: Record<StatName, number> | undefined, b: Record<StatName, number> | undefined): boolean {
  if (!a || !b) return a === b;
  return STAT_NAMES.every(s => (a[s] ?? 0) === (b[s] ?? 0));
}

/* True when a re-publish would be a no-op. Compares base fields plus the expanded ones,
   so an old-shape entry (new fields absent) differs once and upgrades itself. */
export function memberSummaryEqual(
  current: Partial<MemberSummary> | undefined,
  next: MemberSummary,
): boolean {
  if (!current) return false;
  return current.name === next.name
    && current.pronouns === next.pronouns
    && current.portraitUrl === next.portraitUrl
    && current.ageBracket === next.ageBracket
    && current.bp === next.bp
    && current.playbook === next.playbook
    && current.hunger === next.hunger
    && current.humanity === next.humanity
    && statsEqual(current.stats, next.stats)
    && arraysEqual(current.disciplines, next.disciplines)
    && arraysEqual(current.convictions, next.convictions);
}
