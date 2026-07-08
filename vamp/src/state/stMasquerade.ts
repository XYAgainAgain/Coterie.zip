/* Storyteller-side Masquerade Clock writes: transactional edits to the shared `masqueradeClock`
   field, since the ST isn't a member (coterie.ts's fill/unfillMasquerade is member-facing). Permission denial (rules pending, or ST status lost) is graceful: catch, warn, toast. */
import { doc, runTransaction, serverTimestamp, FirestoreError } from 'firebase/firestore';
import { db } from '../firebase';
import { activeCoterie } from './persistence';
import { showToast } from './toasts';
import type { Clock } from './character';

const DENIED_MSG = 'Masquerade change denied: rules deploy pending, or you are no longer the Storyteller.';
const DEFAULT_CLOCK: Clock = { id: 'masquerade', name: 'The Masquerade', segments: 8, filled: 0 };

/* One toast per burst so rapid clicks can't stack identical denial toasts. */
let lastDeniedToast = 0;
function onDenied(err: unknown): void {
  console.warn('[stMasquerade] write denied (rules pending, or ST status lost):', err);
  const now = Date.now();
  if (now - lastDeniedToast > 4000) {
    lastDeniedToast = now;
    showToast(DENIED_MSG, 'warning');
  }
}

async function nudge(delta: 1 | -1): Promise<boolean> {
  const coterieId = activeCoterie.value;
  if (!coterieId) return false;
  const ref = doc(db, 'coteries', coterieId);
  try {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) throw new Error('Coterie not found');
      const clock = (snap.data().masqueradeClock ?? DEFAULT_CLOCK) as Clock;
      const filled = Math.max(0, Math.min(clock.segments, clock.filled + delta));
      if (filled === clock.filled) return; // already at a rail; nothing to write
      txn.update(ref, { masqueradeClock: { ...clock, filled }, updatedAt: serverTimestamp() });
    });
    return true;
  } catch (err) {
    /* Only permission-denied gets the "rules pending" treatment; anything else is a real bug. */
    if (err instanceof FirestoreError && err.code === 'permission-denied') {
      onDenied(err);
    } else {
      console.error('[stMasquerade] write failed:', err);
      showToast('Could not update the Masquerade Clock.', 'error');
    }
    return false;
  }
}

export function stFillMasquerade(): Promise<boolean> { return nudge(1); }
export function stUnfillMasquerade(): Promise<boolean> { return nudge(-1); }
