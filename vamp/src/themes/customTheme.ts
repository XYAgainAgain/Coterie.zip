import { signal } from '@preact/signals';

/* Recolors a base theme from one accent hex: overrides the accent-family --_* tokens inline
   on <html>, subtly re-hues Sunset/Abyss backgrounds (Night stays neutral), and themes dice. */

export type ThemeBase = 'night' | 'sunset' | 'abyss';
export type EyeAnim = 'heartbeat' | 'shimmer' | 'dilate' | 'glow' | 'breathe' | 'blink';

export interface CustomTheme {
  base: ThemeBase;
  accent: string;
  eyeAnim: EyeAnim;
  /* Optional dice styling; defaulted on read so older saved themes still work. */
  diceFont?: string;
  diceMetalness?: number;
}

export const DICE_FONTS = [
  { id: 'Metamorphous, serif', label: 'Metamorphous' },
  { id: '"IM Fell English SC", serif', label: 'IM Fell' },
  { id: 'Sinistre, fantasy', label: 'Sinistre' },
] as const;

export const DEFAULT_DICE_FONT = 'Metamorphous, serif';
export const DEFAULT_DICE_METALNESS = 0.3;

/* Intent flag: the eye is on the "custom" position for the current sheet. In-memory only;
   the device localStorage theme always stores one of the three real themes, never "custom".
   The lifecycle effect (customThemeLifecycle.ts) reads this and applies/clears the palette. */
export const customThemeActive = signal(false);

/* Accept "#rrggbb" / "rrggbb" / "#rgb" / "rgb"; return canonical "#rrggbb" or null. */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  return null;
}

function hexToHsl(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`;
const hsla = (h: number, s: number, l: number, a: number) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

/* Re-hue a base background to the accent, keeping lightness; saturation crushed to a faint
   wash so backgrounds stay readable (near-neutral colors stay neutral via their ~0 sat). */
function reHue(hex: string, accentHue: number): string {
  const [, s, l] = hexToHsl(hex);
  return hsl(accentHue, clamp(Math.round(s * 0.3), 3, 10), l);
}

/* Dark background recipes per base, re-hued for the accent. Night is omitted: it's neutral
   grey by design and stays that way. */
const BG_RECIPE: Record<'sunset' | 'abyss', Record<string, string>> = {
  sunset: {
    '--_bg-primary': '#2B2E4A',
    '--_bg-secondary': '#343760',
    '--_bg-elevated': '#3d4170',
    '--_bg-sunken': '#222540',
  },
  abyss: {
    '--_bg-primary': '#070707',
    '--_bg-secondary': '#0f0d14',
    '--_bg-elevated': '#1A1030',
    '--_bg-sunken': '#040404',
  },
};

/* Glass panel background (hsla) re-hued per base; the lightness/alpha match each theme. */
const GLASS_RECIPE: Record<'sunset' | 'abyss', [number, number]> = {
  sunset: [15, 0.82],
  abyss: [6, 0.85],
};

/* Every --_* token we might inject, so clearing removes exactly these and nothing lingers. */
const OVERRIDE_KEYS = [
  '--_accent', '--_accent-hover', '--_accent-subtle', '--_primary',
  '--_glow', '--_glow-bright', '--_text-accent', '--_border-accent', '--_glass-border',
  '--_bg-primary', '--_bg-secondary', '--_bg-elevated', '--_bg-sunken', '--_glass-bg',
  '--_dice-body', '--_dice-numeral', '--_dice-font', '--_dice-metalness',
] as const;

function derivePalette(ct: CustomTheme): Record<string, string> {
  const accent = normalizeHex(ct.accent) ?? ct.accent;
  const [h, s, l] = hexToHsl(accent);

  const palette: Record<string, string> = {
    '--_accent': accent,
    '--_accent-hover': hsl(h, s, clamp(l + 15, 0, 80)),
    '--_accent-subtle': hsla(h, s, l, 0.15),
    /* Deep partner color (glow base, hunger-mid). Darker, slightly richer. */
    '--_primary': hsl(h, clamp(s + 5, 0, 100), clamp(l - 15, 8, 100)),
    '--_glow': hsl(h, s, l),
    '--_glow-bright': hsl(h, s, clamp(l + 15, 0, 80)),
    /* Text-accent stays legible on dark backgrounds: capped saturation, lifted lightness. */
    '--_text-accent': hsl(h, clamp(s, 0, 70), clamp(l + 25, 55, 85)),
    '--_border-accent': hsla(h, s, l, 0.3),
    '--_glass-border': hsla(h, s, l, 0.15),
    /* Dice body takes the accent; the numeral flips light/dark for contrast against it. */
    '--_dice-body': accent,
    '--_dice-numeral': l > 55 ? hsl(h, clamp(s, 0, 55), 14) : hsl(h, clamp(s, 0, 40), 92),
    '--_dice-font': ct.diceFont ?? DEFAULT_DICE_FONT,
    '--_dice-metalness': String(ct.diceMetalness ?? DEFAULT_DICE_METALNESS),
  };

  if (ct.base !== 'night') {
    const recipe = BG_RECIPE[ct.base];
    for (const [key, hex] of Object.entries(recipe)) palette[key] = reHue(hex, h);
    const [glassL, glassA] = GLASS_RECIPE[ct.base];
    palette['--_glass-bg'] = hsla(h, clamp(Math.round(s * 0.3), 4, 12), glassL, glassA);
  }

  return palette;
}

/* Apply/clear runs from a reactive effect on every character mutation, so each DOM write is
   guarded: writing an unchanged value still spins the dice engine's MutationObserver. When
   something actually changes, fire 'vamp-dice-theme' so the engine re-skins to live accent /
   font / metalness edits that don't move data-theme. */
export function applyCustomTheme(ct: CustomTheme): void {
  const root = document.documentElement;
  let styleChanged = false;
  let dataThemeChanged = false;
  if (root.getAttribute('data-theme') !== ct.base) { root.setAttribute('data-theme', ct.base); dataThemeChanged = true; }
  const palette = derivePalette(ct);
  /* Iterate the full key set so keys absent from this palette (e.g. the bg tints when the
     base flips to Night) get removed, not stranded from a previous base. */
  for (const key of OVERRIDE_KEYS) {
    const value = palette[key];
    if (value === undefined) {
      if (root.style.getPropertyValue(key)) { root.style.removeProperty(key); styleChanged = true; }
    } else if (root.style.getPropertyValue(key) !== value) {
      root.style.setProperty(key, value);
      styleChanged = true;
    }
  }
  notifyDiceTheme(styleChanged, dataThemeChanged);
}

/* Strip all injected overrides and fall back to the given real theme. */
export function clearCustomTheme(deviceTheme: string): void {
  const root = document.documentElement;
  let styleChanged = false;
  for (const key of OVERRIDE_KEYS) {
    if (root.style.getPropertyValue(key)) { root.style.removeProperty(key); styleChanged = true; }
  }
  let dataThemeChanged = false;
  if (root.getAttribute('data-theme') !== deviceTheme) { root.setAttribute('data-theme', deviceTheme); dataThemeChanged = true; }
  notifyDiceTheme(styleChanged, dataThemeChanged);
}

/* The dice engine re-skins on data-theme via a MutationObserver, so only fire the event for
   style-only changes (live accent/font/metalness edits); otherwise the engine double-skins. */
function notifyDiceTheme(styleChanged: boolean, dataThemeChanged: boolean): void {
  if (styleChanged && !dataThemeChanged) window.dispatchEvent(new Event('vamp-dice-theme'));
}
