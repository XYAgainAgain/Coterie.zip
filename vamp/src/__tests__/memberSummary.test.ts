import { describe, it, expect } from 'vitest';
import { buildMemberSummary, memberSummaryEqual, type MemberSummary } from '../state/memberSummary';
import { BLANK_CHARACTER, type CharacterState } from '../state/character';

function char(overrides: Partial<CharacterState> = {}): CharacterState {
  return { ...structuredClone(BLANK_CHARACTER), ...overrides };
}

describe('buildMemberSummary', () => {
  it('publishes base fields plus the expanded vitals', () => {
    const s = buildMemberSummary(char({
      name: 'Johnny Fangs',
      ageBracket: 'Neonate',
      bp: 2,
      playbook: 'Brujah',
      bio: { ...BLANK_CHARACTER.bio, pronouns: ['he', 'him'] },
      stats: { Blood: 1, Shadow: 0, Resolve: 2, Demeanor: -1, Wits: 1 },
      hunger: 3,
      humanity: 6,
      unlockedDisciplines: ['celerity', 'potence'],
      convictions: ['Never feed on children'],
    }));
    expect(s).toEqual({
      name: 'Johnny Fangs',
      pronouns: 'he/him',
      portraitUrl: null,
      ageBracket: 'Neonate',
      bp: 2,
      playbook: 'Brujah',
      stats: { Blood: 1, Shadow: 0, Resolve: 2, Demeanor: -1, Wits: 1 },
      hunger: 3,
      humanity: 6,
      disciplines: ['celerity', 'potence'],
      convictions: ['Never feed on children'],
    } satisfies MemberSummary);
  });

  it('falls back to placeholders for an empty character and drops blank convictions', () => {
    const s = buildMemberSummary(char());
    expect(s.name).toBe('Unnamed');
    expect(s.pronouns).toBe('?/?');
    expect(s.convictions).toEqual([]); // BLANK_CHARACTER.convictions is ['']
    expect(s.disciplines).toEqual([]);
  });

  it('uses the first portrait url', () => {
    const s = buildMemberSummary(char({
      portraits: [{ url: 'https://x/a.png', x: 50, y: 50, scale: 1 }],
    }));
    expect(s.portraitUrl).toBe('https://x/a.png');
  });
});

describe('memberSummaryEqual', () => {
  const base = () => buildMemberSummary(char({
    name: 'Lor', bp: 1, playbook: 'Tremere',
    stats: { Blood: 0, Shadow: 1, Resolve: 0, Demeanor: 0, Wits: 2 },
    hunger: 1, humanity: 7, unlockedDisciplines: ['auspex'], convictions: ['Loyalty'],
  }));

  it('true when identical', () => {
    expect(memberSummaryEqual(base(), base())).toBe(true);
  });

  it('false against an undefined current (first publish)', () => {
    expect(memberSummaryEqual(undefined, base())).toBe(false);
  });

  it('detects a hunger change', () => {
    expect(memberSummaryEqual({ ...base(), hunger: 2 }, base())).toBe(false);
  });

  it('detects a stat change', () => {
    const cur = base();
    expect(memberSummaryEqual({ ...cur, stats: { ...cur.stats!, Wits: 3 } }, base())).toBe(false);
  });

  it('detects a discipline and conviction change', () => {
    expect(memberSummaryEqual({ ...base(), disciplines: ['auspex', 'dominate'] }, base())).toBe(false);
    expect(memberSummaryEqual({ ...base(), convictions: [] }, base())).toBe(false);
  });

  it('an old-shape entry lacking the new fields differs, forcing one upgrade write', () => {
    const oldShape = {
      name: 'Lor', pronouns: '?/?', portraitUrl: null, ageBracket: '', bp: 1, playbook: 'Tremere',
    };
    expect(memberSummaryEqual(oldShape, base())).toBe(false);
  });

  it('ignores table-owned Initiative: an initiative-only difference is still "equal" (no summary resync)', () => {
    expect(memberSummaryEqual({ ...base(), initiative: 14 }, base())).toBe(true);
  });

  it('buildMemberSummary never publishes Initiative (written separately via a members-array transaction)', () => {
    expect('initiative' in buildMemberSummary(char({ name: 'x' }))).toBe(false);
  });
});
