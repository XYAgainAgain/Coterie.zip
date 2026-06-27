import { signal } from '@preact/signals';
import type { StatName, Item } from '../data/types';
import { canEquip } from '../data/itemTags';
import { isContainerItem, isDescendant } from '../data/itemTree';
import type { CustomTheme } from '../themes/customTheme';

export interface Debt {
  id: string;
  who: string;
  text: string;
  direction: 'owed' | 'owe';
  state: 'empty' | 'slashed' | 'filled';
}

export interface Modifier {
  id: string;
  type: 'forward' | 'ongoing' | 'hold' | 'advantage' | 'disadvantage';
  value: number;
  target: string | null;
  source: string;
  spendOn?: string;
  stats?: StatName[];
}

export interface Touchstone {
  name: string;
  pronouns: [string, string];
  ageBracket: string;
  description: string;
}

export interface Clock {
  id: string;
  name: string;
  segments: 4 | 6 | 8;
  filled: number;
  condition?: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
}

export const MANUAL_SOURCE = '(manual)';
export const BLOOD_SURGE_SOURCE = 'Blood Surge';
export const MAX_HOLD_COUNTERS = 3;

export interface Bio {
  apparentAge: string;
  vampiricAge: string;
  pronouns: [string, string];
  height: string;
  weight: string;
  style: string;
  occupation: string;
}

export interface GhoulPatron {
  type: 'npc' | 'pc';
  bloodline: string;
  bp: number;
  vampUrl: string;
}

export interface Portrait {
  url: string;
  x: number; /* object-position x%, default 50 */
  y: number; /* object-position y%, default 50 */
  scale: number; /* zoom factor, default 1 */
}

export interface PendingUpgrade {
  id: string;
  type: 'bp' | 'discipline-access' | 'discipline-power';
  slug?: string; /* Discipline slug for access/power */
  powerName?: string; /* Power name for discipline-power */
  xpCost: number;
}

/* TODO: drag-to-reposition + scroll-to-zoom crop UI for portraits.
   Data model is ready (x/y/scale per portrait). gLightbox shows full uncropped image;
   the crop only affects the 1:1 square display. */

export interface CharacterState {
  name: string;
  portraits: Portrait[];
  playbook: string;
  predatorType: string;
  ageBracket: string;
  bio: Bio;
  archetypeName: string;
  /* Player-authored name + tagline shown when the Custom Archetype is active. */
  customArchetypeName: string;
  customArchetypeTagline: string;
  stats: Record<StatName, number>;
  unlockedDisciplines: string[];
  startingDisciplines: string[];
  knownPowers: string[];
  knownProjectPowers: string[];
  advancedMoves: string[];
  pendingUpgrades: PendingUpgrade[];
  bp: number;
  hunger: number;
  humanity: number;
  stains: number;
  harm: { superficial: number; aggravated: number };
  xp: number;
  xpTriggers: boolean[];
  debts: Debt[];
  modifiers: Modifier[];
  convictions: string[];
  touchstones: Touchstone[];
  merits: { name: string; xpCost: string; selection?: string }[];
  flaws: { name: string; xpGain: string; selection?: string }[];
  folkloricBanes: { baneName: string; xpGain: string; fromPlaybookBane: boolean }[];
  baneChoice: 'standard' | 'variant' | 'both';
  ghoulPatron: GhoulPatron | null;
  /* Per-character recolor of a base theme; null = use the device theme. See themes/customTheme.ts. */
  customTheme: CustomTheme | null;
  creationComplete: boolean;
  creationStep: string;
  tourComplete: boolean;
  clocks: Clock[];
  notes: Note[];
  initiative: string;
  combatNotes: string;
  /* Blood Surge activations spent this night; remaining = BP − this. Resets on New Night. */
  bloodSurgesUsed: number;
  /* Advantages banked from the current Blood Surge, spent at-will this scene. Resets on New Scene. */
  bloodSurgeAdvantages: number;
  /* Quick Heal is 1/scene. Resets on New Scene/New Night; absent on old docs = false. */
  quickHealUsedThisScene?: boolean;
  /* Identity bio block collapsed to its one-line summary; absent on old docs = expanded. */
  bioCollapsed?: boolean;
  items: Item[];
}

export const NOTEBOOK_HELP_ID = '1998';

const NOTEBOOK_HELP_BODY = `# Notebook Help

Your Notebook tab is a scratchpad for anything you want to track during a ***Coterie*** session. Notes support **markdown formatting**, so you can keep things organized and import/export at will. Here's a guide!

***DOUBLE-CLICK ME TO EDIT!***

## Quick Reference

| You Type | You Get |
|--------|--------|
| \`#\`, \`##\`, \`###\`, or \`####\` | headers 1–4 (higher number = smaller text) |
| \`\`*1 asterisk*\`\` | *italic* |
| \`**2 asterisks**\` | **bold** |
| \`***3 asterisks***\` | ***bold italics*** |
| \`~~2 tildes~~\` | ~~strikethrough~~ |
| \`- hyphen w/ space\` | • bulleted lists (I faked this one lol) |
| \`1. number w/ period & space\` | 1. numbered lists |
| \`\` \\\`tilde ticks\\\` \`\` | \`inline code\` |
| \`> right arrow w/ space\` | blockquote |
| \`---\` | horizontal divider |

### Lists

As above, use bullet lists for loose notes:

- Talk to someone about something
- Check if that thing is still a *major problem*
- ~~Mount tablet on inside of coffin lid~~ Bad idea

Numbered lists for plans or sequences (you can indent with spaces too):

1. Scope out the warehouse
   1. Bring binoculars
   2. Pick up some explosives
2. Decide whether to tell the Coterie
3. Drink blood and go to bed

### Blockquotes

Use blockquotes for dramatic moments, ridiculous quotes, or things you want to remember:

> "Some motherfuckers are always trying to ice-skate uphill." —Blade, *Blade (1998)*

---

#### Tips

- **This reference note resets when you click New Session.** Your other notes are safe, private, and synced to this character. You can mess around in this one as much as you want!
- Create separate notes for *NPCs*, **locations**, or ***session logs*** (or whatever). Use the notebook however works best for you.
- Keep session notes concise & evocative. You can delete old stuff, but once it's gone, it's **gone!**`;

export const NOTEBOOK_HELP_NOTE: Note = {
  id: NOTEBOOK_HELP_ID,
  title: 'Notebook Help',
  body: NOTEBOOK_HELP_BODY,
};

/* Empty character: createCharacter's base and stripMetadata's field whitelist (absent
   keys drop on load). Here, not persistence.ts, so the default signal avoids a cycle. */
export const BLANK_CHARACTER: CharacterState = {
  name: '',
  portraits: [],
  playbook: '',
  predatorType: '',
  ageBracket: '',
  bio: { apparentAge: '', vampiricAge: '', pronouns: ['', ''], height: '', weight: '', style: '', occupation: '' },
  archetypeName: '',
  customArchetypeName: '',
  customArchetypeTagline: '',
  stats: { Blood: 0, Shadow: 0, Resolve: 0, Demeanor: 0, Wits: 0 },
  unlockedDisciplines: [],
  startingDisciplines: [],
  knownPowers: [],
  knownProjectPowers: [],
  advancedMoves: [],
  pendingUpgrades: [],
  bp: 0,
  hunger: 0,
  humanity: 7,
  stains: 0,
  harm: { superficial: 0, aggravated: 0 },
  xp: 0,
  xpTriggers: [],
  debts: [],
  modifiers: [],
  convictions: [''],
  touchstones: [{ name: '', pronouns: ['', ''], ageBracket: '', description: '' }],
  merits: [],
  flaws: [],
  folkloricBanes: [],
  baneChoice: 'standard',
  ghoulPatron: null,
  customTheme: null,
  creationComplete: false,
  creationStep: 'name',
  tourComplete: false,
  clocks: [],
  notes: [{ ...NOTEBOOK_HELP_NOTE }],
  initiative: '',
  combatNotes: '',
  bloodSurgesUsed: 0,
  bloodSurgeAdvantages: 0,
  quickHealUsedThisScene: false,
  bioCollapsed: false,
  items: [],
};

export const character = signal<CharacterState>(structuredClone(BLANK_CHARACTER));

export function updateCharacter(patch: Partial<CharacterState>) {
  character.value = { ...character.value, ...patch };
}

export function setPortraitCrop(index: number, crop: { x: number; y: number; scale: number }) {
  const portraits = character.value.portraits.map((p, i) => (i === index ? { ...p, ...crop } : p));
  character.value = { ...character.value, portraits };
}

export function setCustomTheme(ct: CustomTheme | null) {
  character.value = { ...character.value, customTheme: ct };
}

/* Merge a partial into the existing custom theme. No-ops if it was cleared concurrently
   (e.g. a cross-device sync) so a stale edit can't resurrect a ghost theme; enabling goes
   through setCustomTheme instead. */
export function patchCustomTheme(patch: Partial<CustomTheme>) {
  const current = character.value.customTheme;
  if (!current) return;
  character.value = { ...character.value, customTheme: { ...current, ...patch } };
}

export function setStats(stats: Record<StatName, number>) {
  character.value = { ...character.value, stats };
}

export function adjustStat(stat: StatName, delta: number, cap: number) {
  const next = { ...character.value.stats };
  next[stat] = Math.max(-1, Math.min(cap, next[stat] + delta));
  character.value = { ...character.value, stats: next };
}

export function learnPower(powerName: string) {
  if (character.value.knownPowers.includes(powerName)) return;
  character.value = {
    ...character.value,
    knownPowers: [...character.value.knownPowers, powerName],
  };
}

export function unlearnPower(powerName: string) {
  character.value = {
    ...character.value,
    knownPowers: character.value.knownPowers.filter(p => p !== powerName),
  };
}

export function learnProjectPower(name: string) {
  if (character.value.knownProjectPowers.includes(name)) return;
  character.value = {
    ...character.value,
    knownProjectPowers: [...character.value.knownProjectPowers, name],
  };
}

export function unlearnProjectPower(name: string) {
  character.value = {
    ...character.value,
    knownProjectPowers: character.value.knownProjectPowers.filter(n => n !== name),
  };
}

export function setHunger(hunger: number) {
  character.value = { ...character.value, hunger: Math.max(0, Math.min(5, hunger)) };
}

export function setBP(bp: number) {
  character.value = { ...character.value, bp: Math.max(0, Math.min(5, bp)) };
}

export function setXP(xp: number) {
  character.value = { ...character.value, xp: Math.max(0, Math.min(10, xp)) };
}

export function setHumanity(humanity: number, stains: number) {
  const h = Math.max(0, Math.min(10, humanity));
  /* Stains fill the track to the right of Humanity, so they cap at 10 - h. */
  character.value = {
    ...character.value,
    humanity: h,
    stains: Math.max(0, Math.min(10 - h, stains)),
  };
}

export const BP_HP: Record<number, number> = { 0: 6, 1: 6, 2: 9, 3: 12, 4: 15, 5: 18 };

/* Fortitude's Resilience Perk (automatic with Discipline access) adds HP equal to BP (min +1). */
export function fortitudeBonusHP(char: CharacterState): number {
  const hasFortitude = char.unlockedDisciplines.includes('fortitude')
    || char.startingDisciplines.includes('fortitude');
  return hasFortitude ? Math.max(1, char.bp) : 0;
}

export function maxHPFor(char: CharacterState): number {
  return (BP_HP[char.bp] ?? 6) + fortitudeBonusHP(char);
}

export function setHarm(superficial: number, aggravated: number) {
  const hp = maxHPFor(character.value);
  const agg = Math.min(Math.max(0, aggravated), hp);
  const sup = Math.min(Math.max(0, superficial), hp - agg);
  character.value = {
    ...character.value,
    harm: { superficial: sup, aggravated: agg },
  };
}

export interface StainOutcome {
  humanity: number;
  stains: number;
  lostHumanity: boolean;
}

/* Marking a Stain costs 1 Humanity (and clears Stains) once Stains hit 5 or fill the
   remaining track, whichever comes first. */
export function applyStain(humanity: number, stains: number): StainOutcome {
  const next = stains + 1;
  if (next >= 5 || humanity + next >= 10) {
    return { humanity: Math.max(0, humanity - 1), stains: 0, lostHumanity: true };
  }
  return { humanity, stains: next, lostHumanity: false };
}

export interface RemorseOutcome {
  humanity: number;
  stains: number;
  safe: boolean;
}

/* Roll strictly over your Stains to hold Humanity, else lose 1. Either way, Stains clear. */
export function resolveRemorse(humanity: number, stains: number, roll: number): RemorseOutcome {
  const safe = roll > stains;
  return { humanity: safe ? humanity : Math.max(0, humanity - 1), stains: 0, safe };
}

/* Mending Superficial Harm restores BP boxes, minimum 1. */
export function superficialHealAmount(bp: number): number {
  return Math.max(1, bp);
}

/* Slumber repairs 1 + BP Aggravated Harm. */
export function aggravatedHealAmount(bp: number): number {
  return 1 + bp;
}

export interface SlumberHealOutcome {
  superficial: number;
  aggravated: number;
  superficialHealed: number;
  aggravatedHealed: number;
}

/* Healing on waking. Superficial fully clears if you Fed the prior night; Aggravated
   heals 1+BP only if you bedded down at 2 Hunger or below. hungerAtBed is the Hunger you
   slept at, before the wake +1. */
export function slumberHeal(
  harm: { superficial: number; aggravated: number },
  bp: number,
  hungerAtBed: number,
  fedLastNight: boolean,
): SlumberHealOutcome {
  let superficial = harm.superficial;
  let aggravated = harm.aggravated;
  let superficialHealed = 0;
  let aggravatedHealed = 0;

  if (fedLastNight) {
    superficialHealed = superficial;
    superficial = 0;
  }
  if (hungerAtBed <= 2) {
    const next = Math.max(0, aggravated - aggravatedHealAmount(bp));
    aggravatedHealed = aggravated - next;
    aggravated = next;
  }
  return { superficial, aggravated, superficialHealed, aggravatedHealed };
}

export function fireXPTrigger(index: number) {
  if (character.value.xpTriggers[index]) return;
  const triggers = [...character.value.xpTriggers];
  triggers[index] = true;
  character.value = {
    ...character.value,
    xpTriggers: triggers,
    xp: Math.min(character.value.xp + 1, 10),
  };
}

export function addClock(name: string, segments: 4 | 6 | 8, condition?: string) {
  const clock: Clock = {
    id: crypto.randomUUID(),
    name,
    segments,
    filled: 0,
    condition,
  };
  character.value = {
    ...character.value,
    clocks: [...character.value.clocks, clock],
  };
}

export function removeClock(id: string) {
  character.value = {
    ...character.value,
    clocks: character.value.clocks.filter(c => c.id !== id),
  };
}

export function fillClockSegment(id: string) {
  character.value = {
    ...character.value,
    clocks: character.value.clocks.map(c =>
      c.id === id && c.filled < c.segments
        ? { ...c, filled: c.filled + 1 }
        : c
    ),
  };
}

export function unfillClockSegment(id: string) {
  character.value = {
    ...character.value,
    clocks: character.value.clocks.map(c =>
      c.id === id && c.filled > 0
        ? { ...c, filled: c.filled - 1 }
        : c
    ),
  };
}

export function addModifier(mod: Omit<Modifier, 'id' | 'value'> & { value?: number }) {
  if (mod.type === 'hold') {
    const holdCount = character.value.modifiers.filter(m => m.type === 'hold').length;
    if (holdCount >= MAX_HOLD_COUNTERS) return;
  }
  const full: Modifier = {
    id: crypto.randomUUID(),
    type: mod.type,
    value: mod.value ?? (mod.type === 'advantage' || mod.type === 'disadvantage' ? 0 : 1),
    target: mod.target,
    source: mod.source,
    ...(mod.spendOn ? { spendOn: mod.spendOn } : {}),
    ...(mod.stats && mod.stats.length ? { stats: mod.stats } : {}),
  };
  character.value = {
    ...character.value,
    modifiers: [...character.value.modifiers, full],
  };
}

export function removeModifier(id: string) {
  character.value = {
    ...character.value,
    modifiers: character.value.modifiers.filter(m => m.id !== id),
  };
}

export function adjustModifierValue(id: string, delta: number) {
  const updated: Modifier[] = [];
  for (const m of character.value.modifiers) {
    if (m.id !== id) { updated.push(m); continue; }
    if (m.type === 'advantage' || m.type === 'disadvantage') { updated.push(m); continue; }
    const next = m.type === 'hold'
      ? Math.max(0, m.value + delta)
      : Math.max(-5, Math.min(5, m.value + delta));
    if (m.type === 'hold' && next <= 0) continue;
    updated.push({ ...m, value: next });
  }
  character.value = { ...character.value, modifiers: updated };
}

export function clearForwards(rolledStat?: StatName) {
  character.value = {
    ...character.value,
    modifiers: character.value.modifiers.filter(m => {
      if (m.type !== 'forward') return true;
      if (!rolledStat || !m.stats) return false;
      return !m.stats.includes(rolledStat);
    }),
  };
}

export function clearHolds() {
  character.value = {
    ...character.value,
    modifiers: character.value.modifiers.filter(m => m.type !== 'hold'),
  };
}

/* True while a Blood Surge is still "active" — banked advantages remain or one is armed.
   The rulebook forbids re-activating until the previous surge is fully spent or expires. */
export function bloodSurgeActive(): boolean {
  const char = character.value;
  return char.bloodSurgeAdvantages > 0
    || char.modifiers.some(m => m.type === 'advantage' && m.source === BLOOD_SURGE_SOURCE);
}

/* Bank a fresh pool of advantages and spend one of the night's surges. */
export function bankBloodSurge(amount: number) {
  character.value = {
    ...character.value,
    bloodSurgeAdvantages: amount,
    bloodSurgesUsed: character.value.bloodSurgesUsed + 1,
  };
}

/* Blood Surge: bank BP advantages and arm one free Advantage on the next roll (BP+1 total). */
export function bloodSurge(bp: number) {
  bankBloodSurge(bp);
  addModifier({ type: 'advantage', target: null, source: BLOOD_SURGE_SOURCE });
}

/* Arm the next roll with one banked advantage (a one-shot, consumed when the roll fires). */
export function armBloodSurge() {
  const char = character.value;
  if (char.bloodSurgeAdvantages <= 0) return;
  if (char.modifiers.some(m => m.type === 'advantage' && m.source === BLOOD_SURGE_SOURCE)) return;
  character.value = { ...char, bloodSurgeAdvantages: char.bloodSurgeAdvantages - 1 };
  addModifier({ type: 'advantage', target: null, source: BLOOD_SURGE_SOURCE });
}

/* Toggle the next roll's Blood Surge arm; disarming refunds the banked advantage. */
export function toggleBloodSurge() {
  const char = character.value;
  const armed = char.modifiers.some(m => m.type === 'advantage' && m.source === BLOOD_SURGE_SOURCE);
  if (!armed) { armBloodSurge(); return; }
  character.value = {
    ...char,
    bloodSurgeAdvantages: char.bloodSurgeAdvantages + 1,
    modifiers: char.modifiers.filter(m => !(m.type === 'advantage' && m.source === BLOOD_SURGE_SOURCE)),
  };
}

/* Advantage/Disadvantage are one-shot like Forward: cleared after a roll, which also consumes an armed surge. */
export function clearDiceMode() {
  character.value = {
    ...character.value,
    modifiers: character.value.modifiers.filter(m => m.type !== 'advantage' && m.type !== 'disadvantage'),
  };
}

export function newScene() {
  character.value = {
    ...character.value,
    modifiers: character.value.modifiers.filter(m =>
      m.type !== 'forward' && m.type !== 'hold'
      && !(m.type === 'advantage' && m.source === BLOOD_SURGE_SOURCE)
    ),
    bloodSurgeAdvantages: 0,
    quickHealUsedThisScene: false,
    initiative: '',
    combatNotes: '',
  };
}

function quickAdjustUniversal(type: 'forward' | 'ongoing', delta: number) {
  const mods = character.value.modifiers;
  const existing = mods.find(m => m.type === type && m.source === MANUAL_SOURCE && !m.target);
  if (existing) {
    const next = Math.max(-5, Math.min(5, existing.value + delta));
    if (next === 0) {
      removeModifier(existing.id);
    } else {
      character.value = {
        ...character.value,
        modifiers: mods.map(m => m.id === existing.id ? { ...m, value: next } : m),
      };
    }
  } else if (delta !== 0) {
    addModifier({ type, value: Math.max(-5, Math.min(5, delta)), target: null, source: MANUAL_SOURCE });
  }
}

export function quickAdjustForward(delta: number) { quickAdjustUniversal('forward', delta); }
export function quickAdjustOngoing(delta: number) { quickAdjustUniversal('ongoing', delta); }

export function quickAddHold() {
  const holdCount = character.value.modifiers.filter(m => m.type === 'hold').length;
  if (holdCount >= MAX_HOLD_COUNTERS) return;
  addModifier({ type: 'hold', value: 1, target: null, source: MANUAL_SOURCE });
}

// The arrows negate one another: a standing opposite cancels back to Flat before the
// chosen one can be set, so a single click never jumps straight across the two states.
function quickToggleEither(self: 'advantage' | 'disadvantage', other: 'advantage' | 'disadvantage') {
  const mods = character.value.modifiers;
  const existingOther = mods.find(m => m.type === other && m.source === MANUAL_SOURCE);
  const existingSelf = mods.find(m => m.type === self && m.source === MANUAL_SOURCE);
  if (existingOther) { removeModifier(existingOther.id); return; }
  if (existingSelf) { removeModifier(existingSelf.id); return; }
  addModifier({ type: self, target: null, source: MANUAL_SOURCE });
}

export function quickToggleAdvantage() { quickToggleEither('advantage', 'disadvantage'); }

export function addDebt(direction: 'owed' | 'owe', who: string, text: string) {
  character.value = {
    ...character.value,
    debts: [...character.value.debts, { id: crypto.randomUUID(), who, text, direction, state: 'empty' }],
  };
}

export function removeDebt(id: string) {
  character.value = {
    ...character.value,
    debts: character.value.debts.filter(d => d.id !== id),
  };
}

export function updateDebt(id: string, patch: Partial<Pick<Debt, 'who' | 'text'>>) {
  character.value = {
    ...character.value,
    debts: character.value.debts.map(d =>
      d.id === id ? { ...d, ...patch } : d
    ),
  };
}

export function cycleDebtState(id: string, reverse: boolean) {
  const cycle: Debt['state'][] = ['empty', 'slashed', 'filled'];
  character.value = {
    ...character.value,
    debts: character.value.debts.map(d => {
      if (d.id !== id) return d;
      const idx = cycle.indexOf(d.state);
      const next = reverse
        ? cycle[(idx - 1 + cycle.length) % cycle.length]
        : cycle[(idx + 1) % cycle.length];
      return { ...d, state: next };
    }),
  };
}

export function quickToggleDisadvantage() { quickToggleEither('disadvantage', 'advantage'); }


/* Buy an Advanced Move for 5 XP; no-op if unaffordable or already owned. */
export function buyAdvancedMove(name: string) {
  const cur = character.value;
  if (cur.xp < 5 || cur.advancedMoves.includes(name)) return;
  updateCharacter({ advancedMoves: [...cur.advancedMoves, name], xp: cur.xp - 5 });
}

export function addPendingUpgrade(upgrade: Omit<PendingUpgrade, 'id'>) {
  character.value = {
    ...character.value,
    pendingUpgrades: [
      ...character.value.pendingUpgrades,
      { ...upgrade, id: crypto.randomUUID() },
    ],
  };
}

export function removePendingUpgrade(id: string) {
  const upgrade = character.value.pendingUpgrades.find(u => u.id === id);
  if (!upgrade) return;
  character.value = {
    ...character.value,
    xp: Math.min(10, Math.max(0, character.value.xp + upgrade.xpCost)),
    pendingUpgrades: character.value.pendingUpgrades.filter(u => u.id !== id),
  };
}

function applyPendingUpgrades() {
  const pending = character.value.pendingUpgrades;
  if (pending.length === 0) return;

  let newBP = character.value.bp;
  const newDisciplines = [...character.value.unlockedDisciplines];
  const newPowers = [...character.value.knownPowers];

  for (const u of pending) {
    if (u.type === 'bp') {
      newBP = Math.min(5, newBP + 1);
    } else if (u.type === 'discipline-access' && u.slug && !newDisciplines.includes(u.slug)) {
      newDisciplines.push(u.slug);
    } else if (u.type === 'discipline-power' && u.powerName && !newPowers.includes(u.powerName)) {
      newPowers.push(u.powerName);
    }
  }

  character.value = {
    ...character.value,
    bp: newBP,
    unlockedDisciplines: newDisciplines,
    knownPowers: newPowers,
    pendingUpgrades: [],
  };
}

export function newNight(fedLastNight = false): SlumberHealOutcome {
  /* Snapshot before upgrades: healing uses the BP and Hunger you slept with, not a BP
     a pending upgrade grants on waking. */
  const { harm: harmAtBed, bp: bpAtBed, hunger: hungerAtBed } = character.value;
  applyPendingUpgrades();
  const heal = slumberHeal(harmAtBed, bpAtBed, hungerAtBed, fedLastNight);
  character.value = {
    ...character.value,
    hunger: Math.min(5, hungerAtBed + 1),
    harm: { superficial: heal.superficial, aggravated: heal.aggravated },
    bloodSurgesUsed: 0,
    bloodSurgeAdvantages: 0,
    quickHealUsedThisScene: false,
    modifiers: character.value.modifiers.filter(m => !(m.type === 'advantage' && m.source === BLOOD_SURGE_SOURCE)),
  };
  return heal;
}

export function newSession() {
  const notes = character.value.notes.map(n =>
    n.id === NOTEBOOK_HELP_ID ? { ...NOTEBOOK_HELP_NOTE } : n,
  );
  if (!notes.some(n => n.id === NOTEBOOK_HELP_ID)) {
    notes.unshift({ ...NOTEBOOK_HELP_NOTE });
  }
  character.value = {
    ...character.value,
    xpTriggers: character.value.xpTriggers.map(() => false),
    notes,
  };
}

export function addNote(title: string, body: string) {
  character.value = {
    ...character.value,
    notes: [...character.value.notes, { id: crypto.randomUUID(), title, body }],
  };
}

export function removeNote(id: string) {
  character.value = {
    ...character.value,
    notes: character.value.notes.filter(n => n.id !== id),
  };
}

export function updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'body'>>) {
  character.value = {
    ...character.value,
    notes: character.value.notes.map(n =>
      n.id === id ? { ...n, ...patch } : n
    ),
  };
}

export function reorderNotes(fromIndex: number, toIndex: number) {
  const notes = [...character.value.notes];
  const [moved] = notes.splice(fromIndex, 1);
  notes.splice(toIndex, 0, moved);
  character.value = { ...character.value, notes };
}

function setItems(items: Item[]) {
  character.value = { ...character.value, items };
}

export function addItem(init: Partial<Item> & { name: string; type: Item['type'] }): string {
  const id = crypto.randomUUID();
  const item: Item = {
    id,
    name: init.name,
    type: init.type,
    tags: init.tags ?? [],
    description: init.description ?? '',
    qty: init.qty ?? 1,
    equipped: init.equipped ?? false,
    isContainer: init.isContainer ?? false,
    containerId: init.containerId ?? null,
  };
  setItems([...character.value.items, item]);
  return id;
}

/* Raw field patch; re-checks the equip invariant so a patch can't leave a stowed or
   non-equippable item equipped. Equip toggling proper goes through toggleEquip. */
export function updateItem(id: string, patch: Partial<Omit<Item, 'id'>>) {
  setItems(character.value.items.map(i => {
    if (i.id !== id) return i;
    const next = { ...i, ...patch };
    if (next.equipped && !canEquip(next)) next.equipped = false;
    return next;
  }));
}

/* Deleting a container frees its children to loose rather than orphaning them. */
export function removeItem(id: string) {
  const items = character.value.items;
  const removed = items.find(i => i.id === id);
  let next = items.filter(i => i.id !== id);
  if (removed && isContainerItem(removed)) {
    next = next.map(i => (i.containerId === id ? { ...i, containerId: removed.containerId ?? null } : i));
  }
  setItems(next);
}

/* Move to loose (null), Stash, or an item-container. Containers nest freely; the guard
   rejects self-nesting and dropping a container into its own subtree. Clears equipped
   when stowed off-person. */
export function moveItem(id: string, target: string | null) {
  const items = character.value.items;
  const item = items.find(i => i.id === id);
  if (!item) return;

  const intoItemContainer = target !== null && target !== 'stash' && target !== 'haven';
  if (intoItemContainer) {
    if (target === id || isDescendant(items, id, target!)) return;
    const dest = items.find(i => i.id === target);
    if (!dest || !isContainerItem(dest)) return;
  }

  setItems(items.map(i =>
    i.id === id
      ? { ...i, containerId: target, equipped: target === null ? i.equipped : false }
      : i,
  ));
}

export function setItemQty(id: string, qty: number) {
  const q = Math.max(1, Math.floor(qty));
  setItems(character.value.items.map(i => (i.id === id ? { ...i, qty: q } : i)));
}

/* Toggle container status. Un-containering reparents children to where the container
   itself lived (parent bag, Stash, Haven, or loose) so Stash contents don't leak to Carried. */
export function setItemContainer(id: string, isContainer: boolean) {
  let next = character.value.items.map(i => (i.id === id ? { ...i, isContainer } : i));
  if (!isContainer) {
    const fallback = next.find(i => i.id === id)?.containerId ?? null;
    next = next.map(i => (i.containerId === id ? { ...i, containerId: fallback } : i));
  }
  setItems(next);
}

export function toggleEquip(id: string) {
  setItems(character.value.items.map(i => {
    if (i.id !== id || !canEquip(i)) return i;
    return { ...i, equipped: !i.equipped };
  }));
}

/* Remove `amount` from a stack for a hand-off; drops the row at 0. */
export function removeQtyFromItem(id: string, amount: number) {
  setItems(character.value.items.flatMap(i => {
    if (i.id !== id) return [i];
    const left = i.qty - amount;
    return left > 0 ? [{ ...i, qty: left }] : [];
  }));
}

/* Append a received item, idempotent on id so a re-claim from a stale queue no-ops. */
export function receiveItem(item: Item) {
  if (character.value.items.some(i => i.id === item.id)) return;
  setItems([...character.value.items, item]);
}

/* Reparent a container's children to loose. Called before a container leaves the
   inventory (gift) so its contents don't strand on a departed parent. */
export function freeContainerChildren(containerId: string) {
  setItems(character.value.items.map(i => i.containerId === containerId ? { ...i, containerId: null } : i));
}

/* Append several received items at once, skipping ids already present (idempotent like
   receiveItem). Used to pull a whole subtree out of the Haven in one write. */
export function receiveItems(incoming: Item[]) {
  const have = new Set(character.value.items.map(i => i.id));
  const fresh = incoming.filter(i => !have.has(i.id));
  if (fresh.length) setItems([...character.value.items, ...fresh]);
}

/* Drop a set of items by id in one write (a whole subtree leaving for the Haven). */
export function removeItems(ids: Set<string>) {
  setItems(character.value.items.filter(i => !ids.has(i.id)));
}
