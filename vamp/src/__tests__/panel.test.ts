import { describe, it, expect, beforeEach } from 'vitest';
import {
  activeContentTab, splitMode, splitViewActive, splitRightTab, splitRatio,
  cycleSplit, setPaneTab, switchContentTab,
} from '../state/panel';

beforeEach(() => {
  activeContentTab.value = 'vitals';
  splitMode.value = 'off';
  splitRightTab.value = 'disciplines';
  splitRatio.value = 0.5;
});

describe('cycleSplit', () => {
  it('walks off → reflowing → split-button → off', () => {
    cycleSplit();
    expect(splitMode.value).toBe('reflowing');
    expect(splitViewActive.value).toBe(true);
    cycleSplit();
    expect(splitMode.value).toBe('split-button');
    expect(splitViewActive.value).toBe(true);
    cycleSplit();
    expect(splitMode.value).toBe('off');
    expect(splitViewActive.value).toBe(false);
  });

  it('bumps pane B off pane A\'s tab when entering reflowing', () => {
    activeContentTab.value = 'disciplines';
    splitRightTab.value = 'disciplines';
    cycleSplit();
    expect(splitRightTab.value).toBe('vitals');
  });

  it('keeps a distinct persisted pane B tab when entering reflowing', () => {
    splitRightTab.value = 'clocks';
    cycleSplit();
    expect(splitRightTab.value).toBe('clocks');
  });

  it('allows same-tab panes when entering split-button (merged)', () => {
    splitMode.value = 'reflowing';
    activeContentTab.value = 'clocks';
    splitRightTab.value = 'notebook';
    cycleSplit();
    expect(splitMode.value).toBe('split-button');
    setPaneTab('b', 'clocks');
    expect(splitRightTab.value).toBe('clocks');
    expect(activeContentTab.value).toBe('clocks');
  });
});

describe('setPaneTab reflowing same-tab invariant', () => {
  it('swaps panes when pane B picks pane A\'s tab', () => {
    splitMode.value = 'reflowing';
    activeContentTab.value = 'clocks';
    splitRightTab.value = 'notebook';
    setPaneTab('b', 'clocks');
    expect(splitRightTab.value).toBe('clocks');
    expect(activeContentTab.value).toBe('notebook');
  });

  it('swaps panes when pane A picks pane B\'s tab', () => {
    splitMode.value = 'reflowing';
    activeContentTab.value = 'vitals';
    splitRightTab.value = 'disciplines';
    setPaneTab('a', 'disciplines');
    expect(activeContentTab.value).toBe('disciplines');
    expect(splitRightTab.value).toBe('vitals');
  });

  it('ignores pane B collision when split is off', () => {
    splitRightTab.value = 'clocks';
    setPaneTab('a', 'clocks');
    expect(activeContentTab.value).toBe('clocks');
    expect(splitRightTab.value).toBe('clocks');
  });
});

describe('setPaneTab split-button mode', () => {
  it('lets both panes share a tab (merged), no swap', () => {
    splitMode.value = 'split-button';
    activeContentTab.value = 'vitals';
    splitRightTab.value = 'disciplines';
    setPaneTab('a', 'disciplines');
    expect(activeContentTab.value).toBe('disciplines');
    expect(splitRightTab.value).toBe('disciplines');
  });

  it('un-merges when one half picks a different tab', () => {
    splitMode.value = 'split-button';
    activeContentTab.value = 'vitals';
    splitRightTab.value = 'vitals';
    setPaneTab('b', 'clocks');
    expect(activeContentTab.value).toBe('vitals');
    expect(splitRightTab.value).toBe('clocks');
  });
});

describe('switchContentTab', () => {
  it('drives pane A normally', () => {
    switchContentTab('disciplines');
    expect(activeContentTab.value).toBe('disciplines');
  });

  it('leaves pane A alone when pane B already shows the target', () => {
    splitMode.value = 'reflowing';
    splitRightTab.value = 'disciplines';
    switchContentTab('disciplines');
    expect(activeContentTab.value).toBe('vitals');
    expect(splitRightTab.value).toBe('disciplines');
  });

  it('stays merged when the target is the merged tab', () => {
    splitMode.value = 'split-button';
    activeContentTab.value = 'disciplines';
    splitRightTab.value = 'disciplines';
    switchContentTab('disciplines');
    expect(activeContentTab.value).toBe('disciplines');
    expect(splitRightTab.value).toBe('disciplines');
  });
});
