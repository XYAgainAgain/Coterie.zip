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

/* The declined Storyteller's uid for the active character (null = never declined).
   Persisted on the character doc so a NOPE doesn't re-prompt on every load or device. */
export const activeStDeclined = signal<string | null>(null);

/* Whether the consent ceremony should fire: a decision is pending AND the player hasn't
   already declined this exact ST. A new ST's uid stops matching, so it re-prompts. */
export function shouldPromptConsent(
  consent: StConsent | null | undefined,
  declinedUid: string | null | undefined,
  storytellerUid: string | null | undefined,
): boolean {
  return needsConsentDecision(consent, storytellerUid) && declinedUid !== storytellerUid;
}

/* Kick-vote unanimity: every CURRENT member has voted. Votes from departed members are
   ignored, so a membership change can only tighten the bar, never sneak a kick through. */
export function kickVotePassed(votes: string[] | null | undefined, memberUids: string[] | null | undefined): boolean {
  if (!memberUids || memberUids.length === 0) return false;
  const cast = new Set(votes ?? []);
  return memberUids.every(uid => cast.has(uid));
}
