import { describe, it, expect } from 'vitest';
import { consentValid, needsConsentDecision, shouldPromptConsent, kickVotePassed, type StConsent } from '../state/storyteller';

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

describe('shouldPromptConsent', () => {
  it('prompts when a decision is pending and nothing was declined', () => {
    expect(shouldPromptConsent(null, null, 'st1')).toBe(true);
  });
  it('stays quiet after declining the same ST', () => {
    expect(shouldPromptConsent(null, 'st1', 'st1')).toBe(false);
  });
  it('re-prompts when a NEW ST claims after a decline', () => {
    expect(shouldPromptConsent(null, 'st1', 'st2')).toBe(true);
  });
  it('stays quiet once validly consented', () => {
    expect(shouldPromptConsent(c('st1'), null, 'st1')).toBe(false);
  });
  it('stays quiet with no Storyteller', () => {
    expect(shouldPromptConsent(null, null, null)).toBe(false);
    expect(shouldPromptConsent(null, 'st1', null)).toBe(false);
  });
});

describe('kickVotePassed', () => {
  it('passes only when every current member has voted', () => {
    expect(kickVotePassed(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(kickVotePassed(['a'], ['a', 'b'])).toBe(false);
  });
  it('ignores votes from departed members', () => {
    expect(kickVotePassed(['a', 'ghost'], ['a', 'b'])).toBe(false);
    expect(kickVotePassed(['a', 'ghost'], ['a'])).toBe(true);
  });
  it('never passes with an empty roster or no votes', () => {
    expect(kickVotePassed([], [])).toBe(false);
    expect(kickVotePassed(null, ['a'])).toBe(false);
    expect(kickVotePassed(['a'], null)).toBe(false);
  });
});
