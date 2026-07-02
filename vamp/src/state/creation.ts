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

export const STEP_ZONE: Record<CreationStep, string> = {
  name: 'beside-sidebar',
  playbook: 'beside-right',
  age: 'beside-right',
  predator: 'beside-right',
  disciplines: 'vitals',
  convictions: 'vitals',
  xp: 'beside-right-center',
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
  name: "Do you know who you are creating? If so, enter a name and a URL for a character portrait. It must point to an image hosted somewhere stable like Imgur (avoid Discord links — they expire after a few days!), and you can also enter any other personal info you would like to include in the fields below by double-clicking them.",
  playbook: "If you have not yet chosen a Playbook, you must do that. There are 22 to choose from; feel free to explore them here or on the main site, and select one that suits your character. This will give you access to Disciplines, along with assigning a Bane, Compulsion, and XP triggers.",
  age: "You will need to determine your age (which also determines your starting Blood Potency). Semimortal works only for Ghouls and Thin-Bloods. If you choose to play any other type of character, feel free to choose whichever one makes the most sense, but remember: higher BP does not always equal better! There are major trade-offs!",
  predator: "Now you must select how you **Hunt** for prey. This will give you access to an additional Discipline, or possibly duplicate one of the ones already available to you, and will determine which stat you use for the **Hunt** Basic Move. They also grant a Merit and a Flaw each, and some even affect your starting Humanity.",
  disciplines: "These are the categories of vampiric abilities you have access to. Select as many as you are allowed to — many Clanless Playbooks grant exclusive Discipline access plus allow you other choices. You will also receive one (or have one duplicated) by your Predator Type. You may choose **one Power per level you can access!** If a Discipline is duplicated by your Predator Type, you can select one additional Power of any level you can access for free, as long as you meet its requirements.",
  convictions: "These are Always or Never statements that align with the morals of your character. Each one has an associated Touchstone, a mortal who represents or embodies each Conviction. These are critical to keeping your Humanity at a decent level, and for injecting drama into lots of scenes. Come up with 2–4.",
  xp: "Depending upon your Blood Potency, you will receive a budget of starting XP. You can get more by voluntarily taking on Flaws or Folkloric Banes, and spend it on lots of different things, like BP increases, Advanced versions of Basic Moves, Discipline access and Powers, and lots more. This is the Advancement panel; you will return here during play to spend XP as you earn it. Remember: you can only ever hold 10 XP at a time, and upgrades do not apply until after your next slumber.",
};

export const STEP_WARNINGS: Record<CreationStep, string> = {
  name: "You haven't named your character yet!",
  playbook: "You haven't picked a Playbook yet!",
  age: "You haven't chosen an Age Bracket yet!",
  predator: "You haven't chosen a Predator Type yet!",
  disciplines: "You haven't finished picking Disciplines yet!",
  convictions: "You need at least 2 Convictions with linked Touchstones!",
  xp: '',
};

export const creationMode = signal(false);
export const creationStep = signal<CreationStep>('name');
export const namePromptAnswered = signal(false);

const PREDATOR_SKIP_AGE = new Set(['Fledgling']);
const PREDATOR_SKIP_PLAYBOOK = new Set(['Devorari', 'Ghoul']);

/* Ghouls/Thin-Bloods locked to auto-Semimortal; Ghouls don't get Pred Type, guide skips both. */
export function stepIrrelevant(step: CreationStep): boolean {
  const pb = character.value.playbook;
  if (step === 'age') return pb === 'Ghoul' || pb === 'Thin-Blood';
  if (step === 'predator') return pb === 'Ghoul';
  return false;
}

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
    convictions: c.convictions.filter(cv => cv.trim() !== '').length >= 2
      && c.touchstones.filter(t => t.name.trim() !== '').length >= 2,
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
  if (step === 'playbook') return playbookStepWarning();
  return STEP_WARNINGS[step] || null;
}

function playbookStepWarning(): string {
  const c = character.value;
  if (c.playbook === '') return STEP_WARNINGS.playbook;
  if (c.archetypeName === '') return "You haven't chosen an Archetype yet!";
  return "Your stats haven't been assigned yet!";
}
