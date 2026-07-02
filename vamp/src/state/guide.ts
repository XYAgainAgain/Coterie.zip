import { signal, computed } from '@preact/signals';
import { character, updateCharacter } from './character';
import {
  type CreationStep,
  CREATION_STEPS, STEP_ZONE, STEP_LABELS, STEP_MESSAGES, STEP_WARNINGS,
  creationMode, creationStep, namePromptAnswered, stepComplete,
  currentStepWarning, stepIrrelevant,
} from './creation';
import { TOUR_STEPS } from './tour';
import { splitMode, type RPanelTab, type ContentTab } from './panel';

export type GuidePhase = 'creation' | 'tour';

export type GuideZone = 'sidebar' | 'content' | 'right' | 'vitals'
  | 'toolbar-left' | 'toolbar-right' | 'header'
  | 'beside-sidebar' | 'beside-right' | 'beside-right-center' | 'center';

export interface GuideStep {
  id: string;
  phase: GuidePhase;
  zone: GuideZone;
  label: string;
  message: string;
  contentTab: ContentTab | null;
  rightTab: RPanelTab | null;
  creationStep?: CreationStep;
}

function buildCreationGuideSteps(): GuideStep[] {
  return CREATION_STEPS.map(cs => ({
    id: `creation-${cs}`,
    phase: 'creation' as const,
    zone: STEP_ZONE[cs] as GuideZone,
    label: STEP_LABELS[cs],
    message: STEP_MESSAGES[cs],
    contentTab: cs === 'convictions' ? 'vitals' : cs === 'disciplines' ? 'disciplines' : null,
    rightTab: cs === 'xp' ? 'advancement' as RPanelTab
      : ['playbook', 'age', 'predator'].includes(cs) ? 'character' as RPanelTab
      : null,
    creationStep: cs,
  }));
}

function buildTourGuideSteps(): GuideStep[] {
  return TOUR_STEPS.map(ts => ({
    id: `tour-${ts.id}`,
    phase: 'tour' as const,
    zone: ts.zone as GuideZone,
    label: ts.label,
    message: ts.message,
    contentTab: ts.contentTab,
    rightTab: ts.rightTab,
  }));
}

export const ALL_GUIDE_STEPS: GuideStep[] = [
  ...buildCreationGuideSteps(),
  ...buildTourGuideSteps(),
];

export const guideActive = signal(false);
export const guideStepIndex = signal(0);

export const currentGuideStep = computed<GuideStep>(() =>
  ALL_GUIDE_STEPS[guideStepIndex.value],
);

export const guideProgress = computed(() => ({
  current: guideStepIndex.value + 1,
  total: ALL_GUIDE_STEPS.length,
}));

export const isCreationPhase = computed(() =>
  currentGuideStep.value.phase === 'creation',
);

export const isTourPhase = computed(() =>
  currentGuideStep.value.phase === 'tour',
);

export function startGuide() {
  guideActive.value = true;
  /* The guide drives pane A only and the spotlight unions every .guide-spotlight rect,
     so a second mounted pane would double-match targets. Split view sits out the tour. */
  splitMode.value = 'off';
  creationMode.value = true;
  namePromptAnswered.value = false;
  let saved = character.value.creationStep as CreationStep;
  if (saved === 'stats' as string) saved = 'playbook';
  const resumeStep = CREATION_STEPS.includes(saved) ? saved : 'name';
  let idx = ALL_GUIDE_STEPS.findIndex(s => s.creationStep === resumeStep);
  if (idx < 0) idx = 0;
  /* A saved step can turn irrelevant after a Playbook change; resume past it */
  while (idx < ALL_GUIDE_STEPS.length - 1 && guideStepSkipped(ALL_GUIDE_STEPS[idx])) idx++;
  guideStepIndex.value = idx;
  creationStep.value = ALL_GUIDE_STEPS[idx].creationStep ?? resumeStep;
}

export function resumeGuideForTour() {
  guideActive.value = true;
  splitMode.value = 'off';
  const tourStart = ALL_GUIDE_STEPS.findIndex(s => s.phase === 'tour');
  guideStepIndex.value = tourStart >= 0 ? tourStart : 0;
}

function guideStepSkipped(step: GuideStep): boolean {
  return !!step.creationStep && stepIrrelevant(step.creationStep);
}

function landOnStep(idx: number) {
  guideStepIndex.value = idx;
  const step = ALL_GUIDE_STEPS[idx];
  if (step.creationStep) {
    creationStep.value = step.creationStep;
    updateCharacter({ creationStep: step.creationStep });
  }
}

export function nextGuideStep() {
  let idx = guideStepIndex.value + 1;
  while (idx < ALL_GUIDE_STEPS.length && guideStepSkipped(ALL_GUIDE_STEPS[idx])) idx++;
  if (idx >= ALL_GUIDE_STEPS.length) {
    completeGuide();
    return;
  }
  landOnStep(idx);
}

export function prevGuideStep() {
  let idx = guideStepIndex.value - 1;
  while (idx > 0 && guideStepSkipped(ALL_GUIDE_STEPS[idx])) idx--;
  if (idx < 0) return;
  landOnStep(idx);
}

export function skipGuide() {
  const step = currentGuideStep.value;
  if (step.phase === 'creation') {
    updateCharacter({ creationComplete: true });
  }
  completeGuide(); // also clears creationMode
}

/* Transition from creation phase to tour phase */
export function finishCreation() {
  creationMode.value = false;
  updateCharacter({ creationComplete: true });
  const tourStart = ALL_GUIDE_STEPS.findIndex(s => s.phase === 'tour');
  guideStepIndex.value = tourStart >= 0 ? tourStart : 0;
}

function completeGuide() {
  creationMode.value = false;
  guideActive.value = false;
  guideStepIndex.value = 0;
  updateCharacter({ tourComplete: true, creationComplete: true });
}

export function currentCreationStepWarning(): string | null {
  const step = currentGuideStep.value;
  if (!step.creationStep) return null;
  if (stepComplete.value[step.creationStep]) return null;
  if (step.creationStep === 'playbook') return currentStepWarning();
  return STEP_WARNINGS[step.creationStep] || null;
}

export function incompleteCreationSteps(): string[] {
  return CREATION_STEPS
    .filter(s => !stepComplete.value[s])
    .map(s => STEP_LABELS[s]);
}
