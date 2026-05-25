import { signal, computed } from '@preact/signals';
import { updateCharacter } from './character';
import type { RPanelTab } from './panel';

export type TourStop =
  | 'vitals'
  | 'modifiers'
  | 'scene-tools'
  | 'possessions'
  | 'clocks-debts'
  | 'notebook'
  | 'coterie'
  | 'basic-moves'
  | 'rules'
  | 'edit-mode';

export type TourZone = 'vitals' | 'toolbar-left' | 'toolbar-right' | 'content' | 'right' | 'header';

export interface TourStepDef {
  id: TourStop;
  zone: TourZone;
  contentTab: number | null;
  rightTab: RPanelTab | null;
  label: string;
  message: string;
}

export const TOUR_STEPS: TourStepDef[] = [
  {
    id: 'vitals',
    zone: 'vitals',
    contentTab: null,
    rightTab: null,
    label: 'Vitals',
    message: 'This area + the first tab below are your Vamp Vitals. Blood Potency, Hunger, Humanity, Harm (HP), and XP are all tracked both manually and automatically up here. The little square pips have 3 stages; empty, crossed, and filled. For Harm, crossed = Superficial & filled = Aggravated. For Humanity, crossed = Stain, filled = remaining, empty = missing. Click/tap to toggle between them!',
  },
  {
    id: 'modifiers',
    zone: 'toolbar-left',
    contentTab: null,
    rightTab: null,
    label: 'Move Modifiers',
    message: 'This area lets you track and control what modifiers apply to your dice rolls. Forward applies to your next relevant roll, Ongoing applies until a condition is met, and Advantage/Disadvantage cancel each other out but let you roll 3d6 instead of 2. For Advantage, ignore the lowest result; for Disadvantage, ignore the highest.',
  },
  {
    id: 'scene-tools',
    zone: 'toolbar-right',
    contentTab: null,
    rightTab: null,
    label: 'Scene Tools',
    message: 'This is where you insert your Initiative number for combat, keep track of any temporary combat notes (which are wiped after a scene ends!), and the buttons used to keep track of how much time has progressed or if you have been staked. Only click these if you mean to!',
  },
  {
    id: 'possessions',
    zone: 'content',
    contentTab: 2,
    rightTab: null,
    label: 'Possessions',
    message: 'This is where all your gear and stuff is stashed. You can add it, toss it, sort it, bag it, tag it, or just leave it lying around the Haven somewhere for your fellow Coterie members to use.',
  },
  {
    id: 'clocks-debts',
    zone: 'content',
    contentTab: 3,
    rightTab: null,
    label: 'Clocks & Debts',
    message: 'This is where you keep track of Clocks (which increment at certain fictional points) and Debts (which are leverage over you or others). Be sure to keep an eye on these! Watch the Masquerade Clock tick up into scary red territory, then double-click it to clear it. Your whole Coterie shares a Masquerade Clock, but the rest are yours. These are publicly visible.',
  },
  {
    id: 'notebook',
    zone: 'content',
    contentTab: 4,
    rightTab: null,
    label: 'Notebook',
    message: 'Here, you can write, sort, pin, and delete markdown-formatted notes about whatever you want. These are private and synced per-character. There is always a reference note that resets when you click the New Session button, too, in case you need formatting help.',
  },
  {
    id: 'coterie',
    zone: 'right',
    contentTab: null,
    rightTab: 'coterie',
    label: 'My Coterie',
    message: 'This panel tab shows you the current state of your Coterie, including its type, stats, members, and any notes you might have written down. This is shared by everyone in your Coterie! Note that you can only alter these stats by using Edit mode, but the rest is easy. If you have not yet done so, create or join a Coterie by using/sharing its 5-digit code.',
  },
  {
    id: 'basic-moves',
    zone: 'right',
    contentTab: null,
    rightTab: 'moves',
    label: 'Basic Moves',
    message: 'This panel tab lists all 12 of the Basic Moves that you will constantly be using during gameplay. You will be referencing these often. Clicking on one on the left panel will open it here.',
  },
  {
    id: 'rules',
    zone: 'right',
    contentTab: null,
    rightTab: 'rules',
    label: 'Rules Reference',
    message: 'This final panel tab contains a quick-reference document that should remind you what certain rules are. For more complete rules, use the search bar at the top to search the full site (it will open in a new tab) and navigate right to what you wanted. Now, just one last thing!',
  },
  {
    id: 'edit-mode',
    zone: 'header',
    contentTab: null,
    rightTab: null,
    label: 'Controls',
    message: 'These buttons control your experience with the ***Coterie*** character sheet. The Settings gear will let you customize the sheet itself to your liking, while the lock/unlock button switches between Edit and Play modes, allowing you to change your character freely. Please use responsibly. The eyes up here switch between the three preset Vamp themes, but your custom ones are always saved in the settings. When you dismiss this message, you should see a notification in the bottom left!',
  },
];

export const tourMode = signal(false);
export const tourStepIndex = signal(0);

export const currentTourStep = computed<TourStepDef>(() =>
  TOUR_STEPS[tourStepIndex.value],
);

export const tourProgress = computed(() => ({
  current: tourStepIndex.value + 1,
  total: TOUR_STEPS.length,
}));

export function startTour() {
  tourMode.value = true;
  tourStepIndex.value = 0;
}

export function nextTourStop() {
  if (tourStepIndex.value < TOUR_STEPS.length - 1) {
    tourStepIndex.value = tourStepIndex.value + 1;
  } else {
    completeTour();
  }
}

export function prevTourStop() {
  if (tourStepIndex.value > 0) {
    tourStepIndex.value = tourStepIndex.value - 1;
  }
}

export function skipTour() {
  completeTour();
}

function completeTour() {
  tourMode.value = false;
  tourStepIndex.value = 0;
  updateCharacter({ tourComplete: true });
}
