import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Stub the persistence + character chain so recordRoll is tested in isolation (no Firebase). */
const mocks = vi.hoisted(() => ({
  appendCoterieRoll: vi.fn(),
  activeCoterie: { value: null as string | null },
  activeCharacterId: { value: null as string | null },
  character: { value: { name: 'Vi' } },
}));

vi.mock('../state/persistence', () => ({
  appendCoterieRoll: mocks.appendCoterieRoll,
  activeCoterie: mocks.activeCoterie,
  activeCharacterId: mocks.activeCharacterId,
}));
vi.mock('../state/character', () => ({ character: mocks.character }));

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
