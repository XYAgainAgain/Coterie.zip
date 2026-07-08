import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Stub the persistence + character + stState chain so recordRoll is tested in isolation (no Firebase). */
const mocks = vi.hoisted(() => ({
  appendCoterieRoll: vi.fn(),
  activeCoterie: { value: null as string | null },
  activeCharacterId: { value: null as string | null },
  character: { value: { name: 'Vi' } },
  stDashboardActive: { value: false },
  stState: { value: { stRollMode: 'public' as 'public' | 'secret' | 'hidden' } },
}));

vi.mock('../state/persistence', () => ({
  appendCoterieRoll: mocks.appendCoterieRoll,
  activeCoterie: mocks.activeCoterie,
  activeCharacterId: mocks.activeCharacterId,
}));
vi.mock('../state/character', () => ({ character: mocks.character }));
vi.mock('../state/stState', () => ({ stDashboardActive: mocks.stDashboardActive, stState: mocks.stState }));

import { recordRoll, rollLog } from '../dice/rollLog';

function input(over: Record<string, unknown> = {}) {
  return {
    kept: [6, 5], dropped: [], statName: 'Wits', statValue: 2,
    forwardMod: 0, ongoingMod: 0, total: 13, tier: 'success' as const, ...over,
  };
}

describe('recordRoll', () => {
  beforeEach(() => {
    rollLog.value = [];
    mocks.activeCoterie.value = null;
    mocks.activeCharacterId.value = null;
    mocks.stDashboardActive.value = false;
    mocks.stState.value = { stRollMode: 'public' };
    mocks.appendCoterieRoll.mockClear();
  });

  it('prepends newest-first', () => {
    recordRoll(input({ total: 1 }));
    recordRoll(input({ total: 2 }));
    expect(rollLog.value.map(e => e.total)).toEqual([2, 1]);
  });

  it('caps the local log at 50, dropping the oldest', () => {
    for (let i = 0; i < 60; i++) recordRoll(input({ total: i }));
    expect(rollLog.value).toHaveLength(50);
    expect(rollLog.value[0].total).toBe(59);
    expect(rollLog.value.at(-1)!.total).toBe(10);
  });

  it('stamps the roller and skips the Coterie write when solo', () => {
    recordRoll(input());
    expect(rollLog.value[0].who).toBe('Vi');
    expect(mocks.appendCoterieRoll).not.toHaveBeenCalled();
  });

  it('writes to the Coterie (not the local log) when in one', () => {
    mocks.activeCoterie.value = '77SZB';
    recordRoll(input());
    expect(mocks.appendCoterieRoll).toHaveBeenCalledOnce();
    expect(rollLog.value).toHaveLength(0);
  });
});

describe('recordRoll: Storyteller rolls on /st', () => {
  beforeEach(() => {
    rollLog.value = [];
    mocks.activeCoterie.value = '77SZB';
    mocks.activeCharacterId.value = null;
    mocks.stDashboardActive.value = true;
    mocks.stState.value = { stRollMode: 'public' };
    mocks.appendCoterieRoll.mockClear();
  });

  it('Public: attributes to "Storyteller" and posts the real entry', () => {
    recordRoll(input());
    expect(mocks.appendCoterieRoll).toHaveBeenCalledOnce();
    const entry = mocks.appendCoterieRoll.mock.calls[0][0];
    expect(entry.who).toBe('Storyteller');
    expect(entry.characterId).toBe('');
    expect(entry.total).toBe(13);
    expect(entry.secret).toBeUndefined();
  });

  it('Secret: posts a flagged, data-free entry (no dice or total leak)', () => {
    mocks.stState.value = { stRollMode: 'secret' };
    recordRoll(input({ total: 18, kept: [6, 6] }));
    expect(mocks.appendCoterieRoll).toHaveBeenCalledOnce();
    const entry = mocks.appendCoterieRoll.mock.calls[0][0];
    expect(entry).toMatchObject({ who: 'Storyteller', secret: true, total: 0, kept: [], statName: '' });
  });

  it('Hidden: shares nothing (no Coterie write, no local entry)', () => {
    mocks.stState.value = { stRollMode: 'hidden' };
    recordRoll(input());
    expect(mocks.appendCoterieRoll).not.toHaveBeenCalled();
    expect(rollLog.value).toHaveLength(0);
  });
});
