import { computed, signal } from '@preact/signals';
import { character, BP_HP } from './character';
import { parseHuntingStat, parsePrerequisites } from '../data/transforms';
import type {
  StatName, Playbook, PredatorType, Discipline,
  Power, Prerequisite, AgeBracket,
} from '../data/types';
import type { GameData } from '../data/loader';

export const gameData = signal<GameData | null>(null);

export const currentPlaybook = computed<Playbook | null>(() => {
  const data = gameData.value;
  if (!data) return null;
  return data.playbooks.find(p => p.name === character.value.playbook) ?? null;
});

export const currentPredatorType = computed<PredatorType | null>(() => {
  const data = gameData.value;
  if (!data) return null;
  return data.predatorTypes.find(p => p.name === character.value.predatorType) ?? null;
});

export const currentAgeBracket = computed<AgeBracket | null>(() => {
  const data = gameData.value;
  if (!data) return null;
  return data.ageBrackets.find(a => a.name === character.value.ageBracket) ?? null;
});

export const huntingStat = computed<StatName | null>(() => {
  const pt = currentPredatorType.value;
  if (!pt) return null;
  return parseHuntingStat(pt.huntingStat);
});

/* Disciplines auto-granted by Playbook text (e.g. "granted", "exclusive access") */
export const grantedDisciplineSlugs = computed<Set<string>>(() => {
  const pb = currentPlaybook.value;
  const pt = currentPredatorType.value;
  const data = gameData.value;
  if (!pb || !data) return new Set();

  const granted = new Set<string>();
  const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, '-');
  const raw = pb.disciplines;

  /* Extract linked discipline names */
  const linkedNames: string[] = [];
  for (const match of raw.matchAll(/\[([^\]]+)\]\([^)]+\)/g)) {
    linkedNames.push(match[1].replace(/\*\*/g, ''));
  }

  if (pb.name === 'Thin-Blood') {
    granted.add(slugify('Thin-Blood Alchemy'));
  } else if (/granted|automatically\s+receive|exclusive\s+access/i.test(raw) && linkedNames.length >= 1) {
    granted.add(slugify(linkedNames[0]));
  }

  /* PT discipline counts as granted if it doesn't overlap with Playbook options */
  if (pt && pb.name !== 'Ghoul') {
    const ptDisc = data.disciplines.find(
      d => d.name.toLowerCase() === pt.discipline.toLowerCase()
    );
    if (ptDisc) {
      const pbOptionSlugs = linkedNames.map(n => slugify(n));
      if (!pbOptionSlugs.includes(ptDisc.slug)) {
        granted.add(ptDisc.slug);
      }
    }
  }

  return granted;
});

export const availableDisciplines = computed<string[]>(() => {
  const data = gameData.value;
  const pt = currentPredatorType.value;
  const char = character.value;
  if (!data) return [];

  const slugs = new Set(char.unlockedDisciplines);

  if (pt) {
    const ptDisc = data.disciplines.find(
      d => d.name.toLowerCase() === pt.discipline.toLowerCase()
    );
    if (ptDisc) slugs.add(ptDisc.slug);
  }

  return [...slugs];
});

export const accessibleDisciplineData = computed<Discipline[]>(() => {
  const data = gameData.value;
  const slugs = availableDisciplines.value;
  if (!data) return [];
  return data.disciplines.filter(d => slugs.includes(d.slug));
});

const BP_STAT_CAP: Record<number, number> = { 0: 3, 1: 3, 2: 3, 3: 4, 4: 5, 5: 5 };

export const maxHP = computed(() => BP_HP[character.value.bp] ?? 6);
export const statCap = computed(() => BP_STAT_CAP[character.value.bp] ?? 3);

export type PowerStatus = 'known' | 'available' | 'locked';

export interface PowerWithStatus {
  power: Power;
  status: PowerStatus;
  lockReason: string | null;
  prerequisites: Prerequisite[];
}

/* Ghouls treat their BP as 1 for Discipline access per Playbook rules */
export const effectiveDisciplineBP = computed(() => {
  const char = character.value;
  if (char.playbook === 'Ghoul' && char.bp === 0) return 1;
  return char.bp;
});

export function getPowerStatus(power: Power, disciplineSlug: string): PowerWithStatus {
  const char = character.value;
  const prereqs = parsePrerequisites(power.body);
  const discBP = effectiveDisciplineBP.value;

  if (char.knownPowers.includes(power.name)) {
    return { power, status: 'known', lockReason: null, prerequisites: prereqs };
  }

  if (power.level > discBP) {
    return {
      power,
      status: 'locked',
      lockReason: `Requires BP ${power.level} (current: ${discBP})`,
      prerequisites: prereqs,
    };
  }

  for (const prereq of prereqs) {
    if (prereq.type === 'power' && !char.knownPowers.includes(prereq.name)) {
      return {
        power,
        status: 'locked',
        lockReason: `Requires known Power: ${prereq.name}`,
        prerequisites: prereqs,
      };
    }
    if (prereq.type === 'discipline') {
      const slugMatch = gameData.value?.disciplines.find(
        d => d.name.toLowerCase() === prereq.name.toLowerCase()
      );
      if (slugMatch && !availableDisciplines.value.includes(slugMatch.slug)) {
        return {
          power,
          status: 'locked',
          lockReason: `Requires ${prereq.name} access`,
          prerequisites: prereqs,
        };
      }
    }
  }

  return { power, status: 'available', lockReason: null, prerequisites: prereqs };
}

export interface MoveStatEntry {
  statName: StatName;
  moves: { name: string; altStat?: StatName }[];
}

function higherOf(a: StatName, b: StatName, stats: Record<StatName, number>): StatName {
  return stats[a] >= stats[b] ? a : b;
}

export const moveStatMap = computed<MoveStatEntry[]>(() => {
  const data = gameData.value;
  const hunt = huntingStat.value;
  const stats = character.value.stats;
  if (!data) return [];

  const map: Record<StatName, { name: string; altStat?: StatName }[]> = {
    Blood: [],
    Shadow: [],
    Resolve: [],
    Demeanor: [],
    Wits: [],
  };

  /* Fixed single-stat Moves */
  map.Blood.push({ name: 'Dirty Your Claws' });
  map.Blood.push({ name: 'Feed' });
  map.Shadow.push({ name: 'Slip Away' });
  map.Resolve.push({ name: 'Stay Chill' });
  map.Resolve.push({ name: 'Protect the Coterie' });

  /* "Use higher" Moves: placed under whichever stat the character has higher */
  const repoStat = higherOf('Blood', 'Shadow', stats);
  const repoAlt: StatName = repoStat === 'Blood' ? 'Shadow' : 'Blood';
  map[repoStat].push({ name: 'Reposition', altStat: repoAlt });

  const dvStat = higherOf('Wits', 'Demeanor', stats);
  const dvAlt: StatName = dvStat === 'Wits' ? 'Demeanor' : 'Wits';
  map[dvStat].push({ name: 'Discern Vibes', altStat: dvAlt });

  const ctsStat = higherOf('Wits', 'Blood', stats);
  const ctsAlt: StatName = ctsStat === 'Wits' ? 'Blood' : 'Wits';
  map[ctsStat].push({ name: 'Catch the Scent', altStat: ctsAlt });

  /* Hunt: placed under Predator Type's hunting stat, or falls to "Other" if None */
  if (hunt) {
    map[hunt].push({ name: 'Hunt' });
  }

  return Object.entries(map).map(([statName, moves]) => ({
    statName: statName as StatName,
    moves,
  }));
});

const BLOODLINE_IMG_RE = /!\[.*?\]\(\.\.\/(assets\/images\/vtm\/bloodlines\/[\w-]+\.webp)\)/;

export const currentBloodlineUrl = computed<string | null>(() => {
  const pb = currentPlaybook.value;
  if (!pb) return null;
  const match = pb.whatAreYou.match(BLOODLINE_IMG_RE);
  if (match) return `/${match[1]}`;
  return null;
});

export const snippetMap = computed<Map<string, string>>(() => {
  const data = gameData.value;
  if (!data) return new Map();
  const map = new Map<string, string>();
  for (const s of data.snippets) {
    map.set(`${s.type}/${s.name}`, s.snippet);
  }
  return map;
});

export function getSnippet(type: string, name: string): string | null {
  return snippetMap.value.get(`${type}/${name}`) ?? null;
}

export type AdvantageState = 'advantage' | 'disadvantage' | 'flat';

export const netAdvantage = computed<AdvantageState>(() => {
  const mods = character.value.modifiers;
  const hasAdv = mods.some(m => m.type === 'advantage');
  const hasDisadv = mods.some(m => m.type === 'disadvantage');
  if (hasAdv && hasDisadv) return 'flat';
  if (hasAdv) return 'advantage';
  if (hasDisadv) return 'disadvantage';
  return 'flat';
});

export const universalForwardTotal = computed(() =>
  character.value.modifiers
    .filter(m => m.type === 'forward' && !m.target)
    .reduce((sum, m) => sum + m.value, 0)
);

export const universalOngoingTotal = computed(() =>
  character.value.modifiers
    .filter(m => m.type === 'ongoing' && !m.target)
    .reduce((sum, m) => sum + m.value, 0)
);

export const universalTotal = computed(() =>
  universalForwardTotal.value + universalOngoingTotal.value
);

export interface ConditionalTotal {
  target: string;
  total: number;
}

export const conditionalTotals = computed<ConditionalTotal[]>(() => {
  const mods = character.value.modifiers;
  const base = universalTotal.value;
  const targetMap = new Map<string, number>();
  for (const m of mods) {
    if ((m.type === 'forward' || m.type === 'ongoing') && m.target) {
      targetMap.set(m.target, (targetMap.get(m.target) ?? 0) + m.value);
    }
  }
  return [...targetMap.entries()].map(([target, extra]) => ({
    target,
    total: base + extra,
  }));
});

export const holdCounters = computed(() =>
  character.value.modifiers.filter(m => m.type === 'hold')
);

export const otherMoves = computed<string[]>(() => {
  const data = gameData.value;
  if (!data) return [];

  const mapped = new Set<string>();
  for (const entry of moveStatMap.value) {
    for (const m of entry.moves) mapped.add(m.name);
  }

  return data.basicMoves
    .map(m => m.name)
    .filter(name => !mapped.has(name));
});
