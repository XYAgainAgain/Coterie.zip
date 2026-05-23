import { signal, computed } from '@preact/signals';
import { character, updateCharacter } from './character';

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

export const STEP_LABELS: Record<CreationStep, string> = {
  name: 'Name',
  playbook: 'Playbook/Stats',
  age: 'Age',
  predator: 'Predator Type',
  disciplines: 'Disciplines',
  convictions: 'Convictions/Touchstones',
  xp: 'XP',
};

export const creationMode = signal(false);
export const creationStep = signal<CreationStep>('name');

const PREDATOR_SKIP_AGE = new Set(['Fledgling', 'Thin-Blood']);
const PREDATOR_SKIP_PLAYBOOK = new Set(['Devorari', 'Ghoul']);

function predatorSkippable(ageBracket: string, playbook: string): boolean {
  return PREDATOR_SKIP_AGE.has(ageBracket) || PREDATOR_SKIP_PLAYBOOK.has(playbook);
}

export const stepComplete = computed<Record<CreationStep, boolean>>(() => {
  const c = character.value;
  const statsAssigned = c.archetypeName !== '' && !Object.values(c.stats).some(v => isNaN(v));
  return {
    name: c.name.trim().length > 0,
    playbook: c.playbook !== '' && statsAssigned,
    age: c.ageBracket !== '',
    predator: c.predatorType !== '' || predatorSkippable(c.ageBracket, c.playbook),
    disciplines: c.unlockedDisciplines.length >= 2,
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
  let saved = character.value.creationStep as CreationStep;
  if (saved === 'stats' as string) saved = 'playbook';
  creationStep.value = CREATION_STEPS.includes(saved) ? saved : 'name';
}

export function exitCreationMode() {
  creationMode.value = false;
}
