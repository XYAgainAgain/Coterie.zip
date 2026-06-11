import { effect } from '@preact/signals';
import { character } from '../state/character';
import { activeCharacterId } from '../state/persistence';
import { viewingOtherSheet } from '../state/ui';
import { theme } from '../state/theme';
import { applyCustomTheme, clearCustomTheme, customThemeActive } from './customTheme';

/* Ties character.customTheme to the DOM. Two effects:
   1. When the active sheet changes, default the eye's custom position (on if that
      character has a saved custom theme and we own the sheet).
   2. Apply the derived palette when the custom position is active on an owned sheet,
      otherwise restore the device theme. Runs on every character mutation, which is why
      apply/clear guard their DOM writes (see customTheme.ts). */

let started = false;
let lastSheetKey: string | undefined;

export function initCustomThemeLifecycle(): void {
  if (started) return;
  started = true;

  /* Default the eye's custom position whenever the sheet OR the viewing state changes
     (keyed on the tuple so toggling into a viewed sheet of the same id still resets). */
  effect(() => {
    const id = activeCharacterId.value;
    const viewing = viewingOtherSheet.value;
    const key = `${id}|${viewing}`;
    if (key === lastSheetKey) return;
    lastSheetKey = key;
    customThemeActive.value = !viewing && !!id && !!character.peek().customTheme;
  });

  effect(() => {
    const ct = character.value.customTheme;
    const onOwnSheet = !!activeCharacterId.value && !viewingOtherSheet.value;
    if (customThemeActive.value && onOwnSheet && ct) {
      applyCustomTheme(ct);
    } else {
      clearCustomTheme(theme.value);
    }
  });
}
