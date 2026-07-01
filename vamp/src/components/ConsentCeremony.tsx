import { signal, useSignalEffect } from '@preact/signals';
import { coterieState } from '../state/coterie';
import { activeStConsent, activeStDeclined, shouldPromptConsent, needsConsentDecision } from '../state/storyteller';
import { activeCharacterId, setStConsent, setStDeclined } from '../state/persistence';
import { guideActive } from '../state/guide';
import { vampConfirm, activeDialog } from '../state/dialog';
import { showToast } from '../state/toasts';
import { auth } from '../firebase';

/* Module-level so a remount can't stack a second ceremony on top of an open one. The tick
   re-runs the effect after each ceremony resolves, catching an ST who claimed mid-dialog. */
let prompting = false;
const ceremonyTick = signal(0);

/* Invisible host on the owner sheet. One signal gate covers all four triggers: creation
   end (guideActive off), code entry/sheet load (loadCoterie), and mid-session claims. */
export function ConsentCeremony() {
  useSignalEffect(() => {
    void ceremonyTick.value;
    const stUid = coterieState.value.storytellerUid;
    const charId = activeCharacterId.value;
    if (!charId || !stUid || prompting) return;

    /* Your own characters consent to you silently: no ceremony, but the stConsent field
       still lands so tallies and the eventual dashboard treat them like everyone else. */
    if (stUid === auth.currentUser?.uid) {
      if (!needsConsentDecision(activeStConsent.value, stUid)) return;
      prompting = true;
      /* No tick bump on failure: a rejected write would otherwise retry in a tight loop.
         Success re-runs the effect via the consent signal; failure waits for a new trigger. */
      setStConsent(charId, stUid)
        .catch(() => {})
        .finally(() => { prompting = false; });
      return;
    }

    const eligible = !guideActive.value && !activeDialog.value
      && shouldPromptConsent(activeStConsent.value, activeStDeclined.value, stUid);
    if (!eligible) return;
    prompting = true;
    (async () => {
      try {
        /* Escape/backdrop dismissal counts as a decline; the Coterie-tab row is the undo. */
        const approved = await vampConfirm(
          <>Someone has claimed the <strong>Storyteller&rsquo;s</strong> seat for your Coterie. Approving opens your whole character sheet to them; everything <em>except</em> your private notes. Is this your Storyteller?</>,
          { title: 'A Storyteller Rises', confirmLabel: "YEP THAT'S THEM", cancelLabel: 'NOPE, WRONG HAVEN' },
        );
        /* The table may have shifted mid-dialog (kick, step-down, character switch);
           only persist a decision that still describes the current ST. */
        if (coterieState.value.storytellerUid !== stUid || activeCharacterId.value !== charId) return;
        if (approved) await setStConsent(charId, stUid);
        else await setStDeclined(charId, stUid);
      } catch {
        showToast('Could not save your Storyteller decision. It will ask again.', 'warning');
      } finally {
        prompting = false;
        ceremonyTick.value++;
      }
    })();
  });
  return null;
}
