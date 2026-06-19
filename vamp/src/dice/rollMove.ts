import { h } from 'preact';
import {
  clearForwards, consumeArmedSurge, bankBloodSurge, bloodSurgeActive, character,
  setHunger, setHumanity, setHarm, resolveRemorse, superficialHealAmount, updateCharacter,
} from '../state/character';
import { forceToast } from '../state/toasts';
import { netAdvantage, bloodSurgesRemaining } from '../state/derived';
import type { AdvantageState } from '../state/derived';
import { diceEngine } from './diceState';
import { logRoll } from './rollHistory';
import { getRollSpeed, rollMode } from './diceConfig';
import { rollD6, rollMultipleD6, rollWithAdvantage, rollWithDisadvantage } from './DiceFairness';
import { classifyRoll, type MoveRollResult, type ResultTier } from './types';
import type { StatName } from '../data/types';

function modTotalForStat(stat: StatName, type: 'forward' | 'ongoing'): number {
  return character.value.modifiers
    .filter(m => m.type === type && (!m.stats || m.stats.includes(stat)))
    .reduce((sum, m) => sum + m.value, 0);
}

export interface RollBreakdown {
  result: MoveRollResult;
  statName: string;
  statValue: number;
  forwardMod: number;
  ongoingMod: number;
  totalMod: number;
  advantage: 'advantage' | 'disadvantage' | 'flat';
}

export function rollMove(statName: StatName): RollBreakdown {
  const statValue = character.value.stats[statName];
  const forwardMod = modTotalForStat(statName, 'forward');
  const ongoingMod = modTotalForStat(statName, 'ongoing');
  const totalMod = forwardMod + ongoingMod;
  const advantage = netAdvantage.value;

  let kept: number[];
  let dropped: number[];

  if (advantage === 'advantage') {
    const roll = rollWithAdvantage();
    kept = roll.kept;
    dropped = roll.dropped;
  } else if (advantage === 'disadvantage') {
    const roll = rollWithDisadvantage();
    kept = roll.kept;
    dropped = roll.dropped;
  } else {
    kept = rollMultipleD6(2);
    dropped = [];
  }

  const diceTotal = kept.reduce((a, b) => a + b, 0);
  const total = diceTotal + statValue + totalMod;
  const tier = classifyRoll(total, kept);

  const result: MoveRollResult = {
    dice: [...kept, ...dropped],
    kept,
    dropped,
    total,
    stat: statName,
    modifier: statValue + totalMod,
    tier,
    context: `roll +${statName}`,
    timestamp: Date.now(),
  };

  clearForwards(statName);
  consumeArmedSurge();

  return {
    result,
    statName,
    statValue,
    forwardMod,
    ongoingMod,
    totalMod,
    advantage,
  };
}

export const TIER_LABELS: Record<ResultTier, string> = {
  fanged: 'Fanged Failure',
  failure: 'Failure',
  mixed: 'Mixed Success',
  success: 'Success',
  crit: 'Critical Success',
};

export interface TierColors {
  bg: string;
  border: string;
}

export const TIER_COLORS: Record<ResultTier, TierColors> = {
  fanged: { bg: 'hsl(0 50% 8%)', border: 'hsl(0 60% 25%)' },
  failure: { bg: 'hsl(0 40% 15%)', border: 'hsl(0 70% 45%)' },
  mixed: { bg: 'hsl(50 35% 15%)', border: 'hsl(50 65% 50%)' },
  success: { bg: 'hsl(140 40% 15%)', border: 'hsl(140 70% 50%)' },
  crit: { bg: 'hsl(150 45% 12%)', border: 'hsl(45 80% 55%)' },
};

let rolling = false;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* Animate (or audio-only / skip) a known set of die faces through the shared engine. */
async function animateDice(dice: number[]): Promise<void> {
  const engine = diceEngine.value;
  if (!engine) return;

  const skipDice = prefersReducedMotion.matches || rollMode.value === 'no3d';
  if (skipDice) {
    engine.playRollAudio(dice.length);
    return;
  }

  engine.clearDice();
  await engine.spawnFromSpinner(dice.length);
  engine.fixDieResults(dice);
  await engine.waitForSettle();
  const speed = getRollSpeed();
  engine.fadeDiceOut(Math.round(3000 / speed), Math.round(600 / speed));
}

export async function performRoll(statName: StatName): Promise<RollBreakdown | null> {
  if (rolling) return null;
  rolling = true;

  try {
    const breakdown = rollMove(statName);
    await animateDice(breakdown.result.dice);
    showRollToast(breakdown);
    logRoll(breakdown);
    return breakdown;
  } finally {
    rolling = false;
  }
}

export async function performRawRoll(count: number): Promise<void> {
  if (rolling) return;
  rolling = true;

  try {
    const dice = rollMultipleD6(count);
    const total = dice.reduce((a, b) => a + b, 0);
    await animateDice(dice);

    const breakdown: RollBreakdown = {
      result: { dice, kept: dice, dropped: [], total, stat: '', modifier: 0, tier: 'failure', context: `roll ${count}d6`, timestamp: Date.now() },
      statName: '',
      statValue: 0,
      forwardMod: 0,
      ongoingMod: 0,
      totalMod: 0,
      advantage: 'flat',
    };

    showRawRollToast(count, dice, total);
    logRoll(breakdown);
  } finally {
    rolling = false;
  }
}

const BASE_TOAST_DURATION = 10_000;

function rollToastDuration(): number {
  return Math.round(BASE_TOAST_DURATION / getRollSpeed());
}

function formatMod(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/* Inlined so the Fanged Failure icon paints instantly (an <img> decode pops on a quick toast). */
const FANGS_D = 'M166.594,96.28C124.604,134.82 68.824,171.255 19.124,182.28C59.262,196.486 126.714,200.888 172.406,191.812L173.626,191.406L173.626,191.594C173.832,191.551 174.044,191.512 174.25,191.469C227.51,222.795 268.468,223.651 325.25,191.469C325.506,191.555 325.774,191.632 326.03,191.719L326,191.405L333.594,194.03C333.699,194.06 333.801,194.096 333.906,194.125C378.116,206.413 436.81,203.24 488.186,182.155C428.662,172.507 363.316,130.542 333.094,96.281C277.592,135.904 222.094,128.428 166.594,96.281L166.594,96.28ZM28.72,206.688C40.346,229.006 61.332,264.328 93.625,301.501C92.075,283.337 91.11,265.556 90.595,248.876C68.415,237.611 47.597,223.596 28.719,206.688L28.72,206.688ZM475.875,214.22C455.325,228.953 432.775,241.535 408.937,251.844C408.33,269.59 407.205,288.527 405.437,307.781C439.413,272.866 462.27,238.177 475.875,214.221L475.875,214.22ZM153.562,217.406C138.528,221.126 123.548,222.261 109,221.562C108.884,261.019 111.945,311.616 119.22,358.844C124.474,392.964 132.217,425.032 141.594,449.031L153.564,217.407L153.562,217.406ZM346.062,217.406L358.032,449.031C367.408,425.033 375.152,392.965 380.406,358.845C387.68,311.617 390.741,261.02 390.626,221.565C376.072,222.262 361.102,221.13 346.063,217.407L346.062,217.406ZM330.406,276.5C277.326,287.405 221.691,287.898 169.25,276.53L164.812,362.563C214.455,385.721 283.232,385.023 334.812,362.063L330.406,276.5Z';

export function showRollToast(breakdown: RollBreakdown): void {
  const { result, statName, statValue, forwardMod, ongoingMod } = breakdown;
  const tier = result.tier;
  const colors = TIER_COLORS[tier];

  const hasStat = statName !== '';
  /* Fanged Failures (snake eyes) auto-fail, so bonuses don't count: strike them; the fangs icon replaces the total. */
  const fanged = tier === 'fanged';
  const modClass = fanged ? 'vamp-roll-toast__mod vamp-roll-toast__struck' : 'vamp-roll-toast__mod';
  const statClass = fanged ? 'vamp-roll-toast__stat vamp-roll-toast__struck' : 'vamp-roll-toast__stat';

  const message = h('span', { class: 'vamp-roll-toast' },
    result.kept.map((d, i) => h('span', { key: `k${i}`, class: 'vamp-roll-toast__die' }, d)),
    result.dropped.length > 0 && h('span', { class: 'vamp-roll-toast__dropped' },
      result.dropped.map((d, i) => h('span', { key: `d${i}`, class: 'vamp-roll-toast__die vamp-roll-toast__die--dropped' }, d)),
    ),
    hasStat && forwardMod !== 0 && h('span', { class: modClass }, formatMod(forwardMod),
      h('span', { class: 'vamp-roll-toast__mod-label' }, 'F'),
    ),
    hasStat && ongoingMod !== 0 && h('span', { class: modClass }, formatMod(ongoingMod),
      h('span', { class: 'vamp-roll-toast__mod-label' }, 'O'),
    ),
    hasStat && h('span', { class: modClass }, formatMod(statValue)),
    hasStat && ' ',
    hasStat && h('span', { class: statClass }, statName),
    fanged
      ? h('svg', { class: 'vamp-roll-toast__fangs', viewBox: '0 0 736 736', 'aria-hidden': 'true' },
          h('g', { transform: 'matrix(0.92,0,0,0.92,0,0)' },
            h('g', { transform: 'matrix(1.69837,0,0,1.69837,-30.4348,-30.4348)' },
              h('path', { d: FANGS_D }))))
      : [' = ', h('span', { class: 'vamp-roll-toast__total' }, result.total)],
  );

  forceToast(message, 'info', TIER_LABELS[tier], {
    duration: rollToastDuration(),
    bg: colors.bg,
    border: colors.border,
    isRoll: true,
  });
}

function showRawRollToast(count: number, dice: number[], total: number): void {
  const message = h('span', { class: 'vamp-roll-toast' },
    dice.map((d, i) => h('span', { key: `k${i}`, class: 'vamp-roll-toast__die' }, d)),
    ' = ',
    h('span', { class: 'vamp-roll-toast__total' }, total),
  );

  forceToast(message, 'info', `${count}d6`, {
    duration: rollToastDuration(),
    isRoll: true,
  });
}

interface CheckRoll {
  kept: number[];
  dropped: number[];
  value: number;
  advantage: AdvantageState;
}

/* Single-die check (Hunger/Remorse). Advantage/Disadvantage roll the d6 twice and
   keep the higher/lower; no Forward/Ongoing modifiers apply (rolling-dice.md). */
function rollSingleCheck(): CheckRoll {
  const advantage = netAdvantage.value;
  if (advantage === 'advantage' || advantage === 'disadvantage') {
    const pair = [rollD6(), rollD6()].sort((a, b) => a - b);
    const keepHigh = advantage === 'advantage';
    return {
      kept: [keepHigh ? pair[1] : pair[0]],
      dropped: [keepHigh ? pair[0] : pair[1]],
      value: keepHigh ? pair[1] : pair[0],
      advantage,
    };
  }
  const die = rollD6();
  return { kept: [die], dropped: [], value: die, advantage };
}

/* Resolve a Hunger Check result against current Hunger, applying +1 on failure.
   At 0 Hunger, only a 6 is safe (hunger.md); otherwise you must roll over Hunger. */
function applyHungerResult(value: number): boolean {
  const hunger = character.value.hunger;
  const safe = hunger === 0 ? value === 6 : value > hunger;
  if (!safe) setHunger(hunger + 1);
  return safe;
}

function checkDiceSpans(check: CheckRoll) {
  return [
    ...check.kept.map((d, i) => h('span', { key: `k${i}`, class: 'vamp-roll-toast__die' }, d)),
    ...check.dropped.map((d, i) =>
      h('span', { key: `d${i}`, class: 'vamp-roll-toast__die vamp-roll-toast__die--dropped' }, d)),
  ];
}

const GOOD = TIER_COLORS.success;
const BAD = TIER_COLORS.failure;

export async function performHungerCheck(): Promise<boolean | null> {
  if (rolling) return null;
  rolling = true;
  try {
    const check = rollSingleCheck();
    await animateDice([...check.kept, ...check.dropped]);
    consumeArmedSurge();
    const hungerBefore = character.value.hunger;
    const safe = applyHungerResult(check.value);
    const colors = safe ? GOOD : BAD;
    const message = h('span', { class: 'vamp-roll-toast' },
      ...checkDiceSpans(check),
      ' vs. ', h('span', { class: 'vamp-roll-toast__total' }, hungerBefore), ' Hunger',
      h('span', { class: 'vamp-roll-toast__outcome' }, safe ? 'Resisted' : '+1 Hunger'),
    );
    forceToast(message, 'info', 'Hunger Check', {
      duration: rollToastDuration(), bg: colors.bg, border: colors.border, isRoll: true,
    });
    return safe;
  } finally {
    rolling = false;
  }
}

export async function performRemorseCheck(): Promise<boolean | null> {
  if (rolling) return null;
  rolling = true;
  try {
    const check = rollSingleCheck();
    await animateDice([...check.kept, ...check.dropped]);
    consumeArmedSurge();
    const char = character.value;
    const stains = char.stains;
    const outcome = resolveRemorse(char.humanity, stains, check.value);
    const safe = outcome.safe;
    setHumanity(outcome.humanity, outcome.stains);
    const colors = safe ? GOOD : BAD;
    const message = h('span', { class: 'vamp-roll-toast' },
      ...checkDiceSpans(check),
      ' vs. ', h('span', { class: 'vamp-roll-toast__total' }, stains), ` Stain${stains === 1 ? '' : 's'}`,
      h('span', { class: 'vamp-roll-toast__outcome' }, safe ? 'Stains cleared' : '−1 Humanity, Stains cleared'),
    );
    forceToast(message, 'info', 'Remorse Check', {
      duration: rollToastDuration(), bg: colors.bg, border: colors.border, isRoll: true,
    });
    return safe;
  } finally {
    rolling = false;
  }
}

export async function performQuickHeal(): Promise<boolean | null> {
  const char = character.value;
  if (char.playbook === 'Ghoul') return null;
  if (char.harm.superficial === 0) return null;
  if (char.quickHealUsedThisScene) return null;
  if (rolling) return null;
  rolling = true;
  try {
    const check = rollSingleCheck();
    await animateDice([...check.kept, ...check.dropped]);
    consumeArmedSurge();
    const safe = applyHungerResult(check.value);
    const maxHeal = superficialHealAmount(char.bp);
    const newSuperficial = Math.max(0, char.harm.superficial - maxHeal);
    const healed = char.harm.superficial - newSuperficial;
    setHarm(newSuperficial, char.harm.aggravated);
    updateCharacter({ quickHealUsedThisScene: true });
    const message = h('span', { class: 'vamp-roll-toast' },
      ...checkDiceSpans(check),
      h('span', { class: 'vamp-roll-toast__outcome' }, `Healed ${healed} (max. ${maxHeal}) Superficial`),
      h('span', { class: 'vamp-roll-toast__sub' }, safe ? 'Hunger held' : '+1 Hunger'),
    );
    forceToast(message, 'info', 'Quick Heal', {
      duration: rollToastDuration(), bg: GOOD.bg, border: GOOD.border, isRoll: true,
    });
    return safe;
  } finally {
    rolling = false;
  }
}

export async function performBloodSurge(): Promise<boolean | null> {
  const char = character.value;
  if (char.bp < 1 || bloodSurgesRemaining.value <= 0 || bloodSurgeActive()) return null;
  if (rolling) return null;
  rolling = true;
  try {
    const check = rollSingleCheck();
    await animateDice([...check.kept, ...check.dropped]);
    const safe = applyHungerResult(check.value);
    bankBloodSurge(char.bp);
    const left = bloodSurgesRemaining.value;
    const message = h('span', { class: 'vamp-roll-toast' },
      ...checkDiceSpans(check),
      h('span', { class: 'vamp-roll-toast__outcome' }, `Banked ${char.bp} Advantage${char.bp === 1 ? '' : 's'}`),
      h('span', { class: 'vamp-roll-toast__sub' },
        `${safe ? 'Hunger held' : '+1 Hunger'} · ${left} Surge${left === 1 ? '' : 's'} left tonight`),
    );
    forceToast(message, 'info', 'Blood Surge', {
      duration: rollToastDuration(), bg: GOOD.bg, border: GOOD.border, isRoll: true,
    });
    return safe;
  } finally {
    rolling = false;
  }
}
