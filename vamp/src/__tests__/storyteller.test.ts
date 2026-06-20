import { describe, it, expect } from 'vitest';
import { consentValid, needsConsentDecision, type StConsent } from '../state/storyteller';

const c = (uid: string): StConsent => ({ uid, approvedAt: 0 });

describe('consentValid', () => {
  it('true only when consent names the current Storyteller', () => {
    expect(consentValid(c('st1'), 'st1')).toBe(true);
  });
  it('false with no consent', () => {
    expect(consentValid(null, 'st1')).toBe(false);
  });
  it('false with no Storyteller', () => {
    expect(consentValid(c('st1'), null)).toBe(false);
  });
  it('false when the Storyteller changed (stale consent auto-invalidates)', () => {
    expect(consentValid(c('st1'), 'st2')).toBe(false);
  });
});

describe('needsConsentDecision', () => {
  it('true when an ST exists but is not validly consented to', () => {
    expect(needsConsentDecision(null, 'st1')).toBe(true);
  });
  it('true when consent is stale after an ST change (must re-decide)', () => {
    expect(needsConsentDecision(c('st1'), 'st2')).toBe(true);
  });
  it('false once consented to the current ST', () => {
    expect(needsConsentDecision(c('st1'), 'st1')).toBe(false);
  });
  it('false when there is no Storyteller', () => {
    expect(needsConsentDecision(null, null)).toBe(false);
    expect(needsConsentDecision(c('st1'), null)).toBe(false);
  });
});
