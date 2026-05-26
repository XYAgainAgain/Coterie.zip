import { signal } from '@preact/signals';

export const RPANEL_TABS = ['coterie', 'character', 'advancement', 'moves', 'rules'] as const;
export type RPanelTab = (typeof RPANEL_TABS)[number];

export const TAB_TOOLTIPS: Record<RPanelTab, string> = {
  coterie: 'My Coterie',
  character: 'My Vamp',
  moves: 'Basic Moves',
  advancement: 'Advancement',
  rules: 'Rules Reference',
};

export const activeRightTab = signal<RPanelTab>('coterie');
export const activeContentTab = signal(0);

export const scrollToMove = signal<string | null>(null);

export function switchTab(tab: RPanelTab) {
  activeRightTab.value = tab;
}

export function switchContentTab(index: number) {
  activeContentTab.value = index;
}

export function openMove(moveName: string) {
  activeRightTab.value = 'moves';
  scrollToMove.value = null;
  scrollToMove.value = moveName;
}
