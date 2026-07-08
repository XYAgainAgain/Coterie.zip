/* Storyteller-side Haven writes: transactional edits to the Coterie doc's shared havenItems,
   distinct from persistence.ts's member-facing versions since the ST isn't a member. Permission denial (rules pending, or ST status lost) is graceful: catch, warn, toast. */
import { doc, runTransaction, serverTimestamp, FirestoreError } from 'firebase/firestore';
import { db } from '../firebase';
import { activeCoterie } from './persistence';
import { showToast, forceToast } from './toasts';
import { pickVerb } from '../data/gifts';
import { HAVEN_ID } from '../data/itemTags';
import type { Item, Gift } from '../data/types';
import type { CoterieMember } from './coterie';

const DENIED_MSG = 'Haven change denied: rules deploy pending, or you are no longer the Storyteller.';

/* One toast per burst: the item editor fires debounced writes per field, so without this a
   single edit would stack several identical denial toasts. */
let lastDeniedToast = 0;
function onDenied(err: unknown): void {
  console.warn('[stHaven] write denied (rules pending, or ST status lost):', err);
  const now = Date.now();
  if (now - lastDeniedToast > 4000) {
    lastDeniedToast = now;
    showToast(DENIED_MSG, 'warning');
  }
}

async function withCoterieHaven(mutate: (haven: Item[]) => Item[]): Promise<boolean> {
  const coterieId = activeCoterie.value;
  if (!coterieId) return false;
  const ref = doc(db, 'coteries', coterieId);
  try {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) throw new Error('Coterie not found');
      const haven: Item[] = snap.data().havenItems ?? [];
      txn.update(ref, { havenItems: mutate(haven), updatedAt: serverTimestamp() });
    });
    return true;
  } catch (err) {
    /* Only permission-denied gets the "rules pending" treatment; anything else is a real bug. */
    if (err instanceof FirestoreError && err.code === 'permission-denied') {
      onDenied(err);
    } else {
      console.error('[stHaven] write failed:', err);
      showToast('Could not save that Haven change.', 'error');
    }
    return false;
  }
}

export function stAddHavenItem(item: Item): Promise<boolean> {
  return withCoterieHaven(haven => [...haven, { ...item, containerId: HAVEN_ID, equipped: false }]);
}

export function stUpdateHavenItem(id: string, patch: Partial<Omit<Item, 'id'>>): Promise<boolean> {
  return withCoterieHaven(haven => haven.map(i => (i.id === id ? { ...i, ...patch } : i)));
}

/* Remove a Haven item, spilling any children up to its own container so nested contents are
   never orphaned (mirrors the member-side removeHavenItem behavior). */
export function stRemoveHavenItem(id: string): Promise<boolean> {
  return withCoterieHaven(haven => {
    const target = haven.find(i => i.id === id);
    if (!target) return haven;
    const parent = target.containerId;
    return haven
      .filter(i => i.id !== id)
      .map(i => (i.containerId === id ? { ...i, containerId: parent } : i));
  });
}

export function stAdjustHavenItemQty(id: string, delta: number): Promise<boolean> {
  return withCoterieHaven(haven => haven.map(i => (i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)));
}

/* Set a PC's table-owned Initiative from the ST Initiative ladder (members-array transaction,
   field-scoped write allowed by the staged rules). null clears it. Denial is graceful and
   quiet: Initiative is low-stakes, so a permission error just logs. */
export async function stSetMemberInitiative(characterId: string, value: number | null): Promise<boolean> {
  const coterieId = activeCoterie.value;
  if (!coterieId) return false;
  const ref = doc(db, 'coteries', coterieId);
  try {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) throw new Error('Coterie not found');
      const members: CoterieMember[] = snap.data().members ?? [];
      const idx = members.findIndex(m => m.characterId === characterId);
      if (idx < 0) return;
      const updated = [...members];
      const m = { ...updated[idx] };
      if (value === null) delete m.initiative; else m.initiative = value;
      updated[idx] = m;
      txn.update(ref, { members: updated, updatedAt: serverTimestamp() });
    });
    return true;
  } catch (err) {
    if (err instanceof FirestoreError && err.code === 'permission-denied') {
      console.warn('[stHaven] initiative write denied (rules pending, or ST status lost):', err);
    } else {
      console.error('[stHaven] initiative write failed:', err);
    }
    return false;
  }
}

/* Sends a Haven item to a member's gift queue like the sheet's "Move to…", but ST-sourced:
   leaves havenItems and lands in giftQueue in ONE transaction, so it can't vanish; a sent container's children spill up to its parent so nested contents survive. */
export async function stGiftHavenItem(itemId: string, toCharacterId: string, recipientName: string): Promise<boolean> {
  const coterieId = activeCoterie.value;
  if (!coterieId) return false;
  const ref = doc(db, 'coteries', coterieId);
  let itemName = '';
  try {
    let sent = false;
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) throw new Error('Coterie not found');
      const haven: Item[] = snap.data().havenItems ?? [];
      const queue: Gift[] = snap.data().giftQueue ?? [];
      const target = haven.find(i => i.id === itemId);
      if (!target) return; // already gone; treat as a no-op
      itemName = target.name || 'something';
      const parent = target.containerId;
      const nextHaven = haven
        .filter(i => i.id !== itemId)
        .map(i => (i.containerId === itemId ? { ...i, containerId: parent } : i));
      const gift: Gift = {
        id: crypto.randomUUID(),
        item: { ...target, equipped: false, containerId: null },
        fromCharacterId: '',
        fromDisplayName: 'the Storyteller',
        toCharacterId,
        verb: pickVerb(),
        createdAt: Date.now(),
      };
      txn.update(ref, { havenItems: nextHaven, giftQueue: [...queue, gift], updatedAt: serverTimestamp() });
      sent = true;
    });
    if (sent) forceToast(`Sent ${itemName} to ${recipientName || 'them'}.`, 'info');
    return sent;
  } catch (err) {
    if (err instanceof FirestoreError && err.code === 'permission-denied') {
      onDenied(err);
    } else {
      console.error('[stHaven] gift failed:', err);
      showToast('Could not send that item.', 'error');
    }
    return false;
  }
}
