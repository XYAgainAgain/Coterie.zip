import { signal } from '@preact/signals';
import type { StatName } from '../data/types';

export interface Debt {
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
  stats: Record<StatName, number>;
  unlockedDisciplines: string[];
  knownPowers: string[];
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
  merits: { name: string; xpCost: string }[];
  flaws: { name: string; xpGain: string }[];
  folkloricBanes: { baneName: string; xpGain: string; fromPlaybookBane: boolean }[];
  baneChoice: 'standard' | 'variant' | 'both';
  ghoulPatron: GhoulPatron | null;
  creationComplete: boolean;
  creationStep: string;
  tourComplete: boolean;
  clocks: Clock[];
  notes: Note[];
}

export const NOTEBOOK_HELP_ID = '1998';

const NOTEBOOK_HELP_BODY = `# Notebook Help

Your Notebook tab is a scratchpad for anything you want to track during a ***Coterie*** session. Notes support **markdown formatting**, so you can keep things organized and import/export at will. Here's a guide!

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
   2. Pick up

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

const JOHNNY_FANGS: CharacterState = {
  name: 'Johnny Fangs',
  portraits: [{ url: 'https://i.imgur.com/ELvdOgp.jpeg', x: 50, y: 50, scale: 1 }],
  playbook: 'Banu Haqim',
  predatorType: 'Consensualist',
  ageBracket: 'Fledgling',
  bio: { apparentAge: '28', vampiricAge: '3', pronouns: ['he', 'him'], height: '5\'10"', weight: '165 lbs', style: 'Leather jacket, slicked-back hair', occupation: 'Bouncer' },
  archetypeName: 'Greaser',
  stats: { Blood: 1, Shadow: 1, Resolve: -1, Demeanor: 0, Wits: 2 },
  unlockedDisciplines: ['celerity', 'obfuscate'],
  knownPowers: [
    'Sense the Unseen',
    'Rapid Reflexes',
    'Traversal',
    'Silence of Death',
  ],
  bp: 1,
  hunger: 2,
  humanity: 8,
  stains: 1,
  harm: { superficial: 2, aggravated: 1 },
  xp: 3,
  xpTriggers: [false, false, false],
  debts: [
    { who: 'Alejandro', text: 'You kept quiet about his unsanctioned feeding grounds', direction: 'owed', state: 'empty' },
    { who: 'Nadia', text: 'You saved her ghoul from a Sabbat ambush', direction: 'owed', state: 'slashed' },
    { who: 'The Prince', text: 'Overlooked your Sire breaking Tradition when Embracing you', direction: 'owe', state: 'empty' },
  ],
  modifiers: [
    { id: 'm1', type: 'forward', value: 1, target: 'Influence', source: 'Auspex: Premonition' },
    { id: 'm2', type: 'ongoing', value: 2, target: null, source: 'Heightened Senses' },
    { id: 'm3', type: 'hold', value: 3, target: null, source: 'Discern Vibes', spendOn: 'ask a question about what you see' },
    { id: 'm4', type: 'forward', value: -1, target: null, source: MANUAL_SOURCE },
    { id: 'm5', type: 'advantage', value: 0, target: null, source: 'Obfuscate' },
  ],
  convictions: [
    '"I will never harm an innocent."',
    '"The strong must protect the weak."',
  ],
  touchstones: [
    { name: 'Marcus', pronouns: ['he', 'him'], ageBracket: 'Mature Adult', description: 'mortal friend, bartender at The Red Door' },
    { name: 'Elena', pronouns: ['she', 'her'], ageBracket: 'Young Adult', description: 'former colleague, social worker' },
  ],
  merits: [],
  flaws: [],
  folkloricBanes: [],
  baneChoice: 'standard',
  ghoulPatron: null,
  creationComplete: true,
  creationStep: 'name',
  tourComplete: true,
  clocks: [
    { id: 'c1', name: 'Find the Sabbat Safe House', segments: 6, filled: 2 },
    { id: 'c2', name: 'Blood Bond to Alejandro', segments: 4, filled: 0, condition: 'Fully Bound at 4' },
  ],
  notes: [
    { ...NOTEBOOK_HELP_NOTE },
    { id: 'n1', title: 'Session 1', body: 'Met Katie at the house party. She knows about us.\n\nNeed to figure out how to handle this.' },
    { id: 'n2', title: 'Safe House Intel', body: 'Alejandro mentioned a warehouse on **Pier 7**. Sabbat presence suspected.' },
  ],
};

export const character = signal<CharacterState>(JOHNNY_FANGS);

export function updateCharacter(patch: Partial<CharacterState>) {
  character.value = { ...character.value, ...patch };
}

export function setStats(stats: Record<StatName, number>) {
  character.value = { ...character.value, stats };
}

export function learnPower(powerName: string) {
  if (character.value.knownPowers.includes(powerName)) return;
  character.value = {
    ...character.value,
    knownPowers: [...character.value.knownPowers, powerName],
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
  character.value = {
    ...character.value,
    humanity: h,
    stains: Math.max(0, Math.min(h, stains)),
  };
}

export const BP_HP: Record<number, number> = { 0: 6, 1: 6, 2: 9, 3: 12, 4: 15, 5: 18 };

export function setHarm(superficial: number, aggravated: number) {
  const hp = BP_HP[character.value.bp] ?? 6;
  const agg = Math.min(Math.max(0, aggravated), hp);
  const sup = Math.min(Math.max(0, superficial), hp - agg);
  character.value = {
    ...character.value,
    harm: { superficial: sup, aggravated: agg },
  };
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

export function clearForwards() {
  character.value = {
    ...character.value,
    modifiers: character.value.modifiers.filter(m => m.type !== 'forward'),
  };
}

export function quickAdjustForward(delta: number) {
  const mods = character.value.modifiers;
  const existing = mods.find(m => m.type === 'forward' && m.source === MANUAL_SOURCE && !m.target);
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
    addModifier({ type: 'forward', value: Math.max(-5, Math.min(5, delta)), target: null, source: MANUAL_SOURCE });
  }
}

export function quickAdjustOngoing(delta: number) {
  const mods = character.value.modifiers;
  const existing = mods.find(m => m.type === 'ongoing' && m.source === MANUAL_SOURCE && !m.target);
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
    addModifier({ type: 'ongoing', value: Math.max(-5, Math.min(5, delta)), target: null, source: MANUAL_SOURCE });
  }
}

export function quickAddHold() {
  const holdCount = character.value.modifiers.filter(m => m.type === 'hold').length;
  if (holdCount >= MAX_HOLD_COUNTERS) return;
  addModifier({ type: 'hold', value: 1, target: null, source: MANUAL_SOURCE });
}

export function quickToggleAdvantage() {
  const mods = character.value.modifiers;
  const existingAdv = mods.find(m => m.type === 'advantage' && m.source === MANUAL_SOURCE);
  const existingDis = mods.find(m => m.type === 'disadvantage' && m.source === MANUAL_SOURCE);
  if (existingAdv) {
    removeModifier(existingAdv.id);
  } else {
    if (existingDis) removeModifier(existingDis.id);
    addModifier({ type: 'advantage', target: null, source: MANUAL_SOURCE });
  }
}

export function quickToggleDisadvantage() {
  const mods = character.value.modifiers;
  const existingDis = mods.find(m => m.type === 'disadvantage' && m.source === MANUAL_SOURCE);
  const existingAdv = mods.find(m => m.type === 'advantage' && m.source === MANUAL_SOURCE);
  if (existingDis) {
    removeModifier(existingDis.id);
  } else {
    if (existingAdv) removeModifier(existingAdv.id);
    addModifier({ type: 'disadvantage', target: null, source: MANUAL_SOURCE });
  }
}


export function newNight() {
  setHunger(character.value.hunger + 1);
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
