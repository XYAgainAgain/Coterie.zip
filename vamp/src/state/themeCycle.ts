import { theme, setDeviceTheme, THEMES, type Theme } from './theme';
import { customThemeActive } from '../themes/customTheme';
import { sweepThemes } from './themeSweep';
import { character } from './character';
import { activeCharacterId } from './persistence';
import { viewingOtherSheet } from './ui';
import { stDashboardActive, stState, patchStTheme } from './stState';

type Position = Theme | 'custom';

/* Cycle the three base themes, plus the per-character custom palette when set. Shared by the
   EyeToggle, the T shortcut, and Settings; on /st the same call cycles the per-Coterie theme instead. */
export function cycleTheme() {
  if (stDashboardActive.value) {
    const ct = stState.value.theme;
    if (ct) patchStTheme({ base: THEMES[(THEMES.indexOf(ct.base) + 1) % THEMES.length] });
    else setDeviceTheme(THEMES[(THEMES.indexOf(theme.value) + 1) % THEMES.length]);
    return;
  }
  const hasCustom = !!character.value.customTheme && !!activeCharacterId.value && !viewingOtherSheet.value;
  if (!hasCustom) {
    const idx = THEMES.indexOf(theme.value);
    customThemeActive.value = false;
    setDeviceTheme(THEMES[(idx + 1) % THEMES.length]);
    return;
  }
  const positions: Position[] = [...THEMES, 'custom'];
  const current: Position = customThemeActive.value ? 'custom' : theme.value;
  const next = positions[(positions.indexOf(current) + 1) % positions.length];
  if (next === 'custom') {
    sweepThemes();
    customThemeActive.value = true;
  } else {
    customThemeActive.value = false;
    setDeviceTheme(next);
  }
}
