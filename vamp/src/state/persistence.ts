import { signal, effect } from '@preact/signals';
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, serverTimestamp, onSnapshot, runTransaction,
} from 'firebase/firestore';
import { db, auth, linkedEmail } from '../firebase';
import { character, type CharacterState, NOTEBOOK_HELP_NOTE } from './character';
import { coterieState, masqueradeClock } from './coterie';
import type { CoterieState, CoterieMember } from './coterie';
import type { Clock } from './character';
import { idbGet, idbPut, idbDelete, idbGetAll } from './idb';

const MAX_CHARACTERS_ANON = 2;
const MAX_CHARACTERS_LINKED = 12;

export function maxCharacters(): number {
  return linkedEmail.value ? MAX_CHARACTERS_LINKED : MAX_CHARACTERS_ANON;
}

/* Kebab-case slug from character name, safe for URLs */
export function generateNameSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unnamed';
}

/* Append -2, -3 etc. if slug collides with existing members in the same Coterie */
function dedupeSlug(slug: string, ownCharacterId: string, members: Array<{ slug?: string; characterId?: string }>): string {
  const taken = new Set(
    members
      .filter(m => m.characterId !== ownCharacterId)
      .map(m => m.slug)
      .filter(Boolean),
  );
  if (!taken.has(slug)) return slug;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${slug}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

export interface CharacterSummary {
  id: string;
  name: string;
  playbook: string;
  ageBracket: string;
  bp: number;
  portraitUrl: string | null; /* first URL from portraitUrls for list display */
}

/* Full CharacterState plus persistence metadata, stored as a single IDB record. */
interface IDBCharacterRecord extends CharacterState {
  id: string;
  ownerId: string;
  coterieId: string | null;
  slug: string;
  public: boolean;
  schemaVersion: number;
  updatedAt: number;
  pendingSync: boolean;
}

export const activeCharacterId = signal<string | null>(null);
export const characterList = signal<CharacterSummary[]>([]);
export const activeCoterie = signal<string | null>(null);

function stripMetadata(data: Record<string, unknown>): CharacterState {
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(BLANK_CHARACTER) as (keyof CharacterState)[]) {
    clean[key] = key in data ? data[key] : structuredClone(BLANK_CHARACTER[key]);
  }
  if (Array.isArray(clean.touchstones)) {
    clean.touchstones = (clean.touchstones as Record<string, unknown>[]).map(t => ({
      name: t.name ?? '',
      pronouns: t.pronouns ?? ['', ''],
      ageBracket: t.ageBracket ?? '',
      description: t.description ?? '',
    }));
  }
  if (clean.bio && typeof clean.bio === 'object') {
    clean.bio = { ...BLANK_CHARACTER.bio, ...(clean.bio as Record<string, unknown>) };
  }
  /* Migrate old portraitUrl (string) or portraitUrls (string[]) to portraits (Portrait[]) */
  if (!Array.isArray(clean.portraits) || clean.portraits.length === 0) {
    const legacyArr = data.portraitUrls as string[] | undefined;
    const legacySingle = data.portraitUrl as string | null;
    const urls = legacyArr?.length ? legacyArr : legacySingle ? [legacySingle] : [];
    clean.portraits = urls.map((u: string) => ({ url: u, x: 50, y: 50, scale: 1 }));
  }
  return clean as unknown as CharacterState;
}

export const BLANK_CHARACTER: CharacterState = {
  name: '',
  portraits: [],
  playbook: '',
  predatorType: '',
  ageBracket: '',
  bio: { apparentAge: '', vampiricAge: '', pronouns: ['', ''], height: '', weight: '', style: '', occupation: '' },
  archetypeName: '',
  stats: { Blood: 0, Shadow: 0, Resolve: 0, Demeanor: 0, Wits: 0 },
  unlockedDisciplines: [],
  startingDisciplines: [],
  knownPowers: [],
  advancedMoves: [],
  pendingUpgrades: [],
  bp: 0,
  hunger: 0,
  humanity: 7,
  stains: 0,
  harm: { superficial: 0, aggravated: 0 },
  xp: 0,
  xpTriggers: [],
  debts: [],
  modifiers: [],
  convictions: [''],
  touchstones: [{ name: '', pronouns: ['', ''], ageBracket: '', description: '' }],
  merits: [],
  flaws: [],
  folkloricBanes: [],
  baneChoice: 'standard',
  ghoulPatron: null,
  creationComplete: false,
  creationStep: 'name',
  tourComplete: false,
  clocks: [],
  notes: [{ ...NOTEBOOK_HELP_NOTE }],
};

function toSummary(id: string, data: Record<string, unknown>): CharacterSummary {
  return {
    id,
    name: (data.name as string) || 'Unnamed',
    playbook: (data.playbook as string) || (data.clan as string) || '',
    ageBracket: (data.ageBracket as string) || '',
    bp: (data.bp as number) ?? 0,
    portraitUrl: Array.isArray(data.portraits) && (data.portraits as any[])[0]?.url
      ? (data.portraits as any[])[0].url
      : (data.portraitUrl as string) ?? null,
  };
}

/* Firestore Timestamps have .toMillis(); plain numbers pass through as 0. */
function fsTimestamp(data: Record<string, unknown>): number {
  const ts = data.updatedAt;
  if (ts && typeof (ts as any).toMillis === 'function') return (ts as any).toMillis();
  return 0;
}

export async function loadCharacterList(): Promise<CharacterSummary[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  let idbRecords: IDBCharacterRecord[] = [];
  try {
    const all = await idbGetAll<IDBCharacterRecord>('characters');
    idbRecords = all.filter(r => r.ownerId === uid);
  } catch {}

  if (idbRecords.length > 0) {
    characterList.value = idbRecords.map(r =>
      toSummary(r.id, r as unknown as Record<string, unknown>),
    );
  }

  try {
    const q = query(collection(db, 'characters'), where('ownerId', '==', uid));
    const snap = await getDocs(q);

    const merged = new Map<string, { summary: CharacterSummary; updatedAt: number }>();

    for (const r of idbRecords) {
      merged.set(r.id, {
        summary: toSummary(r.id, r as unknown as Record<string, unknown>),
        updatedAt: r.updatedAt || 0,
      });
    }

    for (const d of snap.docs) {
      const data = d.data();
      const ts = fsTimestamp(data);
      const existing = merged.get(d.id);

      if (!existing || ts > existing.updatedAt) {
        merged.set(d.id, { summary: toSummary(d.id, data), updatedAt: ts });
      }

      /* Pull Firestore-only characters into IDB */
      if (!existing) {
        const state = stripMetadata(data);
        idbPut('characters', {
          ...state,
          id: d.id,
          ownerId: uid,
          coterieId: data.coterieId ?? null,
          slug: data.slug ?? '',
          public: data.public ?? false,
          schemaVersion: data.schemaVersion ?? 1,
          updatedAt: ts,
          pendingSync: false,
        } satisfies IDBCharacterRecord).catch(() => {});
      }
    }

    const list = Array.from(merged.values()).map(e => e.summary);
    characterList.value = list;
    return list;
  } catch {
    return characterList.value;
  }
}

let lastSavedJson = '';

export async function loadCharacter(id: string): Promise<void> {
  let idbTs = 0;
  let loaded = false;
  let coterieId: string | null = null;

  try {
    const rec = await idbGet<IDBCharacterRecord>('characters', id);
    if (rec) {
      const state = stripMetadata(rec as unknown as Record<string, unknown>);
      lastSavedJson = JSON.stringify(state);
      character.value = state;
      activeCharacterId.value = id;
      idbTs = rec.updatedAt || 0;
      coterieId = rec.coterieId;
      loaded = true;
    }
  } catch {}

  try {
    const snap = await getDoc(doc(db, 'characters', id));
    if (!snap.exists()) {
      if (!loaded) throw new Error(`Character ${id} not found`);
      if (coterieId) await loadCoterie(coterieId);
      return;
    }

    const raw = snap.data();
    const ts = fsTimestamp(raw);

    if (ts > idbTs || !loaded) {
      const state = stripMetadata(raw);
      lastSavedJson = JSON.stringify(state);
      character.value = state;
      activeCharacterId.value = id;
      coterieId = raw.coterieId ?? null;

      const uid = auth.currentUser?.uid ?? '';
      idbPut('characters', {
        ...state,
        id,
        ownerId: uid,
        coterieId,
        slug: raw.slug ?? '',
        public: raw.public ?? false,
        schemaVersion: raw.schemaVersion ?? 1,
        updatedAt: ts || Date.now(),
        pendingSync: false,
      } satisfies IDBCharacterRecord).catch(() => {});
    }
  } catch (err) {
    if (!loaded) throw err;
  }

  if (coterieId) {
    await loadCoterie(coterieId);
  }
}

async function saveCharacter(
  snapshotId?: string,
  snapshotState?: CharacterState,
  snapshotCoterie?: string | null,
): Promise<void> {
  const id = snapshotId ?? activeCharacterId.value;
  const state = snapshotState ?? character.value;
  const coterieId = snapshotCoterie ?? activeCoterie.value;
  const uid = auth.currentUser?.uid;
  if (!id || !uid) return;

  const json = JSON.stringify(state);
  if (json === lastSavedJson) return;

  let idbOk = false;
  try {
    const existing = await idbGet<IDBCharacterRecord>('characters', id);
    const newSlug = generateNameSlug(state.name);
    await idbPut('characters', {
      ...state,
      id,
      ownerId: uid,
      coterieId,
      slug: newSlug,
      public: existing?.public ?? !!coterieId,
      schemaVersion: existing?.schemaVersion ?? 1,
      updatedAt: Date.now(),
      pendingSync: true,
    } satisfies IDBCharacterRecord);
    idbOk = true;

    /* Sync member data to Coterie doc when character changes */
    if (coterieId) {
      await syncMemberToCoterie(id, state, coterieId, newSlug);
    }
  } catch {}

  /* Only mark as saved once at least one storage path has the data */
  if (idbOk) lastSavedJson = json;

  try {
    const slug = generateNameSlug(state.name);
    await setDoc(doc(db, 'characters', id), {
      ...state,
      ownerId: uid,
      coterieId,
      slug,
      public: !!coterieId,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    lastSavedJson = json;

    try {
      const rec = await idbGet<IDBCharacterRecord>('characters', id);
      if (rec?.pendingSync) {
        await idbPut('characters', { ...rec, pendingSync: false });
      }
    } catch {}
  } catch {}
}

export async function createCharacter(initial: Partial<CharacterState> = {}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  const all = await idbGetAll<IDBCharacterRecord>('characters');
  const owned = all.filter(r => r.ownerId === uid);
  const cap = maxCharacters();
  if (owned.length >= cap) {
    throw new Error(
      cap === MAX_CHARACTERS_ANON
        ? `Anonymous users can create up to ${MAX_CHARACTERS_ANON} characters. Link your email to unlock ${MAX_CHARACTERS_LINKED}!`
        : `Character limit reached (${MAX_CHARACTERS_LINKED})`,
    );
  }

  const state: CharacterState = { ...BLANK_CHARACTER, ...initial };
  const ref = doc(collection(db, 'characters'));
  const slug = generateNameSlug(state.name);

  const record: IDBCharacterRecord = {
    ...state,
    id: ref.id,
    ownerId: uid,
    coterieId: null,
    slug,
    public: false,
    schemaVersion: 1,
    updatedAt: Date.now(),
    pendingSync: true,
  };

  await idbPut('characters', record);

  try {
    await setDoc(ref, {
      ...state,
      ownerId: uid,
      slug,
      public: false,
      schemaVersion: 1,
      coterieId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await idbPut('characters', { ...record, pendingSync: false, updatedAt: Date.now() });
  } catch {}

  lastSavedJson = JSON.stringify(state);
  character.value = state;
  activeCharacterId.value = ref.id;
  return ref.id;
}

export async function deleteCharacter(id: string): Promise<void> {
  const uid = auth.currentUser?.uid;

  /* Clean up Coterie membership before deleting the character.
     Check IDB first so offline-created characters still get cleaned up. */
  try {
    const idbRec = await idbGet<IDBCharacterRecord>('characters', id);
    const charSnap = await getDoc(doc(db, 'characters', id)).catch(() => null);
    const coterieId = idbRec?.coterieId ?? (charSnap?.data()?.coterieId as string | null);
    if (coterieId && uid) {
      const coterieSnap = await getDoc(doc(db, 'coteries', coterieId));
      if (coterieSnap.exists()) {
        const uids: string[] = coterieSnap.data().memberUids ?? [];
        if (uids.length <= 1) {
          await deleteDoc(doc(db, 'coteries', coterieId));
          if (activeCoterie.value === coterieId) {
            stopCoterieListener();
            activeCoterie.value = null;
          }
        } else {
          await setDoc(doc(db, 'coteries', coterieId), {
            memberUids: uids.filter(u => u !== uid),
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }
      }
    }
  } catch {}

  try { await idbDelete('characters', id); } catch {}
  try { await deleteDoc(doc(db, 'characters', id)); } catch {}
  if (activeCharacterId.value === id) {
    activeCharacterId.value = null;
  }
  await loadCharacterList();
}

/* Push any IDB records that never reached Firestore (offline creates/edits). */
async function syncPending(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  let records: IDBCharacterRecord[];
  try {
    records = await idbGetAll<IDBCharacterRecord>('characters');
  } catch { return; }

  const pending = records.filter(r => r.pendingSync && r.ownerId === uid);
  for (const rec of pending) {
    try {
      const state = stripMetadata(rec as unknown as Record<string, unknown>);
      await setDoc(doc(db, 'characters', rec.id), {
        ...state,
        ownerId: uid,
        coterieId: rec.coterieId,
        slug: rec.slug,
        public: rec.public,
        schemaVersion: rec.schemaVersion,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await idbPut('characters', { ...rec, pendingSync: false, updatedAt: Date.now() });
    } catch {}
  }
}

/* Upsert this character's entry in the Coterie's members array.
   Uses a transaction to avoid read-modify-write races when multiple players save simultaneously. */
async function syncMemberToCoterie(
  characterId: string,
  state: CharacterState,
  coterieId: string,
  slug: string,
): Promise<void> {
  try {
    const coterieRef = doc(db, 'coteries', coterieId);

    await runTransaction(db, async (txn) => {
      const coterieSnap = await txn.get(coterieRef);
      if (!coterieSnap.exists()) return;

      const data = coterieSnap.data();
      const members: CoterieMember[] = data.members ?? [];
      const firstPortrait = state.portraits[0]?.url ?? null;
      const pronouns = state.bio.pronouns.filter(Boolean).join('/');

      const dedupedSlug = dedupeSlug(slug, characterId, members);

      const entry: CoterieMember = {
        characterId,
        slug: dedupedSlug,
        name: state.name || 'Unnamed',
        pronouns: pronouns || '?/?',
        portraitUrl: firstPortrait,
        ageBracket: state.ageBracket,
        bp: state.bp,
        playbook: state.playbook,
      };

      const idx = members.findIndex(m => m.characterId === characterId);
      const updated = [...members];
      if (idx >= 0) {
        updated[idx] = entry;
      } else {
        updated.push(entry);
      }

      txn.update(coterieRef, {
        members: updated,
        updatedAt: serverTimestamp(),
      });
    });
  } catch {}
}

let charSaveTimer: ReturnType<typeof setTimeout> | null = null;
let coterieSaveTimer: ReturnType<typeof setTimeout> | null = null;
let charDisposer: (() => void) | null = null;
let coterieDisposer: (() => void) | null = null;

export function startAutoSave(): void {
  syncPending();

  if (!charDisposer) {
    charDisposer = effect(() => {
      void character.value;
      const id = activeCharacterId.value;
      if (!id) return;
      if (charSaveTimer) clearTimeout(charSaveTimer);
      charSaveTimer = setTimeout(() => { saveCharacter(); }, 2000);
    });
  }

  if (!coterieDisposer) {
    coterieDisposer = effect(() => {
      void coterieState.value;
      void masqueradeClock.value;
      const id = activeCoterie.value;
      if (!id) return;
      if (coterieSaveTimer) clearTimeout(coterieSaveTimer);
      coterieSaveTimer = setTimeout(() => { saveCoterie(); }, 2000);
    });
  }
}

export function stopAutoSave(): void {
  if (charSaveTimer) { clearTimeout(charSaveTimer); charSaveTimer = null; }
  if (coterieSaveTimer) { clearTimeout(coterieSaveTimer); coterieSaveTimer = null; }
  if (charDisposer) { charDisposer(); charDisposer = null; }
  if (coterieDisposer) { coterieDisposer(); coterieDisposer = null; }
}

export async function flushSave(): Promise<void> {
  if (charSaveTimer) { clearTimeout(charSaveTimer); charSaveTimer = null; }
  const id = activeCharacterId.peek();
  const state = character.peek();
  const coterie = activeCoterie.peek();
  await saveCharacter(id ?? undefined, state, coterie);
}

/* Load a character for read-only viewing via Coterie-scoped slug.
   Resolves coterieCode + slug → character doc. Verifies membership. */
export async function loadCharacterForViewing(
  rawCoterieCode: string,
  charSlug: string,
): Promise<{ state: CharacterState; coterieId: string; isOwner: boolean }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  const coterieCode = rawCoterieCode.trim().toUpperCase();
  const coterieSnap = await getDoc(doc(db, 'coteries', coterieCode));
  if (!coterieSnap.exists()) throw new Error(`Coterie "${coterieCode}" not found`);

  const coterieData = coterieSnap.data();
  const memberUids: string[] = coterieData.memberUids ?? [];
  if (!memberUids.includes(uid)) throw new Error('You are not a member of this Coterie');

  const members: CoterieMember[] = coterieData.members ?? [];
  const member = members.find(m => m.slug === charSlug);
  if (!member) throw new Error(`No character "${charSlug}" found in this Coterie`);

  const charSnap = await getDoc(doc(db, 'characters', member.characterId));
  if (!charSnap.exists()) throw new Error('Character document not found');

  const raw = charSnap.data();
  const state = stripMetadata(raw);
  const isOwner = raw.ownerId === uid;

  return { state, coterieId: coterieCode, isOwner };
}

let coterieUnsub: (() => void) | null = null;

function applyCoterie(data: Record<string, unknown>) {
  coterieState.value = {
    typeName: (data.typeName as string) ?? '',
    stats: (data.stats as CoterieState['stats']) ?? { Clout: 0, Cohesion: 0, Charm: 0, Claim: 0, Currency: 0 },
    havenDescription: (data.havenDescription as string) ?? '',
    havenPositives: (data.havenPositives as string[]) ?? [],
    havenNegatives: (data.havenNegatives as string[]) ?? [],
    members: (data.members as CoterieState['members']) ?? [],
  };
  if (data.masqueradeClock) {
    masqueradeClock.value = data.masqueradeClock as Clock;
  }
}

export async function loadCoterie(coterieId: string): Promise<void> {
  if (coterieUnsub) { coterieUnsub(); coterieUnsub = null; }

  const snap = await getDoc(doc(db, 'coteries', coterieId));
  if (!snap.exists()) return;
  applyCoterie(snap.data());
  activeCoterie.value = coterieId;

  coterieUnsub = onSnapshot(doc(db, 'coteries', coterieId), snap => {
    if (snap.exists()) applyCoterie(snap.data());
  });
}

export function stopCoterieListener() {
  if (coterieUnsub) { coterieUnsub(); coterieUnsub = null; }
}

export async function saveCoterie(): Promise<void> {
  const id = activeCoterie.value;
  const uid = auth.currentUser?.uid;
  if (!id || !uid) return;

  /* memberUids is managed by createCoterie/joinCoterie/deleteCharacter only */
  await setDoc(doc(db, 'coteries', id), {
    ...coterieState.value,
    masqueradeClock: masqueradeClock.value,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

const LOBBY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function generateLobbyCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const code = Array.from(bytes, b => LOBBY_CHARS[b % LOBBY_CHARS.length]).join('');
    const existing = await getDoc(doc(db, 'coteries', code));
    if (!existing.exists()) return code;
  }
  throw new Error('Could not generate a unique lobby code after 10 attempts');
}

export async function createCoterie(initial: Partial<CoterieState> = {}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  const state: CoterieState = {
    typeName: '',
    stats: { Clout: 0, Cohesion: 0, Charm: 0, Claim: 0, Currency: 0 },
    havenDescription: '',
    havenPositives: [],
    havenNegatives: [],
    members: [],
    ...initial,
  };

  const code = await generateLobbyCode();
  const ref = doc(db, 'coteries', code);
  const defaultClock: Clock = { id: 'masquerade', name: 'The Masquerade', segments: 8, filled: 0 };

  await setDoc(ref, {
    ...state,
    masqueradeClock: defaultClock,
    memberUids: [uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  coterieState.value = state;
  masqueradeClock.value = defaultClock;
  activeCoterie.value = code;

  /* Sync this character's member entry into the new Coterie */
  const charId = activeCharacterId.value;
  if (charId) {
    const slug = generateNameSlug(character.value.name);
    await syncMemberToCoterie(charId, character.value, code, slug);
  }

  return code;
}

export async function joinCoterie(rawCode: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  const charId = activeCharacterId.value;
  if (!uid || !charId) return;

  const coterieId = rawCode.trim().toUpperCase();
  const coterieSnap = await getDoc(doc(db, 'coteries', coterieId));
  if (!coterieSnap.exists()) throw new Error(`No Coterie found with code "${coterieId}"`);

  const data = coterieSnap.data();
  const uids: string[] = data.memberUids ?? [];
  if (!uids.includes(uid)) {
    await setDoc(doc(db, 'coteries', coterieId), {
      memberUids: [...uids, uid],
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  activeCoterie.value = coterieId;
  await loadCoterie(coterieId);
  await saveCharacter();
}
