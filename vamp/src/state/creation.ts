import { signal, computed } from '@preact/signals';
import { character, updateCharacter } from './character';
import { grantedDisciplineSlugs, currentPlaybook } from './derived';

export type CreationStep =
  | 'name'
  | 'playbook'
  | 'age'
  | 'predator'
  | 'disciplines'
  | 'convictions'
  | 'xp';

export const CREATION_STEPS: CreationStep[] = [
  'name', 'playbook', 'age',
  'predator', 'disciplines', 'convictions', 'xp',
];

export const STEP_ZONE: Record<CreationStep, 'sidebar' | 'content' | 'right'> = {
  name: 'sidebar',
  playbook: 'right',
  age: 'right',
  predator: 'right',
  disciplines: 'content',
  convictions: 'content',
  xp: 'right',
};

export const STEP_LABELS: Record<CreationStep, string> = {
  name: 'Name',
  playbook: 'Playbook/Stats',
  age: 'Age',
  predator: 'Predator Type',
  disciplines: 'Disciplines',
  convictions: 'Convictions/Touchstones',
  xp: 'XP',
};

export const STEP_MESSAGES: Record<CreationStep, string> = {
  name: '[SAM: Write a welcome message for the name step. This appears when the player first starts creating a character.]',
  playbook: '[SAM: Write a message explaining Playbooks and Archetypes. Players pick their Playbook here, then choose an Archetype or assign stats manually.]',
  age: '[SAM: Write a message about Age Brackets. Explains the five tiers and what they mean for the character.]',
  predator: '[SAM: Write a message about Predator Types. How your character hunts, what it says about them, and that Fledglings/Thin-Bloods/Ghouls/Devorari can skip this.]',
  disciplines: '[SAM: Write a message about Discipline selection. Granted vs. chosen, Powers per level, overlap bonuses from Predator Type.]',
  convictions: '[SAM: Write a message about Convictions and Touchstones. What they are, why they matter for Humanity, the 1-3 range.]',
  xp: '[SAM: Write a message about starting XP. The formula, what you can spend it on in the Advancement panel, and that unspent XP carries over.]',
};

export const STEP_WARNINGS: Record<CreationStep, string> = {
  name: "You haven't named your character yet.",
  playbook: "You haven't picked a Playbook yet.",
  age: "You haven't chosen an Age Bracket yet.",
  predator: "You haven't chosen a Predator Type yet.",
  disciplines: "You haven't finished picking Disciplines yet.",
  convictions: "You haven't added any Convictions or Touchstones yet.",
  xp: '',
};

export const creationMode = signal(false);
export const creationStep = signal<CreationStep>('name');
export const namePromptAnswered = signal(false);

const PREDATOR_SKIP_AGE = new Set(['Fledgling', 'Thin-Blood']);
const PREDATOR_SKIP_PLAYBOOK = new Set(['Devorari', 'Ghoul']);

function predatorSkippable(ageBracket: string, playbook: string): boolean {
  return PREDATOR_SKIP_AGE.has(ageBracket) || PREDATOR_SKIP_PLAYBOOK.has(playbook);
}

/* Minimum user picks required (excluding auto-granted Disciplines) */
function minUserPicks(playbook: string): number {
  if (playbook === 'Thin-Blood') return 0;
  if (playbook === 'Ghoul') return 1;
  const pb = currentPlaybook.value;
  if (!pb) return 2;
  if (/exclusive\s+access|granted|automatically\s+receive/i.test(pb.disciplines)) {
    /* Osirian has exclusive access but "Choose a former Clan" (no digit), not "Choose 1 additional" */
    return /choose\s+\d+/i.test(pb.disciplines) ? 1 : 0;
  }
  return 2;
}

function disciplineStepDone(c: { playbook: string; unlockedDisciplines: string[] }): boolean {
  const required = minUserPicks(c.playbook);
  if (required === 0) return true;
  const granted = grantedDisciplineSlugs.value;
  const userPicks = c.unlockedDisciplines.filter(s => !granted.has(s)).length;
  return userPicks >= required;
}

export const stepComplete = computed<Record<CreationStep, boolean>>(() => {
  const c = character.value;
  const statsAssigned = c.archetypeName !== '' && !Object.values(c.stats).some(v => isNaN(v));
  return {
    name: c.name.trim().length > 0,
    playbook: c.playbook !== '' && statsAssigned,
    age: c.ageBracket !== '',
    predator: c.predatorType !== '' || predatorSkippable(c.ageBracket, c.playbook),
    disciplines: disciplineStepDone(c),
    convictions: c.convictions.some(cv => cv.trim() !== '')
      && c.touchstones.some(t => t.name.trim() !== ''),
    xp: true,
  };
});

export const allStepsComplete = computed(() =>
  CREATION_STEPS.every(step => stepComplete.value[step]),
);

function setStep(step: CreationStep) {
  creationStep.value = step;
  updateCharacter({ creationStep: step });
}

export function goToStep(step: CreationStep) {
  setStep(step);
}

export function nextStep() {
  const idx = CREATION_STEPS.indexOf(creationStep.value);
  if (idx < CREATION_STEPS.length - 1) {
    setStep(CREATION_STEPS[idx + 1]);
  }
}

export function prevStep() {
  const idx = CREATION_STEPS.indexOf(creationStep.value);
  if (idx > 0) {
    setStep(CREATION_STEPS[idx - 1]);
  }
}

export function enterCreationMode() {
  creationMode.value = true;
  namePromptAnswered.value = false;
  let saved = character.value.creationStep as CreationStep;
  if (saved === 'stats' as string) saved = 'playbook';
  creationStep.value = CREATION_STEPS.includes(saved) ? saved : 'name';
}

export function exitCreationMode() {
  creationMode.value = false;
}

/* Returns warning text if current step is incomplete, or null if clear to proceed */
export function currentStepWarning(): string | null {
  const step = creationStep.value;
  if (stepComplete.value[step]) return null;
  return STEP_WARNINGS[step] || null;
}

/* Returns list of incomplete step labels for the finish gate */
export function incompleteSteps(): string[] {
  return CREATION_STEPS
    .filter(s => !stepComplete.value[s])
    .map(s => STEP_LABELS[s]);
}
