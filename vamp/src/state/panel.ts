import { signal, computed, effect } from '@preact/signals';

export const RPANEL_TABS = ['coterie', 'character', 'advancement', 'moves', 'rules'] as const;
export type RPanelTab = (typeof RPANEL_TABS)[number];

export const TAB_TOOLTIPS: Record<RPanelTab, string> = {
  coterie: 'My Coterie',
  character: 'My Vamp',
  moves: 'Basic Moves',
  advancement: 'Advancement',
  rules: 'Rules Reference',
};

export const CONTENT_TABS = ['vitals', 'disciplines', 'possessions', 'clocks', 'notebook'] as const;
export type ContentTab = (typeof CONTENT_TABS)[number];

export const activeRightTab = signal<RPanelTab>('coterie');
export const activeContentTab = signal<ContentTab>('vitals');

export const scrollToMove = signal<string | null>(null);

/* Split view is device-tier state: persisted in localStorage (same rule as state/settings.ts),
   never the character doc — a ratio drag fed through the autosave debounce would spray
   Firestore writes. Pane A reuses activeContentTab; only pane B gets its own signal. */

function readLS(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeLS(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

function isContentTab(v: unknown): v is ContentTab {
  return CONTENT_TABS.includes(v as ContentTab);
}

export type SplitMode = 'off' | 'reflowing' | 'split-button';
const SPLIT_MODES: SplitMode[] = ['off', 'reflowing', 'split-button'];

const storedSplitTab = readLS('vamp-split-tab-b');
const storedRatio = parseFloat(readLS('vamp-split-ratio') ?? '');
const storedMode = readLS('vamp-split-mode');

export const splitMode = signal<SplitMode>(
  storedMode === 'reflowing' || storedMode === 'split-button' ? storedMode
    /* pre-mode releases stored a boolean under vamp-split-active */
    : readLS('vamp-split-active') === 'true' ? 'reflowing' : 'off',
);
export const splitViewActive = computed(() => splitMode.value !== 'off');
export const splitRightTab = signal<ContentTab>(isContentTab(storedSplitTab) ? storedSplitTab : 'disciplines');
export const splitRatio = signal(
  Number.isFinite(storedRatio) ? Math.min(0.67, Math.max(0.33, storedRatio)) : 0.5,
);

effect(() => { writeLS('vamp-split-mode', splitMode.value); });
effect(() => { writeLS('vamp-split-tab-b', splitRightTab.value); });
effect(() => { writeLS('vamp-split-ratio', String(splitRatio.value)); });

/* The split button walks off → reflowing → split-button → off. */
export function cycleSplit() {
  const next = SPLIT_MODES[(SPLIT_MODES.indexOf(splitMode.value) + 1) % SPLIT_MODES.length];
  if (next === 'reflowing' && splitRightTab.value === activeContentTab.value) {
    splitRightTab.value = activeContentTab.value === 'disciplines' ? 'vitals' : 'disciplines';
  }
  splitMode.value = next;
}

/* Reflowing panes never show the same tab: picking the other pane's tab swaps them.
   Split-button mode allows it — same tab in both halves renders merged (unsplit). */
export function setPaneTab(pane: 'a' | 'b', tab: ContentTab) {
  if (pane === 'a') {
    if (splitMode.value === 'reflowing' && splitRightTab.value === tab) {
      splitRightTab.value = activeContentTab.value;
    }
    activeContentTab.value = tab;
  } else {
    if (splitMode.value === 'reflowing' && activeContentTab.value === tab) {
      activeContentTab.value = splitRightTab.value;
    }
    splitRightTab.value = tab;
  }
}

export function switchTab(tab: RPanelTab) {
  activeRightTab.value = tab;
}

export function switchContentTab(tab: ContentTab) {
  /* Already visible in pane B? Don't yank pane A too. */
  if (splitViewActive.value && splitRightTab.value === tab) return;
  setPaneTab('a', tab);
}

export function openMove(moveName: string) {
  activeRightTab.value = 'moves';
  scrollToMove.value = null;
  scrollToMove.value = moveName;
}
