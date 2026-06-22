import { signal, effect } from '@preact/signals';
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, deleteField,
  query, where, serverTimestamp, onSnapshot, runTransaction,
} from 'firebase/firestore';
import { db, auth, linkedEmail } from '../firebase';
import { character, type CharacterState, type Note, BLANK_CHARACTER, removeQtyFromItem, receiveItem, freeContainerChildren } from './character';
import { planNotesReconcile } from './notesSync';
import { activeStConsent, type StConsent } from './storyteller';
import type { Item, ItemType, Gift } from '../data/types';
import { isEquippableType } from '../data/itemTags';
import { giftDisplayName, pickVerb, giftRecipientToast } from '../data/gifts';
import { forceToast } from './toasts';
import { coterieState, masqueradeClock, blankCoterie, coterieDirty, masqueradeDirty } from './coterie';
import type { CoterieState, CoterieMember } from './coterie';
import type { Clock } from './character';
import type { RollLogEntry } from '../dice/types';
import { idbGet, idbPut, idbDelete, idbGetAll } from './idb';
import { showToast } from './toasts';

const MAX_CHARACTERS_ANON = 2;
const MAX_CHARACTERS_LINKED = 12;

export function maxCharacters(): number {
  return (auth.currentUser?.email || linkedEmail.value) ? MAX_CHARACTERS_LINKED : MAX_CHARACTERS_ANON;
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

/* Full CharacterState plus persistence metadata, stored as 1 IDB record. */
interface IDBCharacterRecord extends CharacterState {
  id: string;
  ownerId: string;
  coterieId: string | null;
  slug: string;
  public: boolean;
  schemaVersion: number;
  updatedAt: number;
  pendingSync: boolean;
  /* Mirrors the dedicated character-doc field, kept here so an offline reload doesn't
     lose it (Firestore is authoritative when online). */
  stConsent?: StConsent | null;
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
  /* Coerce items to the full shape, then heal dead references (orphaned/self/non-container
     containerId) and stale equip state so the UI never dereferences a missing container. */
  if (Array.isArray(clean.items)) {
    const items = (clean.items as Record<string, unknown>[]).map(it => ({
      id: typeof it.id === 'string' ? it.id : crypto.randomUUID(),
      name: typeof it.name === 'string' ? it.name : '',
      type: typeof it.type === 'string' ? it.type : 'Miscellaneous',
      tags: Array.isArray(it.tags) ? it.tags : [],
      description: typeof it.description === 'string' ? it.description : '',
      qty: typeof it.qty === 'number' && it.qty > 0 ? it.qty : 1,
      equipped: it.equipped === true,
      isContainer: it.isContainer === true,
      containerId: typeof it.containerId === 'string' ? it.containerId : null,
    })) as Item[];
    const containers = new Set(items.filter(i => i.isContainer).map(i => i.id));
    for (const it of items) {
      const cid = it.containerId;
      /* 'haven' is deliberately NOT valid here: Haven items live in the Coterie doc,
         never a character doc, so a stray 'haven' is a ghost — heal it to loose. */
      const valid = cid === null || cid === 'stash'
        || (cid !== it.id && containers.has(cid));
      if (!valid) it.containerId = null;
      if (it.equipped && (it.containerId !== null || !isEquippableType(it.type as ItemType))) {
        it.equipped = false;
      }
    }
    clean.items = items;
  }
  return clean as unknown as CharacterState;
}

/* Advisory stamp on freshly-saved docs; reads tolerate absent fields, so nothing
   branches on it. Bumped to 2 when the items array (Possessions) was added. */
export const SCHEMA_VERSION = 2;

/* Defined in character.ts (so the default signal can use it cycle-free); re-exported
   here for components that import it from the persistence module. */
export { BLANK_CHARACTER };

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
  } catch (err) {
    if (!warnedLocalLoadFail) {
      warnedLocalLoadFail = true;
      showToast('Local storage unavailable; loading characters from the cloud only.', 'warning');
    }
    console.error('[Persist] IDB list failed:', err);
  }

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
          stConsent: (data.stConsent as StConsent | null) ?? null,
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

/* Notes live in an owner-only subcollection, hidden from a consented ST who can read the parent. */
function withoutNotes(state: CharacterState): Omit<CharacterState, 'notes'> {
  const { notes, ...rest } = state;
  void notes;
  return rest;
}
function notesDoc(id: string) {
  return doc(db, 'characters', id, 'private', 'notes');
}
async function writeNotesSub(id: string, uid: string, notes: Note[]): Promise<void> {
  await setDoc(notesDoc(id), { ownerId: uid, notes, updatedAt: serverTimestamp() });
}

/* Migrate notes: write the sub BEFORE deleting the parent field, so a failed write can't lose them. */
async function reconcileNotes(id: string, uid: string, cloudAuthoritative: boolean, parentHadNotes: boolean): Promise<void> {
  if (!uid) return;
  let subExists = false;
  let subNotes: Note[] = [];
  try {
    const snap = await getDoc(notesDoc(id));
    if (snap.exists()) { subExists = true; subNotes = (snap.data().notes as Note[]) ?? []; }
  } catch { return; }

  const plan = planNotesReconcile({ subExists, cloudAuthoritative, parentHasNotesField: parentHadNotes });

  if (plan.adoptSubNotes) {
    character.value = { ...character.value, notes: subNotes };
    lastSavedJson = JSON.stringify(character.value);
    try {
      const rec = await idbGet<IDBCharacterRecord>('characters', id);
      if (rec) await idbPut('characters', { ...rec, notes: subNotes });
    } catch {}
  }
  if (plan.writeSub) {
    try { await writeNotesSub(id, uid, character.value.notes); }
    catch { return; }
  }
  if (plan.deleteParentField) {
    try { await setDoc(doc(db, 'characters', id), { notes: deleteField(), updatedAt: serverTimestamp() }, { merge: true }); } catch {}
  }
}

export async function loadCharacter(id: string): Promise<void> {
  let idbTs = 0;
  let loaded = false;
  let localPending = false;
  let coterieId: string | null = null;

  try {
    const rec = await idbGet<IDBCharacterRecord>('characters', id);
    if (rec) {
      const state = stripMetadata(rec as unknown as Record<string, unknown>);
      lastSavedJson = JSON.stringify(state);
      character.value = state;
      activeCharacterId.value = id;
      idbTs = rec.updatedAt || 0;
      localPending = rec.pendingSync;
      coterieId = rec.coterieId;
      activeStConsent.value = rec.stConsent ?? null;
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
    const fsFresher = ts > idbTs || !loaded;
    const uid = auth.currentUser?.uid ?? '';

    /* Consent lives outside the autosaved blob, so it isn't subject to the state
       freshness check: Firestore is always authoritative for it when online. */
    const consent = (raw.stConsent as StConsent | null) ?? null;
    activeStConsent.value = consent;

    if (fsFresher) {
      const state = stripMetadata(raw);
      lastSavedJson = JSON.stringify(state);
      character.value = state;
      activeCharacterId.value = id;
      coterieId = raw.coterieId ?? null;

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
        stConsent: consent,
      } satisfies IDBCharacterRecord).catch(() => {});
    }

    /* Cloud notes win unless local has unsynced edits AND the server isn't newer; mirrors
       how the parent-field overwrite above resolves a cross-device conflict. */
    await reconcileNotes(id, uid, fsFresher || !localPending, 'notes' in raw);
  } catch (err) {
    if (!loaded) throw err;
  }

  if (coterieId) {
    await loadCoterie(coterieId);
  }
}

/* Once-per-session storage failure warnings; retries stay silent */
let warnedLocalSaveFail = false;
let warnedLocalLoadFail = false;

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
      stConsent: existing?.stConsent ?? null,
    } satisfies IDBCharacterRecord);
    idbOk = true;

    /* Sync member data to Coterie doc when character changes */
    if (coterieId) {
      await syncMemberToCoterie(id, state, coterieId, newSlug);
    }
  } catch (err) {
    /* Warn once per session; the debounced save will keep retrying */
    if (!warnedLocalSaveFail) {
      warnedLocalSaveFail = true;
      showToast('Local save failed (browser storage may be blocked). Cloud sync is still active.', 'warning');
    }
    console.error('[Persist] IDB save failed:', err);
  }

  /* Only mark as saved once at least one storage path has the data */
  if (idbOk) lastSavedJson = json;

  try {
    const slug = generateNameSlug(state.name);
    await setDoc(doc(db, 'characters', id), {
      ...withoutNotes(state),
      ownerId: uid,
      coterieId,
      slug,
      public: !!coterieId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await writeNotesSub(id, uid, state.notes);

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

  /* Count from Firestore (not IDB) so the cap can't be bypassed via DevTools.
     Linked status from auth.currentUser.email (actual Firebase state, not signal). */
  const isLinked = !!auth.currentUser?.email;
  const cap = isLinked ? MAX_CHARACTERS_LINKED : MAX_CHARACTERS_ANON;
  let count: number;
  try {
    const q = query(collection(db, 'characters'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    count = snap.size;
  } catch {
    const all = await idbGetAll<IDBCharacterRecord>('characters');
    count = all.filter(r => r.ownerId === uid).length;
  }
  if (count >= cap) {
    throw new Error(
      !isLinked
        ? `Anonymous users can create up to ${MAX_CHARACTERS_ANON} characters. Link your email to unlock ${MAX_CHARACTERS_LINKED}!`
        : `Character limit reached (${MAX_CHARACTERS_LINKED}), sorry!`,
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
    schemaVersion: SCHEMA_VERSION,
    updatedAt: Date.now(),
    pendingSync: true,
  };

  await idbPut('characters', record);

  try {
    await setDoc(ref, {
      ...withoutNotes(state),
      ownerId: uid,
      slug,
      public: false,
      schemaVersion: SCHEMA_VERSION,
      coterieId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeNotesSub(ref.id, uid, state.notes);
    await idbPut('characters', { ...record, pendingSync: false, updatedAt: Date.now() });
  } catch {}

  lastSavedJson = JSON.stringify(state);
  character.value = state;
  activeCharacterId.value = ref.id;
  activeStConsent.value = null;
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
        const otherChar = await ownsOtherMemberCharacter(uid, coterieId, id);
        /* Unknown membership state: leave the Coterie doc alone rather than risk
           deleting it under another of the user's characters or zombifying it. */
        if (otherChar === null) throw new Error('membership check failed');
        const keepUid = otherChar;
        if (uids.length <= 1 && !keepUid) {
          await deleteDoc(doc(db, 'coteries', coterieId));
          if (activeCoterie.value === coterieId) {
            stopCoterieListener();
            activeCoterie.value = null;
          }
        } else {
          /* Drop this character's roster entry too, not just the uid, or it
             lingers as a phantom member in everyone's Members list. */
          const members: CoterieMember[] = coterieSnap.data().members ?? [];
          await setDoc(doc(db, 'coteries', coterieId), {
            memberUids: keepUid ? uids : uids.filter(u => u !== uid),
            members: members.filter(m => m.characterId !== id),
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }
      }
    }
  } catch {}

  try { await idbDelete('characters', id); } catch {}
  /* Subcollections don't cascade on parent delete, so drop the notes doc explicitly. */
  try { await deleteDoc(notesDoc(id)); } catch {}
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
        ...withoutNotes(state),
        ownerId: uid,
        coterieId: rec.coterieId,
        slug: rec.slug,
        public: rec.public,
        schemaVersion: rec.schemaVersion,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await writeNotesSub(rec.id, uid, state.notes);
      await idbPut('characters', { ...rec, pendingSync: false, updatedAt: Date.now() });
    } catch {}
  }
}

/* True if the user owns another character (besides excludeCharId) still attached to
   this Coterie. Removing the uid from memberUids while such a character remains
   locks the user out of their own Coterie (this raptured Jaz on 2026-06-11).
   Returns null when the query fails, so callers can pick their own safe fallback. */
async function ownsOtherMemberCharacter(uid: string, coterieId: string, excludeCharId: string): Promise<boolean | null> {
  try {
    const q = query(
      collection(db, 'characters'),
      where('ownerId', '==', uid),
      where('coterieId', '==', coterieId),
    );
    const snap = await getDocs(q);
    return snap.docs.some(d => d.id !== excludeCharId);
  } catch {
    return null;
  }
}

async function setCharacterCoterie(charId: string, coterieId: string | null): Promise<void> {
  await setDoc(doc(db, 'characters', charId), {
    coterieId,
    public: !!coterieId,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  try {
    const rec = await idbGet<IDBCharacterRecord>('characters', charId);
    if (rec) await idbPut('characters', { ...rec, coterieId, public: !!coterieId, updatedAt: Date.now() });
  } catch {}
}

async function syncMemberToCoterie(
  characterId: string,
  state: CharacterState,
  coterieId: string,
  slug: string,
): Promise<void> {
  try {
    const firstPortrait = state.portraits[0]?.url ?? null;
    const pronouns = state.bio.pronouns.filter(Boolean).join('/');

    /* Each write costs ~1 read per online player; skip when nothing roster-visible
       changed (slug excluded — the roster holds the deduped form) */
    const current = coterieState.value.members.find(m => m.characterId === characterId);
    if (current
      && current.name === (state.name || 'Unnamed')
      && current.pronouns === (pronouns || '?/?')
      && current.portraitUrl === firstPortrait
      && current.ageBracket === state.ageBracket
      && current.bp === state.bp
      && current.playbook === state.playbook) {
      return;
    }

    const coterieRef = doc(db, 'coteries', coterieId);

    await runTransaction(db, async (txn) => {
      const coterieSnap = await txn.get(coterieRef);
      if (!coterieSnap.exists()) return;

      const data = coterieSnap.data();
      const members: CoterieMember[] = data.members ?? [];

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
let coterieSaveRetry: ReturnType<typeof setTimeout> | null = null;
let coterieSaveFailures = 0;
let coterieSaving = false;
let coterieSaveQueued = false;
const MAX_COTERIE_SAVE_RETRIES = 5;

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
      /* Local edits only: saving on bare signal change looped write→snapshot→write
         in every open tab (the 2026-06-11 136K-read quota blowout) */
      if (!coterieDirty.value && !masqueradeDirty.value) return;
      /* Schedule-once: resetting a pending timer would let busy-group roster
         snapshots starve the save indefinitely */
      if (!coterieSaveTimer) {
        coterieSaveTimer = setTimeout(() => { coterieSaveTimer = null; saveCoterie(); }, 2000);
      }
    });
  }
}

export function stopAutoSave(): void {
  if (charSaveTimer) { clearTimeout(charSaveTimer); charSaveTimer = null; }
  if (coterieSaveTimer) { clearTimeout(coterieSaveTimer); coterieSaveTimer = null; }
  if (coterieSaveRetry) { clearTimeout(coterieSaveRetry); coterieSaveRetry = null; }
  coterieSaveFailures = 0;
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

/* Tab close inside the 2s debounce window would drop the last edit; pagehide
   is the last reliable hook (fires on mobile, unlike beforeunload). No-op
   when nothing is pending thanks to the lastSavedJson dedup. */
window.addEventListener('pagehide', () => { void flushSave(); });

/* Resolve /vamp/{code}/{slug} → character ID + ownership; owners skip the membership gate */
export async function resolveCoterieCharacter(
  rawCoterieCode: string,
  charSlug: string,
): Promise<{ characterId: string; isOwner: boolean }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  const coterieCode = rawCoterieCode.trim().toUpperCase();
  const coterieSnap = await getDoc(doc(db, 'coteries', coterieCode));
  if (!coterieSnap.exists()) throw new Error(`Coterie "${coterieCode}" not found`);

  const coterieData = coterieSnap.data();
  const members: CoterieMember[] = coterieData.members ?? [];
  const member = members.find(m => m.slug === charSlug);
  if (!member) throw new Error(`No character "${charSlug}" found in this Coterie`);

  const charSnap = await getDoc(doc(db, 'characters', member.characterId));
  if (!charSnap.exists()) throw new Error('Character document not found');

  const isOwner = charSnap.data().ownerId === uid;
  if (!isOwner) {
    const memberUids: string[] = coterieData.memberUids ?? [];
    if (!memberUids.includes(uid)) {
      throw new Error("Sorry, you don't have permission to peek at this sheet! Try another coffin.");
    }
  }

  return { characterId: member.characterId, isOwner };
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
  if (!memberUids.includes(uid)) {
    throw new Error("Sorry, you don't have permission to peek at this sheet! Try another coffin.");
  }

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

/* Load any character by ID for public read-only viewing (no Coterie membership required... yet) */
export async function loadCharacterPublic(
  charId: string,
): Promise<{ state: CharacterState; isOwner: boolean; coterieId: string | null }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  const charSnap = await getDoc(doc(db, 'characters', charId));
  if (!charSnap.exists()) throw new Error('Character not found');

  const raw = charSnap.data();
  const state = stripMetadata(raw);
  const isOwner = raw.ownerId === uid;
  const coterieId: string | null = (raw.coterieId as string) ?? null;

  return { state, isOwner, coterieId };
}

let coterieUnsub: (() => void) | null = null;

function applyCoterie(data: Record<string, unknown>, preserveLocalEdits = false) {
  const members = (data.members as CoterieState['members']) ?? [];
  /* Shared inventory + gift queue are externally owned, so they always apply (like
     members), regardless of our local dirty state. */
  const havenItems = (data.havenItems as Item[]) ?? [];
  const giftQueue = (data.giftQueue as Gift[]) ?? [];
  const diceRolls = (data.diceRolls as RollLogEntry[]) ?? [];
  const storytellerUid = (data.storytellerUid as string | null) ?? null;
  /* Roster always applies (externally owned). The Clock applies too, except while our increment is in flight, so a stale snapshot can't revert it. */
  if (data.masqueradeClock && !masqueradeDirty.value) {
    masqueradeClock.value = data.masqueradeClock as Clock;
  }
  if (preserveLocalEdits) {
    console.log('[CoterieSync] applyCoterie PRESERVE local; ignoring incoming stats', data.stats);
    coterieState.value = { ...coterieState.value, members, havenItems, giftQueue, diceRolls, storytellerUid };
    processGiftQueue();
    return;
  }
  console.log('[CoterieSync] applyCoterie OVERWRITE from server; stats', data.stats, 'haven', data.havenDescription);
  coterieState.value = {
    typeName: (data.typeName as string) ?? '',
    stats: (data.stats as CoterieState['stats']) ?? { Clout: 0, Cohesion: 0, Charm: 0, Claim: 0, Currency: 0 },
    havenDescription: (data.havenDescription as string) ?? '',
    havenPositives: (data.havenPositives as string[]) ?? [],
    havenNegatives: (data.havenNegatives as string[]) ?? [],
    members,
    havenItems,
    giftQueue,
    diceRolls,
    storytellerUid,
  };
  processGiftQueue();
}

/* Claim every queued gift addressed to the active character. Idempotent on two axes:
   the local add keys on the gift id, and the queue-removal transaction no-ops for any
   client that lost the race. Adding locally BEFORE removing means a crash mid-claim
   re-claims harmlessly next load rather than dropping the item.

   Loop-safety: runTransaction commits server-side, so the resulting snapshot arrives
   with hasPendingWrites=false and DOES re-enter applyCoterie → processGiftQueue. The
   `claiming` guard plus the idempotent "gift already gone → no-op" transaction are what
   terminate it (the snapshot post-removal shows an empty queue), NOT the echo-skip. Keep
   the guard. */
let claiming = false;
function processGiftQueue(): void {
  if (claiming) return;
  const mine = activeCharacterId.value;
  const coterieId = activeCoterie.value;
  if (!mine || !coterieId) return;
  const pending = coterieState.value.giftQueue.filter(g => g.toCharacterId === mine);
  if (pending.length === 0) return;
  claiming = true;
  (async () => {
    try { for (const gift of pending) await claimGift(gift, coterieId); }
    finally { claiming = false; }
  })();
}

async function claimGift(gift: Gift, coterieId: string): Promise<void> {
  receiveItem({ ...gift.item, id: gift.id, equipped: false, containerId: null });
  const ref = doc(db, 'coteries', coterieId);
  let won = false;
  try {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) return;
      const queue: Gift[] = snap.data().giftQueue ?? [];
      if (!queue.some(g => g.id === gift.id)) return;
      won = true;
      txn.update(ref, { giftQueue: queue.filter(g => g.id !== gift.id), updatedAt: serverTimestamp() });
    });
  } catch { return; }
  if (won) forceToast(giftRecipientToast(gift), 'success', 'Incoming!');
}

/* Hand part or all of a stack to a Coterie-mate. Writes the gift to the shared queue
   first; only on success does the sender's stack shrink, so a failed write can't vanish it. */
export async function giveItem(itemId: string, toCharacterId: string, amount: number): Promise<void> {
  const coterieId = activeCoterie.value;
  const fromId = activeCharacterId.value;
  if (!coterieId || !fromId) return;
  const item = character.value.items.find(i => i.id === itemId);
  if (!item) return;
  const qty = Math.max(1, Math.min(Math.floor(amount), item.qty));

  const gift: Gift = {
    id: crypto.randomUUID(),
    item: { ...item, qty, equipped: false, containerId: null },
    fromCharacterId: fromId,
    fromDisplayName: giftDisplayName(character.value.name),
    toCharacterId,
    verb: pickVerb(),
    createdAt: Date.now(),
  };

  try {
    const ref = doc(db, 'coteries', coterieId);
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) throw new Error('Coterie not found');
      const queue: Gift[] = snap.data().giftQueue ?? [];
      txn.update(ref, { giftQueue: [...queue, gift], updatedAt: serverTimestamp() });
    });
  } catch {
    forceToast('Could not hand that over right now. Try again?', 'warning');
    return;
  }

  /* Free a given container's children to loose first, or they'd strand pointing at a
     parent that's left for the recipient. */
  if (item.isContainer) freeContainerChildren(itemId);
  removeQtyFromItem(itemId, qty);
  const recipient = coterieState.value.members.find(m => m.characterId === toCharacterId)?.name ?? 'them';
  forceToast(`Gave ${qty > 1 ? `${qty}× ` : ''}your ${item.name} to ${recipient}.`, 'info');
}

/* Stash the whole stack in the Coterie-shared Haven. A container's children are freed
   to loose first so they don't strand pointing at a now-departed parent. */
export async function depositToHaven(itemId: string): Promise<void> {
  const coterieId = activeCoterie.value;
  if (!coterieId) return;
  const item = character.value.items.find(i => i.id === itemId);
  if (!item) return;
  const havenItem: Item = { ...item, equipped: false, containerId: 'haven' };

  try {
    const ref = doc(db, 'coteries', coterieId);
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) throw new Error('Coterie not found');
      const haven: Item[] = snap.data().havenItems ?? [];
      txn.update(ref, { havenItems: [...haven, havenItem], updatedAt: serverTimestamp() });
    });
  } catch {
    forceToast('Could not reach the Haven right now. Try again?', 'warning');
    return;
  }

  if (item.isContainer) freeContainerChildren(itemId);
  removeQtyFromItem(itemId, item.qty);
}

/* Append to the Coterie-shared log (newest-first, capped 50). Transaction so concurrent
   rolls don't clobber; a dropped write is swallowed (the roller still saw the toast). */
export async function appendCoterieRoll(entry: RollLogEntry): Promise<void> {
  const coterieId = activeCoterie.value;
  if (!coterieId) return;
  try {
    const ref = doc(db, 'coteries', coterieId);
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) return;
      const rolls: RollLogEntry[] = snap.data().diceRolls ?? [];
      txn.update(ref, { diceRolls: [entry, ...rolls].slice(0, 50), updatedAt: serverTimestamp() });
    });
  } catch { /* roll-log write isn't worth a retry or a toast */ }
}

/* Pull an item out of the shared Haven into your own inventory. Idempotent: a stale
   click re-reads an absent item and no-ops, so two members can't both grab it. */
export async function withdrawFromHaven(havenItemId: string): Promise<void> {
  const coterieId = activeCoterie.value;
  if (!coterieId) return;
  const ref = doc(db, 'coteries', coterieId);
  let taken: Item | null = null;
  try {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) return;
      const haven: Item[] = snap.data().havenItems ?? [];
      const found = haven.find(i => i.id === havenItemId);
      if (!found) return;
      taken = found;
      txn.update(ref, { havenItems: haven.filter(i => i.id !== havenItemId), updatedAt: serverTimestamp() });
    });
  } catch {
    forceToast('Could not reach the Haven right now. Try again?', 'warning');
    return;
  }
  if (taken) receiveItem({ ...(taken as Item), containerId: null, equipped: false });
}

/* Edit a shared Haven item in place. Writes via transaction like deposit/withdraw,
   since havenItems is externally owned and never dirty-gated; the snapshot reflects it. */
export async function updateHavenItem(id: string, patch: Partial<Omit<Item, 'id'>>): Promise<void> {
  const coterieId = activeCoterie.value;
  if (!coterieId) return;
  const ref = doc(db, 'coteries', coterieId);
  try {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) return;
      const haven: Item[] = snap.data().havenItems ?? [];
      txn.update(ref, { havenItems: haven.map(i => (i.id === id ? { ...i, ...patch } : i)), updatedAt: serverTimestamp() });
    });
  } catch {
    forceToast('Could not update that Haven item right now. Try again?', 'warning');
  }
}

export async function removeHavenItem(id: string): Promise<void> {
  const coterieId = activeCoterie.value;
  if (!coterieId) return;
  const ref = doc(db, 'coteries', coterieId);
  try {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) return;
      const haven: Item[] = snap.data().havenItems ?? [];
      txn.update(ref, { havenItems: haven.filter(i => i.id !== id), updatedAt: serverTimestamp() });
    });
  } catch {
    forceToast('Could not remove that Haven item right now. Try again?', 'warning');
  }
}

/* Relative qty change resolved inside the transaction, so rapid clicks can't lose updates. */
export async function adjustHavenItemQty(id: string, delta: number): Promise<void> {
  const coterieId = activeCoterie.value;
  if (!coterieId) return;
  const ref = doc(db, 'coteries', coterieId);
  try {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists()) return;
      const haven: Item[] = snap.data().havenItems ?? [];
      txn.update(ref, { havenItems: haven.map(i => (i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)), updatedAt: serverTimestamp() });
    });
  } catch {
    forceToast('Could not update quantity right now. Try again?', 'warning');
  }
}

export async function loadCoterie(coterieId: string): Promise<void> {
  if (coterieUnsub) { coterieUnsub(); coterieUnsub = null; }

  const snap = await getDoc(doc(db, 'coteries', coterieId));
  if (!snap.exists()) return;
  applyCoterie(snap.data());
  activeCoterie.value = coterieId;

  coterieUnsub = onSnapshot(doc(db, 'coteries', coterieId), snap => {
    console.log('[CoterieSync] snapshot pending=', snap.metadata.hasPendingWrites, 'dirty=', coterieDirty.value, 'exists=', snap.exists());
    /* Skip local write echoes; only confirmed remote changes apply. */
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    applyCoterie(snap.data(), coterieDirty.value);
  });
}

export function stopCoterieListener() {
  if (coterieUnsub) { coterieUnsub(); coterieUnsub = null; }
  /* Clear the claim guard so a hung in-flight transaction on the old Coterie can't
     suppress gift processing after a switch. */
  claiming = false;
}

export async function saveCoterie(): Promise<void> {
  const id = activeCoterie.value;
  const uid = auth.currentUser?.uid;
  if (!id || !uid) return;
  /* 1 write at a time; a concurrent debounce + retry would double-count failures and race the give-up clear. Re-run once if an edit lands mid-write. */
  if (coterieSaving) { coterieSaveQueued = true; return; }
  coterieSaving = true;

  /* Write only the fields this save owns; members/memberUids, havenItems, and diceRolls
     belong to the transactional paths — never spread ...c here or it clobbers their appends. */
  const c = coterieState.value;
  const clockAtWrite = masqueradeClock.value;
  console.log('[CoterieSync] saveCoterie writing stats', c.stats, 'haven', c.havenDescription, 'clock', clockAtWrite.filled);
  try {
    await setDoc(doc(db, 'coteries', id), {
      typeName: c.typeName,
      stats: c.stats,
      havenDescription: c.havenDescription,
      havenPositives: c.havenPositives,
      havenNegatives: c.havenNegatives,
      masqueradeClock: clockAtWrite,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    coterieSaveFailures = 0;
    if (coterieSaveRetry) { clearTimeout(coterieSaveRetry); coterieSaveRetry = null; }
    /* Clear guards only after the server confirms, and only if nothing landed mid-write */
    const now = coterieState.value;
    const unchanged = now.typeName === c.typeName && now.stats === c.stats
      && now.havenDescription === c.havenDescription
      && now.havenPositives === c.havenPositives && now.havenNegatives === c.havenNegatives;
    if (unchanged) coterieDirty.value = false;
    if (masqueradeClock.value === clockAtWrite) masqueradeDirty.value = false;
  } catch (err) {
    /* Retry on timer; a stuck-dirty client ignores incoming snapshots and re-pushes stale fields. After repeated failures, clear guards so sync recovers. */
    console.error('[Coterie] saveCoterie failed:', err);
    if (coterieSaveFailures < MAX_COTERIE_SAVE_RETRIES) {
      coterieSaveFailures++;
      if (!coterieSaveRetry) {
        coterieSaveRetry = setTimeout(() => { coterieSaveRetry = null; saveCoterie(); }, 3000);
      }
    } else {
      coterieSaveFailures = 0;
      coterieDirty.value = false;
      masqueradeDirty.value = false;
    }
  } finally {
    coterieSaving = false;
    if (coterieSaveQueued) { coterieSaveQueued = false; saveCoterie(); }
  }
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

  const state: CoterieState = { ...blankCoterie(), ...initial };

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

  /* Sync this character's member entry, then loadCoterie to attach the live onSnapshot listener & pull back the doc. Without this, the creator never receives live updates. */
  const charId = activeCharacterId.value;
  if (charId) {
    const slug = generateNameSlug(character.value.name);
    await syncMemberToCoterie(charId, character.value, code, slug);
    await setCharacterCoterie(charId, code);
  }

  await loadCoterie(code);

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

  /* Write the roster entry and the character's association explicitly rather
     than via saveCharacter, which dedups on character-state JSON (unchanged on a bare join) and would skip both. */
  const slug = generateNameSlug(character.value.name);
  await syncMemberToCoterie(charId, character.value, coterieId, slug);
  await setCharacterCoterie(charId, coterieId);
}

/* Detach the active character from Coterie without deleting character. Removes the member entry (and uid), deleting the Coterie if it was the last member. The character keeps the code implicitly and can rejoin by entering it. */
export async function leaveCoterie(): Promise<void> {
  const uid = auth.currentUser?.uid;
  const coterieId = activeCoterie.value;
  const charId = activeCharacterId.value;
  if (!uid || !coterieId || !charId) return;

  /* No try/catch around the critical writes: if any throw, the error reaches
     handleLeave (which toasts) & local state is left intact, so user stays
     in the Coterie rather than ending up in the Abyss. */
  const coterieSnap = await getDoc(doc(db, 'coteries', coterieId));
  if (coterieSnap.exists()) {
    const uids: string[] = coterieSnap.data().memberUids ?? [];
    /* Unknown membership state on leave: keep the uid (recoverable; rejoin works) */
    const keepUid = (await ownsOtherMemberCharacter(uid, coterieId, charId)) ?? true;
    if (uids.length <= 1 && !keepUid) {
      await deleteDoc(doc(db, 'coteries', coterieId));
    } else {
      const members: CoterieMember[] = coterieSnap.data().members ?? [];
      await setDoc(doc(db, 'coteries', coterieId), {
        memberUids: keepUid ? uids : uids.filter(u => u !== uid),
        members: members.filter(m => m.characterId !== charId),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  }

  await setCharacterCoterie(charId, null);

  /* Leaving revokes consent; the ST can't clear other players' consent, so do our own here. */
  try { await clearStConsent(charId); } catch {}

  stopCoterieListener();
  activeCoterie.value = null;
  coterieState.value = blankCoterie();
  activeStConsent.value = null;
  masqueradeClock.value = { id: 'masquerade', name: 'The Masquerade', segments: 8, filled: 0 };
}

/* Storytellers must be email-verified; the Firestore rules enforce the same server-side. */
function isEmailVerified(): boolean {
  return auth.currentUser?.emailVerified === true;
}

/* Claim an unclaimed Coterie as its Storyteller. Writes only storytellerUid, never roster
   or stats. Throws if already claimed by someone else or the user isn't email-verified. */
export async function claimStoryteller(rawCode: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  if (!isEmailVerified()) throw new Error('Storytellers must link a verified email first.');

  const code = rawCode.trim().toUpperCase();
  const ref = doc(db, 'coteries', code);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`No Coterie found with code "${code}"`);
  const current = (snap.data().storytellerUid as string | null) ?? null;
  if (current && current !== uid) throw new Error('This Coterie already has a Storyteller.');

  await setDoc(ref, { storytellerUid: uid, updatedAt: serverTimestamp() }, { merge: true });
}

/* Step down (the current ST) or kick (a member). Either clears storytellerUid; the uid
   mismatch then auto-invalidates every player's consent. */
export async function clearStoryteller(rawCode: string): Promise<void> {
  if (!auth.currentUser?.uid) throw new Error('Not authenticated');
  const code = rawCode.trim().toUpperCase();
  await setDoc(doc(db, 'coteries', code), { storytellerUid: null, updatedAt: serverTimestamp() }, { merge: true });
}

/* Owner approves the current Storyteller for their character. The dedicated stConsent field
   (outside the autosaved blob) IS the security boundary for ST sheet access. */
export async function setStConsent(charId: string, stUid: string): Promise<void> {
  if (!auth.currentUser?.uid) return;
  const consent: StConsent = { uid: stUid, approvedAt: Date.now() };
  /* Signal only after the write lands, so a rejected write can't leave the UI showing
     consent that was never persisted. */
  await setDoc(doc(db, 'characters', charId), { stConsent: consent, updatedAt: serverTimestamp() }, { merge: true });
  activeStConsent.value = consent;
  try {
    const rec = await idbGet<IDBCharacterRecord>('characters', charId);
    if (rec) await idbPut('characters', { ...rec, stConsent: consent });
  } catch {}
}

/* Withdraw consent (decline, or on leaving). Removes the field so the rules read it as null. */
export async function clearStConsent(charId: string): Promise<void> {
  if (!auth.currentUser?.uid) return;
  await setDoc(doc(db, 'characters', charId), { stConsent: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
  activeStConsent.value = null;
  try {
    const rec = await idbGet<IDBCharacterRecord>('characters', charId);
    if (rec) await idbPut('characters', { ...rec, stConsent: null });
  } catch {}
}
