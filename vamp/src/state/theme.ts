import { signal } from '@preact/signals';
import { sweepThemes } from './themeSweep';

/* Device-tier theme: one of the three real schemes, persisted in localStorage. The
   per-character custom palette is an in-memory overlay on top (see themes/customTheme.ts);
   this signal never holds "custom". */

export const THEMES = ['sunset', 'night', 'abyss'] as const;
export type Theme = typeof THEMES[number];

function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem('vamp-theme');
    if (stored && THEMES.includes(stored as Theme)) return stored as Theme;
  } catch { /* localStorage blocked */ }
  return 'night';
}

export const theme = signal<Theme>(loadTheme());

/* Reflect the device theme on <html> at module load. When a custom palette is active the
   lifecycle effect overrides data-theme to the custom base, then restores this on clear. */
document.documentElement.setAttribute('data-theme', theme.value);

export function setDeviceTheme(t: Theme): void {
  sweepThemes();
  theme.value = t;
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('vamp-theme', t); } catch { /* noop */ }
}
