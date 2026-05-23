import { signal } from '@preact/signals';
import type { StatName } from '../data/types';
import type { Touchstone } from './character';

export interface WizardData {
  name: string;
  playbook: string;
  ageBracket: string;
  archetypeName: string;
  stats: Record<StatName, number>;
  predatorType: string;
  predatorTypeSkipped: boolean;
  bp: number;
  humanity: number;
  selectedDisciplines: string[];
  startingPowers: string[];
  convictions: string[];
  touchstones: Touchstone[];
  bonusXp: number;
  folkloricBanes: string[];
  xpPowers: string[];
}

export const WIZARD_INITIAL: WizardData = {
  name: '',
  playbook: '',
  ageBracket: '',
  archetypeName: '',
  stats: { Blood: 0, Shadow: 0, Resolve: 0, Demeanor: 0, Wits: 0 },
  predatorType: '',
  predatorTypeSkipped: false,
  bp: 0,
  humanity: 7,
  selectedDisciplines: [],
  startingPowers: [],
  convictions: [''],
  touchstones: [{ name: '', pronouns: ['', ''], ageBracket: '', description: '' }],
  bonusXp: 0,
  folkloricBanes: [],
  xpPowers: [],
};

export const wizard = signal<WizardData>(structuredClone(WIZARD_INITIAL));
export const wizardStep = signal(0);

export function updateWizard(patch: Partial<WizardData>) {
  wizard.value = { ...wizard.value, ...patch };
}

export function resetWizard() {
  wizard.value = structuredClone(WIZARD_INITIAL);
  wizardStep.value = 0;
}
