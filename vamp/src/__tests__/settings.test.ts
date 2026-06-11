import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeHex, applyCustomTheme, clearCustomTheme,
} from '../themes/customTheme';
import {
  diceVolume, diceMuted, diceSurface, setDiceVolume, toggleDiceMute, setDiceSurface,
} from '../state/settings';

describe('normalizeHex', () => {
  it('accepts 6-digit hex with or without #', () => {
    expect(normalizeHex('#abcdef')).toBe('#abcdef');
    expect(normalizeHex('ABCDEF')).toBe('#abcdef');
  });

  it('expands 3-digit shorthand', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('f0a')).toBe('#ff00aa');
  });

  it('rejects invalid input', () => {
    expect(normalizeHex('xyz')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });
});

describe('custom theme apply/clear', () => {
  it('pins the base theme and injects accent overrides', () => {
    applyCustomTheme({ base: 'night', accent: '#3366cc', eyeAnim: 'heartbeat' });
    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('night');
    expect(root.style.getPropertyValue('--_accent')).toBe('#3366cc');
    expect(root.style.getPropertyValue('--_text-accent')).not.toBe('');
  });

  it('leaves no residue after clearing', () => {
    applyCustomTheme({ base: 'abyss', accent: '#a88bff', eyeAnim: 'shimmer' });
    clearCustomTheme('sunset');
    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('sunset');
    for (const key of ['--_accent', '--_accent-hover', '--_primary', '--_glow', '--_text-accent', '--_glass-border']) {
      expect(root.style.getPropertyValue(key)).toBe('');
    }
  });
});

describe('dice volume + mute', () => {
  beforeEach(() => {
    diceMuted.value = false;
    diceVolume.value = 0.5;
  });

  it('defaults to half volume, unmuted, hardwood', () => {
    expect(diceVolume.value).toBe(0.5);
    expect(diceMuted.value).toBe(false);
    expect(diceSurface.value).toBe('hardwood');
  });

  it('dragging to zero engages mute', () => {
    setDiceVolume(0);
    expect(diceMuted.value).toBe(true);
  });

  it('toggling mute restores the last non-zero volume', () => {
    setDiceVolume(0.8);
    toggleDiceMute();          // mute
    expect(diceMuted.value).toBe(true);
    setDiceVolume(0);          // drag to zero while muted keeps it muted
    toggleDiceMute();          // unmute restores 0.8
    expect(diceMuted.value).toBe(false);
    expect(diceVolume.value).toBe(0.8);
  });

  it('setting a positive volume clears mute', () => {
    diceMuted.value = true;
    setDiceVolume(0.4);
    expect(diceMuted.value).toBe(false);
    expect(diceVolume.value).toBe(0.4);
  });

  it('round-trips the surface selection', () => {
    setDiceSurface('felt');
    expect(diceSurface.value).toBe('felt');
    setDiceSurface('hardwood');
  });
});
