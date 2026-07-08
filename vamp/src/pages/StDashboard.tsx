import { useEffect } from 'preact/hooks';
import { effect, useSignal } from '@preact/signals';
import { route } from 'preact-router';
import { auth } from '../firebase';
import { loadCoterie, stopCoterieListener, readStorytellerGate, loadStRoster, activeCoterie } from '../state/persistence';
import { coterieState } from '../state/coterie';
import { loadStState, flushStState, resetStState, stDashboardActive, stState } from '../state/stState';
import { theme } from '../state/theme';
import { cycleTheme } from '../state/themeCycle';
import { applyCustomTheme, clearCustomTheme } from '../themes/customTheme';
import { isStorytellerOf, type StRosterEntry } from '../state/stRosterLogic';
import { showToast } from '../state/toasts';
import { isTypingContext } from '../utils/isTypingContext';
import { activeDialog } from '../state/dialog';
import { settingsOpen, settingsTab } from '../state/settings';
import { StRosterRail } from '../components/st/StRosterRail';
import { StCanvas } from '../components/st/StCanvas';

/* Coterie-scoped Storyteller dashboard. Gated on storytellerUid == uid; a non-ST is bounced
   to home. Loads the live Coterie doc (dials), the ST-state doc, and the roster. */
export function StDashboard({ coterieCode }: { coterieCode?: string }) {
  const resolving = useSignal(true);
  const error = useSignal<string | null>(null);
  const code = useSignal('');
  const roster = useSignal<StRosterEntry[]>([]);

  useEffect(() => {
    if (!coterieCode) return;
    let cancelled = false;
    const c = coterieCode.trim().toUpperCase();
    resolving.value = true;
    error.value = null;
    roster.value = [];

    (async () => {
      const uid = auth.currentUser?.uid ?? null;
      const gate = await readStorytellerGate(c);
      if (cancelled) return;
      if (!gate.exists) { error.value = `No Coterie found with code “${c}”.`; resolving.value = false; return; }
      if (!isStorytellerOf(gate.storytellerUid, uid)) {
        showToast("You're not the Storyteller of this Coterie.", 'warning');
        route('/vamp/', true);
        return;
      }
      code.value = c;
      document.title = `Storyteller: ${gate.typeName || c}`;
      await loadCoterie(c);   // live subscription drives the rail dials
      await loadStState(c);   // ST-private layout + notes (blank until rules deploy)
      const r = await loadStRoster(gate.members, uid!);
      if (cancelled) return;
      roster.value = r;
      resolving.value = false;
    })().catch(err => {
      if (!cancelled) { error.value = err instanceof Error ? err.message : String(err); resolving.value = false; }
    });

    return () => {
      cancelled = true;
      flushStState();   // commit any pending ST-state edit before detaching
      resetStState();
      stopCoterieListener();
    };
  }, [coterieCode]);

  /* Live re-gate: a kick-vote or step-down from another tab clears storytellerUid on the
     subscribed Coterie doc; bounce instead of leaving a dead dashboard open. */
  useEffect(() => effect(() => {
    const stUid = coterieState.value.storytellerUid;
    if (resolving.value || !code.value || activeCoterie.value !== code.value) return;
    if (!isStorytellerOf(stUid, auth.currentUser?.uid ?? null)) {
      showToast("You're no longer the Storyteller of this Coterie.", 'warning');
      route('/vamp/', true);
    }
  }), []);

  /* Must stay declared BEFORE the theme effect: cleanups run LIFO, so this flips false last
     and customThemeLifecycle re-applies the player theme as the final unmount DOM write. */
  useEffect(() => {
    stDashboardActive.value = true;
    return () => { stDashboardActive.value = false; };
  }, []);

  /* Reskin only the /st route from the per-Coterie theme, reusing the player-sheet engine's
     DOM apply/clear. The lifecycle effect defers to us while mounted; cleanup restores the
     device theme so players' own pages are untouched. */
  useEffect(() => {
    const dispose = effect(() => {
      const ct = stState.value.theme;
      if (ct) applyCustomTheme(ct); else clearCustomTheme(theme.value);
    });
    return () => { dispose(); clearCustomTheme(theme.value); };
  }, []);

  /* T cycles the theme on /st (−/+/F already bind globally via TextRocker). Delegates to the
     shared cycleTheme so T, the header eye, and the Settings presets stay one unified model. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isTypingContext(e.target) || activeDialog.value) return;
      if (settingsOpen.value && settingsTab.value !== 'keys') return;
      if (e.key.toLowerCase() !== 't') return;
      cycleTheme();
      e.preventDefault();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* Rail width is a display preference, so it stays device-local (not stState). */
  const railW = useSignal(Math.min(28, Math.max(16, parseFloat(localStorage.getItem('vamp-st-rail-w') ?? '') || 16)));
  function onSplitDown(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX, startW = railW.value;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const move = (ev: PointerEvent) => {
      railW.value = Math.min(28, Math.max(16, startW + (ev.clientX - startX) / rem));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      localStorage.setItem('vamp-st-rail-w', railW.value.toFixed(2));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  if (resolving.value) return <div class="vamp-loading">Materializing the table...</div>;
  if (error.value) return <div class="vamp-loading vamp-loading--error">{error.value}</div>;

  return (
    <div class="vamp-st-dash">
      <div class="vamp-st__body" style={{ gridTemplateColumns: `${railW.value}rem auto minmax(0, 1fr)` }}>
        <StRosterRail code={code.value} roster={roster.value} />
        <div
          class="vamp-st__split"
          onPointerDown={onSplitDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize roster rail"
          title="Drag to resize"
        />
        <section class="vamp-st__stage" aria-label="Dashboard canvas">
          <StCanvas roster={roster.value} />
          <div class="vamp-st-guard" role="status">
            <p>The Storyteller’s table needs more room.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
