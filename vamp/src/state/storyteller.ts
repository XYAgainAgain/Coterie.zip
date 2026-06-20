import { signal } from '@preact/signals';

/* Per-character Storyteller consent: THE Firestore security boundary for ST sheet access.
   Lives in a dedicated character-doc field, never the autosaved CharacterState blob. */
export interface StConsent {
  uid: string;
  approvedAt: number;
}

/* The active character's consent record, loaded from its doc (null if none). */
export const activeStConsent = signal<StConsent | null>(null);

/* Valid only while it names the CURRENT Storyteller: a different storytellerUid auto-invalidates
   prior consent with no server wipe, because the uid simply stops matching. */
export function consentValid(consent: StConsent | null | undefined, storytellerUid: string | null | undefined): boolean {
  return !!consent && !!storytellerUid && consent.uid === storytellerUid;
}

/* The owner must approve/deny when their Coterie has a Storyteller they haven't validly
   consented to (including stale consent left over from a previous ST). */
export function needsConsentDecision(consent: StConsent | null | undefined, storytellerUid: string | null | undefined): boolean {
  return !!storytellerUid && !consentValid(consent, storytellerUid);
}
