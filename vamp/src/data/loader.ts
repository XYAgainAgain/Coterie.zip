import type {
  Playbook, PredatorType, Discipline, BasicMove, AgeBracket,
  BloodPotencyData, HungerData, HumanityData, AdvancementData,
  CoterieStatsData, CoterieType, CoterieMove,
  HarmHealingData, StatRefTablesData, OptionalExtrasData,
  SnippetEntry, ItemTag,
  DataFile, DataFileWrapped,
} from './types';

const cache = new Map<string, unknown>();

export function clearFetchCache(): void { cache.clear(); }

/* Read generatedAt from the already-fetched in-memory cache (avoids a second network hit) */
export function getCachedGeneratedAt(): string | null {
  const raw = cache.get('playbooks') as { generatedAt?: string } | undefined;
  return raw?.generatedAt ?? null;
}

async function fetchJSON<T>(name: string): Promise<T> {
  const cached = cache.get(name);
  if (cached) return cached as T;

  /* Anchored to the app base; a relative './' resolves against two-segment
     URLs like /vamp/{code}/{slug} and 404s on cold cache */
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
  if (!res.ok) throw new Error(`Failed to load ${name}.json: ${res.status} ${res.statusText}`);

  const data = await res.json() as T;
  cache.set(name, data);
  return data;
}

async function getEntries<T>(name: string): Promise<T[]> {
  const file = await fetchJSON<DataFile<T>>(name);
  return file.entries;
}

async function getData<T>(name: string): Promise<T> {
  const file = await fetchJSON<DataFileWrapped<T>>(name);
  return file.data;
}

export const getPlaybooks = () => getEntries<Playbook>('playbooks');
export const getPredatorTypes = () => getEntries<PredatorType>('predator-types');
export const getDisciplines = () => getEntries<Discipline>('disciplines');
export const getBasicMoves = () => getEntries<BasicMove>('basic-moves');
export const getAgeBrackets = () => getEntries<AgeBracket>('age-brackets');
export const getCoterieTypes = () => getEntries<CoterieType>('coterie-types');
export const getCoterieMoves = () => getEntries<CoterieMove>('coterie-moves');

export const getBloodPotency = () => getData<BloodPotencyData>('blood-potency');
export const getHunger = () => getData<HungerData>('hunger');
export const getHumanity = () => getData<HumanityData>('humanity');
export const getAdvancement = () => getData<AdvancementData>('advancement');
export const getCoterieStats = () => getData<CoterieStatsData>('coterie-stats');
export const getHarmHealing = () => getData<HarmHealingData>('harm-healing');
export const getStatRefTables = () => getData<StatRefTablesData>('stat-ref-tables');
export const getOptionalExtras = () => getData<OptionalExtrasData>('optional-extras');
export const getSnippets = () => getEntries<SnippetEntry>('snippets').catch((e) => {
  console.warn('[Vamp] snippets.json failed to load; snippets disabled.', e);
  return [] as SnippetEntry[];
});
/* Catch like snippets: a missing/stale tags.json degrades Possessions tooltips and
   autocomplete to plain text rather than bricking the whole app's boot. */
export const getItemTags = () => getEntries<ItemTag>('tags').catch((e) => {
  console.warn('[Vamp] tags.json failed to load; item tags disabled.', e);
  return [] as ItemTag[];
});

export interface GameData {
  playbooks: Playbook[];
  predatorTypes: PredatorType[];
  disciplines: Discipline[];
  basicMoves: BasicMove[];
  ageBrackets: AgeBracket[];
  coterieTypes: CoterieType[];
  coterieMoves: CoterieMove[];
  snippets: SnippetEntry[];
  itemTags: ItemTag[];
  bloodPotency: BloodPotencyData;
  hunger: HungerData;
  humanity: HumanityData;
  advancement: AdvancementData;
  coterieStats: CoterieStatsData;
  harmHealing: HarmHealingData;
  statRefTables: StatRefTablesData;
  optionalExtras: OptionalExtrasData;
}

export async function loadAllGameData(): Promise<GameData> {
  const [
    playbooks, predatorTypes, disciplines, basicMoves, ageBrackets,
    coterieTypes, coterieMoves, snippets, itemTags,
    bloodPotency, hunger, humanity, advancement,
    coterieStats, harmHealing, statRefTables, optionalExtras,
  ] = await Promise.all([
    getPlaybooks(), getPredatorTypes(), getDisciplines(), getBasicMoves(), getAgeBrackets(),
    getCoterieTypes(), getCoterieMoves(), getSnippets(), getItemTags(),
    getBloodPotency(), getHunger(), getHumanity(), getAdvancement(),
    getCoterieStats(), getHarmHealing(), getStatRefTables(), getOptionalExtras(),
  ]);

  return {
    playbooks, predatorTypes, disciplines, basicMoves, ageBrackets,
    coterieTypes, coterieMoves, snippets, itemTags,
    bloodPotency, hunger, humanity, advancement,
    coterieStats, harmHealing, statRefTables, optionalExtras,
  };
}
