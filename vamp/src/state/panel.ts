import { signal } from '@preact/signals';

export const RPANEL_TABS = ['coterie', 'character', 'moves', 'advancement', 'rules'] as const;
export type RPanelTab = (typeof RPANEL_TABS)[number];

export const TAB_TOOLTIPS: Record<RPanelTab, string> = {
  coterie: 'My Coterie',
  character: 'My Vamp',
  moves: 'Basic Moves',
  advancement: 'Advancement',
  rules: 'Rules Reference',
};

export const activeRightTab = signal<RPanelTab>('coterie');

export const scrollToMove = signal<string | null>(null);

export function switchTab(tab: RPanelTab) {
  activeRightTab.value = tab;
}

export function openMove(moveName: string) {
  activeRightTab.value = 'moves';
  /* Force a new signal value even if same move, so the effect always fires */
  scrollToMove.value = null;
  scrollToMove.value = moveName;
}
