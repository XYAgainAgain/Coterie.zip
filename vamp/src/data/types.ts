export type StatName = 'Blood' | 'Shadow' | 'Resolve' | 'Demeanor' | 'Wits';
export type CoterieStatName = 'Clout' | 'Cohesion' | 'Charm' | 'Claim' | 'Currency';

export const STAT_NAMES: StatName[] = ['Blood', 'Shadow', 'Resolve', 'Demeanor', 'Wits'];
export const COTERIE_STAT_NAMES: CoterieStatName[] = ['Clout', 'Cohesion', 'Charm', 'Claim', 'Currency'];

export interface Archetype {
  name: string;
  tagline: string;
  stats: string;
}

export interface PlaybookPerk {
  name: string;
  description: string;
}

export interface Playbook {
  name: string;
  category: 'clan' | 'clanless';
  tagline: string;
  whatAreYou: string;
  disciplines: string;
  baneName: string;
  baneDescription: string;
  compulsionName: string | null;
  compulsionDescription: string;
  perks: PlaybookPerk[];
  xpTriggers: string[];
  xpExtra: string | null;
  archetypes: Archetype[];
  customStatSpread: string;
}

export interface PTMeritFlaw {
  name: string;
  description: string;
}

export interface PredatorType {
  name: string;
  description: string;
  huntingStat: string;
  discipline: string;
  merit: PTMeritFlaw;
  flaw: PTMeritFlaw;
  humanity: string | null;
  feedingRules: string | null;
}

export interface Power {
  name: string;
  level: number;
  tags: string[];
  body: string;
}

export interface DisciplinePerk {
  name: string;
  body: string;
}

export type ProjectPowerType = 'ritual' | 'ceremony' | 'sacrament' | 'formula';

export interface ProjectPower {
  name: string;
  level: number;
  tags: string[];
  requirements: string | null;
  body: string;
  type: ProjectPowerType;
}

export interface Discipline {
  name: string;
  slug: string;
  intro: string | null;
  perk: DisciplinePerk | null;
  powers: Power[];
  projectPowers: ProjectPower[];
  status: 'complete' | 'partial' | 'stub';
}

export interface OutcomeTier {
  tier: string;
  content: string;
}

export interface HumanityThreshold {
  threshold: string;
  description: string;
}

export interface StandardMove {
  type: 'standard';
  name: string;
  trigger: string;
  rollStat: string | null;
  statOptions: string[] | null;
  outcomes: OutcomeTier[];
}

export interface BlushOfLife {
  type: 'blush-of-life';
  name: 'Blush of Life';
  trigger: string;
  humanityThresholds: HumanityThreshold[];
  advanced: string | null;
}

export type BasicMove = StandardMove | BlushOfLife;

export interface AgeBracket {
  name: string;
  embraced: string;
  flavor: string | null;
  startingHumanity: string;
  startingBloodPotency: number;
  advancement: string;
  predatorType: string;
  narrativeFeel: string;
}

export interface BPAgeScaling {
  label: string;
  bp: number;
}

export interface FeedingRestriction {
  bpRange: string;
  description: string;
}

export interface AdvancementPenalty {
  bpRange: string;
  penalty: string;
}

export interface BPEffect {
  name: string;
  body: string;
}

export interface BloodPotencyData {
  intro: string;
  ageScaling: BPAgeScaling[];
  feedingRestrictions: FeedingRestriction[];
  advancementPenalties: AdvancementPenalty[];
  effects: BPEffect[];
}

export interface HungerTier {
  level: string;
  label: string;
  description: string;
}

export interface HungerData {
  intro: string;
  tiers: HungerTier[];
  sections: { name: string; body: string }[];
}

export interface HumanityTier {
  range: string;
  label: string | null;
  description: string;
}

export interface HumanityData {
  intro: string;
  tiers: HumanityTier[];
  sections: { name: string; body: string }[];
}

export interface XPSource {
  name: string;
  maxPerSession: string;
  description: string;
}

export interface XPCost {
  name: string;
  cost: string;
  description: string;
}

export interface AdvancementData {
  intro: string;
  xpSources: XPSource[];
  xpCosts: XPCost[];
  sections: { name: string; body: string }[];
}

export interface CoterieStat {
  name: string;
  description: string;
  mechanic: string | null;
  changesThrough: string;
}

export interface CoterieStatsData {
  intro: string;
  stats: CoterieStat[];
}

export interface HavenFeatures {
  positiveCount: number;
  positiveOptions: string[];
  negativeCount: number;
  negativeOptions: string[];
  // aggregate=true (Uncategorizable): options are the pooled union of all other
  // types; notes hold the "invent your own" guidance. Both null for normal types.
  aggregate: boolean;
  positiveNote: string | null;
  negativeNote: string | null;
}

export interface CoterieType {
  name: string;
  description: string;
  coterieStats: string;
  havenFeatures: HavenFeatures;
}

export interface GroupTier {
  tier: string;
  description: string;
}

export interface CoterieMove {
  name: string;
  trigger: string;
  countRule: string;
  tiers: GroupTier[];
  holdOptions: string[] | null;
}

export interface HpTier {
  bpRange: string;
  hp: number;
}

export interface EquipRow {
  item: string;
  value: string;
}

export interface EquipTable {
  name: string;
  rows: EquipRow[];
}

export interface HarmHealingData {
  intro: string;
  hpTiers: HpTier[];
  sections: { name: string; body: string }[];
  equipTables: EquipTable[];
}

export interface StatRow {
  score: string;
  description: string;
}

export interface StatTable {
  name: string;
  rows: StatRow[];
}

export interface StatRefTablesData {
  tables: StatTable[];
}

export interface ClanBaneVariant {
  clan: string;
  baneName: string;
  consequences: string;
}

export interface FolkloricBane {
  baneName: string;
  consequences: string;
  xpGain: string;
}

export interface Merit {
  name: string;
  category: string;
  limit: string;
  description: string;
  xpCost: string;
}

export interface Flaw {
  name: string;
  category: string;
  limit: string;
  description: string;
  xpGain: string;
}

export interface OptionalExtrasData {
  clanBaneVariantsIntro: string;
  clanBaneVariants: ClanBaneVariant[];
  folkloricBanesIntro: string;
  folkloricBanes: FolkloricBane[];
  merits: Merit[];
  flaws: Flaw[];
}

export interface SnippetEntry {
  type: string;
  name: string;
  snippet: string;
}

/* Item Tag catalog (Corebook Appendix B), source of truth for the Possessions
   tab's tooltips and tag autocomplete. Distinct from Power.tags (Discipline tags). */
export interface ItemTag {
  name: string;
  categories: string[];
  effect: string;
}

export type ItemType =
  | 'Weapon' | 'Wearable' | 'Vehicle' | 'Consumable'
  | 'Tech' | 'Artifact' | 'Intel' | 'Structure' | 'Miscellaneous';

export const ITEM_TYPES: ItemType[] = [
  'Weapon', 'Wearable', 'Vehicle', 'Consumable',
  'Tech', 'Artifact', 'Intel', 'Structure', 'Miscellaneous',
];

/* A single tag on an item. `base` matches an ItemTag `name`, or the reserved
   'Range' (dedicated picker) / '__custom__' (player-authored) sentinels.
   `param` fills a template slot (N-Harm '3', Range 'Close-Far', Recharge-X 'Dawn',
   [Trespasser]-Warded 'Ghoul'). `custom` carries the label + tooltip when base is custom. */
export interface TagRef {
  base: string;
  param?: string;
  custom?: { label: string; description: string };
}

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  tags: TagRef[];          /* stored in player order; display re-orders templates only */
  description: string;     /* free text, never rules-critical */
  qty: number;             /* default 1 */
  equipped: boolean;
  isContainer: boolean;
  containerId: string | null; /* null = carried loose, 'stash', 'haven', or another Item.id */
}

/* A pending hand-off in the Coterie doc's giftQueue. The sender pre-rolls verb +
   display name so every client renders an identical toast. */
export interface Gift {
  id: string;              /* claim key (uuid); the claimed item adopts it for idempotency */
  item: Item;              /* full payload; containerId reset to null on claim */
  fromCharacterId: string;
  fromDisplayName: string;
  toCharacterId: string;
  verb: string;
  createdAt: number;
}

export interface Prerequisite {
  type: 'power' | 'discipline';
  name: string;
}

export interface DataFile<T> {
  version: number;
  generatedAt: string;
  entries: T[];
}

export interface DataFileWrapped<T> {
  version: number;
  generatedAt: string;
  data: T;
}
