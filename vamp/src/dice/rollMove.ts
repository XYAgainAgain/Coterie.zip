import { h } from 'preact';
import { clearForwards, character } from '../state/character';
import { forceToast } from '../state/toasts';
import { netAdvantage } from '../state/derived';
import { diceEngine } from './diceState';
import { logRoll } from './rollHistory';
import { getRollSpeed, rollMode } from './diceConfig';
import { rollMultipleD6, rollWithAdvantage, rollWithDisadvantage } from './DiceFairness';
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
  bestial: 'Bestial Failure',
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
  bestial: { bg: 'hsl(0 50% 8%)', border: 'hsl(0 60% 25%)' },
  failure: { bg: 'hsl(0 40% 15%)', border: 'hsl(0 70% 45%)' },
  mixed: { bg: 'hsl(50 35% 15%)', border: 'hsl(50 65% 50%)' },
  success: { bg: 'hsl(140 40% 15%)', border: 'hsl(140 70% 50%)' },
  crit: { bg: 'hsl(150 45% 12%)', border: 'hsl(45 80% 55%)' },
};

let rolling = false;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function performRoll(statName: StatName): Promise<RollBreakdown | null> {
  if (rolling) return null;
  rolling = true;

  try {
    const breakdown = rollMove(statName);
    const engine = diceEngine.value;
    const diceCount = breakdown.advantage === 'flat' ? 2 : 3;

    const skipDice = prefersReducedMotion.matches || rollMode.value === 'no3d';
    if (engine && !skipDice) {
      engine.clearDice();
      await engine.spawnFromSpinner(diceCount);
      engine.fixDieResults(breakdown.result.dice);
      await engine.waitForSettle();
      const speed = getRollSpeed();
      engine.fadeDiceOut(Math.round(3000 / speed), Math.round(600 / speed));
    } else if (engine) {
      engine.playRollAudio(diceCount);
    }

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
    const engine = diceEngine.value;

    const skipDice = prefersReducedMotion.matches || rollMode.value === 'no3d';
    if (engine && !skipDice) {
      engine.clearDice();
      await engine.spawnFromSpinner(count);
      engine.fixDieResults(dice);
      await engine.waitForSettle();
      const speed = getRollSpeed();
      engine.fadeDiceOut(Math.round(3000 / speed), Math.round(600 / speed));
    } else if (engine) {
      engine.playRollAudio(count);
    }

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

export function showRollToast(breakdown: RollBreakdown): void {
  const { result, statName, statValue, forwardMod, ongoingMod } = breakdown;
  const tier = result.tier;
  const colors = TIER_COLORS[tier];

  const hasStat = statName !== '';

  const message = h('span', { class: 'vamp-roll-toast' },
    result.kept.map((d, i) => h('span', { key: `k${i}`, class: 'vamp-roll-toast__die' }, d)),
    result.dropped.length > 0 && h('span', { class: 'vamp-roll-toast__dropped' },
      result.dropped.map((d, i) => h('span', { key: `d${i}`, class: 'vamp-roll-toast__die vamp-roll-toast__die--dropped' }, d)),
    ),
    hasStat && forwardMod !== 0 && h('span', { class: 'vamp-roll-toast__mod' }, formatMod(forwardMod),
      h('span', { class: 'vamp-roll-toast__mod-label' }, 'F'),
    ),
    hasStat && ongoingMod !== 0 && h('span', { class: 'vamp-roll-toast__mod' }, formatMod(ongoingMod),
      h('span', { class: 'vamp-roll-toast__mod-label' }, 'O'),
    ),
    hasStat && h('span', { class: 'vamp-roll-toast__mod' }, formatMod(statValue)),
    hasStat && ' ',
    hasStat && h('span', { class: 'vamp-roll-toast__stat' }, statName),
    ' = ',
    h('span', { class: 'vamp-roll-toast__total' }, result.total),
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
