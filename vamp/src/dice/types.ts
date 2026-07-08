export type ResultTier = 'fanged' | 'failure' | 'mixed' | 'success' | 'crit';

export type RollMode = 'standard' | 'fast' | 'no3d';

export type Theme = 'night' | 'sunset' | 'abyss';

export interface RollResult {
  dice: number[];
  total: number;
  timestamp: number;
}

export interface MoveRollResult extends RollResult {
  kept: number[];
  dropped: number[];
  stat: string;
  modifier: number;
  tier: ResultTier;
  context: string;
}

/* One logged roll, shared verbatim across a Coterie. Stores structured pieces (not markup)
   so a later Storyteller pass can blank dice/total. Optional keys are omitted, not undefined (Firestore). */
export interface RollLogEntry {
  id: string;
  who: string;          /* roller's character name */
  characterId: string;  /* for "You" vs name at render */
  ts: number;
  kept: number[];
  dropped: number[];
  statName: string;     /* '' for raw rolls and checks */
  statValue: number;
  forwardMod: number;
  ongoingMod: number;
  total: number;
  tier?: ResultTier;    /* drives the row accent; absent for raw rolls (neutral) */
  label?: string;       /* 'Hunger Check' | 'Remorse' | 'Quick Heal' | 'Blood Surge' | '3d6' */
  outcome?: string;     /* compact result for checks: 'Resisted', '+1 Hunger', etc. */
  secret?: boolean;     /* ST Secret roll: every client renders "Storyteller rolled something." (no data written) */
}

export interface DiceConfig {
  rollMode: RollMode;
  theme: Theme;
  autoHideDelay: number;
  soundEnabled: boolean;
  hapticEnabled: boolean;
  masterVolume: number;
}

export const DEFAULT_CONFIG: DiceConfig = {
  rollMode: 'standard',
  theme: 'night',
  autoHideDelay: 2500,
  soundEnabled: true,
  hapticEnabled: false,
  masterVolume: 0.8,
};

/* Classify based on kept dice (post-advantage/disadvantage filtering) */
export function classifyRoll(total: number, kept: number[]): ResultTier {
  if (kept.length === 2 && kept.every(d => d === 1)) return 'fanged';
  if (total >= 12) return 'crit';
  if (total >= 10) return 'success';
  if (total >= 7) return 'mixed';
  return 'failure';
}
