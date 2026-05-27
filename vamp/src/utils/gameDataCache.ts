import { idbGet, idbPut } from '../state/idb';
import { loadAllGameData, clearFetchCache, getCachedGeneratedAt, type GameData } from '../data/loader';

const IDB_KEY = 'game-data-bundle';

interface CachedBundle {
  generatedAt: string;
  data: GameData;
}

export async function loadGameDataCached(): Promise<{
  data: GameData;
  refresh: () => Promise<GameData | null>;
}> {
  const cached = await idbGet<CachedBundle>('gamedata', IDB_KEY).catch(() => undefined);

  if (cached) {
    return {
      data: cached.data,
      refresh: () => backgroundRefresh(cached.generatedAt),
    };
  }

  const data = await loadAllGameData();
  const generatedAt = getCachedGeneratedAt() ?? '';
  idbPut('gamedata', { generatedAt, data } satisfies CachedBundle, IDB_KEY).catch(() => {});
  return { data, refresh: () => Promise.resolve(null) };
}

async function fetchGeneratedAt(): Promise<string | null> {
  try {
    const res = await fetch('./data/playbooks.json');
    if (!res.ok) return null;
    const json = await res.json();
    return json.generatedAt ?? null;
  } catch { return null; }
}

async function backgroundRefresh(cachedAt: string): Promise<GameData | null> {
  const liveAt = await fetchGeneratedAt();
  if (!liveAt || liveAt === cachedAt) return null;

  clearFetchCache();
  const data = await loadAllGameData();
  idbPut('gamedata', { generatedAt: liveAt, data } satisfies CachedBundle, IDB_KEY).catch(() => {});
  return data;
}
