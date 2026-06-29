import { useEffect } from 'preact/hooks';
import { isTypingContext } from '../utils/isTypingContext';
import { activeDialog } from '../state/dialog';
import { guideActive } from '../state/guide';
import { CONTENT_TABS, switchContentTab, setPaneTab, switchTab, cycleSplit, splitMode } from '../state/panel';
import { quickToggleAdvantage, quickToggleDisadvantage } from '../state/character';
import { portraitMinimized } from '../state/ui';
import { cycleTheme } from '../state/themeCycle';
import { settingsOpen, settingsTab } from '../state/settings';
import { staked } from './SceneTools';

/* Sheet-scoped keyboard shortcuts (owner sheet only). Suppressed while typing, in a modal,
   or during the guide. Text size/font keys (−/+/0/f) stay with TextRocker. */
export function SheetShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      /* Settings suppresses shortcuts, except the Keys tab — there you can try them while reading them. */
      if (isTypingContext(e.target) || activeDialog.value || guideActive.value) return;
      if (settingsOpen.value && settingsTab.value !== 'keys') return;

      /* e.code (Digit1/Numpad1), not e.key — Shift turns the digit into a symbol. */
      const digit = e.code.startsWith('Digit') ? e.code.slice(5)
        : e.code.startsWith('Numpad') ? e.code.slice(6) : '';
      if (digit >= '1' && digit <= '5') {
        const tab = CONTENT_TABS[Number(digit) - 1];
        if (e.shiftKey) {
          if (splitMode.value === 'off') splitMode.value = 'reflowing';
          setPaneTab('b', tab);
        } else {
          switchContentTab(tab);
        }
        e.preventDefault();
        return;
      }
      if (e.shiftKey) return;

      switch (e.key.toLowerCase()) {
        case 'i': switchContentTab('possessions'); break; /* unlisted: I = inventory */
        case 'c': switchTab('coterie'); break;
        case 'v': switchTab('character'); break;
        case 'x': switchTab('advancement'); break;
        case 'b': switchTab('moves'); break;
        case 'h': switchTab('rules'); break;
        case 's': staked.value = !staked.value; break;
        case 'a': quickToggleAdvantage(); break;
        case 'd': quickToggleDisadvantage(); break;
        case 'p': portraitMinimized.value = !portraitMinimized.value; break;
        case 'y': cycleSplit(); break;
        case 't': cycleTheme(); break;
        default: return;
      }
      e.preventDefault();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
