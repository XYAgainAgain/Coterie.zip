import { signal } from '@preact/signals';

/* Recolors a base theme from one accent hex: overrides the accent-family --_* tokens inline
   on <html>, subtly re-hues Sunset/Abyss backgrounds (Night stays neutral), and themes dice. */

export type ThemeBase = 'night' | 'sunset' | 'abyss';
export type EyeAnim = 'heartbeat' | 'shimmer' | 'dilate' | 'glow' | 'breathe' | 'blink';

export interface CustomTheme {
  base: ThemeBase;
  accent: string;
  /* Optional complementary second accent for custom-theme flair; defaults to accent's complement. */
  accent2?: string;
  /* Second-accent toggle; default on. Off reverts to the single-accent visual style. */
  accentB?: boolean;
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

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/* WCAG 2.1 relative luminance + contrast ratio (ported from RainyDesk's theme engine). */
function relativeLuminance(hex: string): number {
  const raw = (normalizeHex(hex) ?? '#000000').replace('#', '');
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(parseInt(raw.slice(0, 2), 16)) + 0.7152 * lin(parseInt(raw.slice(2, 4), 16)) + 0.0722 * lin(parseInt(raw.slice(4, 6), 16));
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type HarmonyType = 'complementary' | 'analogous' | 'triadic' | 'split-complementary';
const HARMONY_OFFSETS: Record<HarmonyType, number[]> = {
  complementary: [180],
  analogous: [30, -30],
  triadic: [120, 240],
  'split-complementary': [150, 210],
};

/* Coordinate a second accent off the first via a harmony rule; lightness pushed opposite, then nudged for visible distinction. */
function harmonize(accent: string, harmony: HarmonyType, jitter: boolean): string {
  const [h, s, l] = hexToHsl(normalizeHex(accent) ?? accent);
  const offs = HARMONY_OFFSETS[harmony];
  const offset = jitter ? offs[Math.floor(Math.random() * offs.length)] : offs[0];
  const h2 = (h + offset + (jitter ? Math.round((Math.random() - 0.5) * 16) : 0) + 360) % 360;
  const s2 = clamp(jitter ? s + Math.round((Math.random() - 0.5) * 20) : s, 50, 85);
  let l2 = l > 55 ? clamp(l - 24, 38, 56) : clamp(l + 24, 46, 70);
  let out = hslToHex(h2, s2, l2);
  for (let i = 0; i < 4 && contrastRatio(out, hslToHex(h, s, l)) < 1.7; i++) {
    l2 = l2 > 50 ? l2 - 7 : l2 + 7;
    out = hslToHex(h2, s2, l2);
  }
  return out;
}

/* Auto-default second accent: a coordinated split-complement (deterministic for a given accent A). */
export function autoAccentB(accent: string): string {
  return harmonize(accent, 'split-complementary', false);
}

/* Randomize a coordinated second accent across all four harmony rules. */
export function randomContrastHex(accent: string): string {
  const rules = Object.keys(HARMONY_OFFSETS) as HarmonyType[];
  return harmonize(accent, rules[Math.floor(Math.random() * rules.length)], true);
}

/* A fully random, usable accent: any hue, vibrant mid-tone. */
export function randomAccent(): string {
  return hslToHex(Math.floor(Math.random() * 360), 55 + Math.floor(Math.random() * 30), 45 + Math.floor(Math.random() * 18));
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
  '--_accent-2', '--_accent-2-subtle', '--_glow-2',
  '--_glow', '--_glow-bright', '--_text-accent', '--_border-accent', '--_glass-border',
  '--_bg-primary', '--_bg-secondary', '--_bg-elevated', '--_bg-sunken', '--_glass-bg',
  '--_dice-body', '--_dice-numeral', '--_dice-font', '--_dice-metalness',
] as const;

function derivePalette(ct: CustomTheme): Record<string, string> {
  const accent = normalizeHex(ct.accent) ?? ct.accent;
  const [h, s, l] = hexToHsl(accent);
  const dual = ct.accentB !== false;
  const accent2 = dual ? (normalizeHex(ct.accent2 ?? '') ?? autoAccentB(accent)) : accent;
  const [h2, s2, l2] = hexToHsl(accent2);

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
    /* Dice body takes accent 1; the numeral is a clearly accent-2-hued tint, dark/light for contrast. */
    '--_dice-body': accent,
    '--_dice-numeral': l > 55 ? hsl(h2, clamp(s2, 40, 90), 26) : hsl(h2, clamp(s2, 40, 90), 74),
    '--_dice-font': ct.diceFont ?? DEFAULT_DICE_FONT,
    '--_dice-metalness': String(ct.diceMetalness ?? DEFAULT_DICE_METALNESS),
  };

  if (dual) {
    palette['--_accent-2'] = accent2;
    palette['--_accent-2-subtle'] = hsla(h2, s2, l2, 0.15);
    palette['--_glow-2'] = hsl(h2, s2, clamp(l2 + 15, 0, 80));
  }

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
  if (ct.accentB !== false) { if (!root.hasAttribute('data-accent-b')) root.setAttribute('data-accent-b', ''); }
  else root.removeAttribute('data-accent-b');
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
  root.removeAttribute('data-accent-b');
  if (root.getAttribute('data-theme') !== deviceTheme) { root.setAttribute('data-theme', deviceTheme); dataThemeChanged = true; }
  notifyDiceTheme(styleChanged, dataThemeChanged);
}

/* The dice engine re-skins on data-theme via a MutationObserver, so only fire the event for
   style-only changes (live accent/font/metalness edits); otherwise the engine double-skins. */
function notifyDiceTheme(styleChanged: boolean, dataThemeChanged: boolean): void {
  if (styleChanged && !dataThemeChanged) window.dispatchEvent(new Event('vamp-dice-theme'));
}
