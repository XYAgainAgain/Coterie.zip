import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { route } from 'preact-router';
import {
  characterList,
  loadCharacterList,
  createCharacter,
  deleteCharacter,
  activeCharacterId,
  maxCharacters,
  claimStoryteller,
  clearStoryteller,
  getStClaimStatus,
  type StClaimStatus,
} from '../state/persistence';
import { vampConfirm } from '../state/dialog';
import { showToast, forceToast } from '../state/toasts';

const ST_CODES_KEY = 'vamp-st-codes';
const LEGACY_ST_CODE_KEY = 'vamp-st-code';

/* One account can Storyteller any number of Coteries; each doc's storytellerUid is
   independent, so the only registry of "my Chronicles" is this local code list. */
function readStCodes(): string[] {
  let codes: string[] = [];
  try { codes = JSON.parse(localStorage.getItem(ST_CODES_KEY) ?? '[]'); } catch {}
  const legacy = localStorage.getItem(LEGACY_ST_CODE_KEY);
  if (legacy) {
    localStorage.removeItem(LEGACY_ST_CODE_KEY);
    if (!codes.includes(legacy)) codes.push(legacy);
  }
  return codes;
}

function writeStCodes(codes: string[]): void {
  localStorage.setItem(ST_CODES_KEY, JSON.stringify(codes));
}

/* "I'm a Storyteller" entry: claim-by-code plus a status card per claimed Coterie.
   Phase 1 has no ST dashboard or Chronicles query, so claimed codes are remembered
   locally and re-resolved on open; re-entering a code you already ST shows the same card. */
function StorytellerClaim() {
  const open = useSignal(false);
  const code = useSignal('');
  const statuses = useSignal<StClaimStatus[]>([]);
  const working = useSignal(false);
  const confirmStepDown = useSignal<string | null>(null);

  async function toggleOpen() {
    open.value = !open.value;
    if (!open.value || statuses.value.length > 0) return;
    const remembered = readStCodes();
    if (remembered.length === 0) return;
    working.value = true;
    const results = await Promise.allSettled(remembered.map(c => getStClaimStatus(c)));
    const keep: string[] = [];
    const cards: StClaimStatus[] = [];
    results.forEach((r, i) => {
      /* A failed read (offline) keeps the code remembered; a successful read that shows
         no ST seat drops it. */
      if (r.status === 'rejected') { keep.push(remembered[i]); return; }
      if (r.value?.isStoryteller) { keep.push(remembered[i]); cards.push(r.value); }
    });
    writeStCodes(keep);
    statuses.value = cards;
    working.value = false;
  }

  async function handleClaim() {
    const c = code.value.trim().toUpperCase();
    if (!c || working.value) return;
    working.value = true;
    try {
      const existing = await getStClaimStatus(c);
      if (!existing) throw new Error(`No Coterie found with code "${c}"`);
      if (!existing.isStoryteller) {
        await claimStoryteller(c);
        forceToast('The Storyteller’s seat is yours. Players will be asked to open their sheets to you.', 'success', 'Claimed');
      }
      const codes = readStCodes();
      if (!codes.includes(c)) writeStCodes([...codes, c]);
      const fresh = (await getStClaimStatus(c)) ?? existing;
      statuses.value = [...statuses.value.filter(s => s.code !== c), fresh];
      code.value = '';
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not claim that Coterie.', 'error');
    }
    working.value = false;
  }

  async function handleStepDown(s: StClaimStatus) {
    if (working.value) return;
    working.value = true;
    try {
      await clearStoryteller(s.code);
      writeStCodes(readStCodes().filter(c => c !== s.code));
      statuses.value = statuses.value.filter(x => x.code !== s.code);
      confirmStepDown.value = null;
      forceToast('You have stepped down. Player consent clears with you.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not step down.', 'error');
    }
    working.value = false;
  }

  return (
    <div class="vamp-st-claim">
      <button class="vamp-st-claim__toggle" onClick={toggleOpen}>
        {open.value ? 'Never mind' : "I'm a Storyteller"}
      </button>
      {open.value && (
        <div class="vamp-st-claim__body">
          {statuses.value.map(s => (
            <div class="vamp-st-claim__card" key={s.code}>
              <div class="vamp-st-claim__title">{s.typeName || 'Your Chronicle'}</div>
              <div class="vamp-st-claim__meta">
                Code {s.code} &middot; {s.memberCount} member{s.memberCount === 1 ? '' : 's'} &middot; {s.consented} of {s.memberCount} consented
              </div>
              <div class="vamp-st-claim__note">Storyteller Dashboard coming soon! For now, all consenting players in the Coterie have granted you read-only access to their sheets.</div>
              {confirmStepDown.value === s.code ? (
                <div class="vamp-st-claim__actions">
                  <span>Step down as Storyteller?</span>
                  <button class="vamp-btn vamp-btn--sm" onClick={() => handleStepDown(s)} disabled={working.value}>Yes, step down</button>
                  <button class="vamp-btn vamp-btn--sm" onClick={() => { confirmStepDown.value = null; }}>Cancel</button>
                </div>
              ) : (
                <button class="vamp-btn vamp-btn--sm" onClick={() => { confirmStepDown.value = s.code; }} disabled={working.value}>Step down</button>
              )}
            </div>
          ))}
          <div class="vamp-st-claim__form">
            <input
              class="vamp-input"
              type="text"
              placeholder="Coterie code"
              value={code.value}
              onInput={(e) => { code.value = (e.target as HTMLInputElement).value; }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleClaim(); }}
            />
            <button class="vamp-btn vamp-btn--sm" onClick={handleClaim} disabled={working.value || !code.value.trim()}>
              {working.value ? 'Claiming…' : 'Claim'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CharacterList() {
  const loading = useSignal(true);
  const deleting = useSignal<string | null>(null);

  useEffect(() => {
    activeCharacterId.value = null;
    document.title = 'Vamp: Coterie Character Sheet';
    loadCharacterList().finally(() => { loading.value = false; });
  }, []);

  if (loading.value) {
    return <div class="vamp-loading">Materializing...</div>;
  }

  const list = characterList.value;

  async function handleCreate() {
    try {
      const id = await createCharacter();
      route(`/vamp/${id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create character', 'error');
    }
  }

  async function handleDelete(id: string) {
    const ok = await vampConfirm(
      "Are you sure you want to delete this character? They'll meet Final Death and be gone forever!",
      { title: 'Final Death', confirmLabel: 'Delete', cancelLabel: 'Cancel' },
    );
    if (!ok) return;
    deleting.value = id;
    try {
      await deleteCharacter(id);
    } catch {
      showToast('Failed to delete character.', 'error');
    } finally {
      deleting.value = null;
    }
  }

  return (
    <div class="vamp-character-list">
      <h2 style={{ fontFamily: 'var(--v-font-display)', color: 'var(--v-text-accent)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '2rem' }}>
        Your <em><strong>Coterie</strong></em> Vamps
      </h2>

      {list.length === 0 && (
        <div class="vamp-character-list__empty">
          No characters yet. Create one below.
        </div>
      )}

      {list.map(c => (
        <div
          class="vamp-character-list__card"
          key={c.id}
          onClick={() => route(`/vamp/${c.id}`)}
        >
          <button
            class="vamp-character-list__delete"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(c.id);
            }}
            disabled={deleting.value === c.id}
            aria-label={`Delete ${c.name || 'character'}`}
          >
            {deleting.value === c.id ? '...' : (
              <svg viewBox="0 0 16 16" width="10" height="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="2" y1="2" x2="14" y2="14" />
                <line x1="14" y1="2" x2="2" y2="14" />
              </svg>
            )}
          </button>
          {c.portraitUrl && (
            <img
              class="vamp-character-list__portrait"
              src={c.portraitUrl}
              alt=""
              loading="lazy"
            />
          )}
          <div>
            <div class="vamp-character-list__name">{c.name || 'Unnamed'}</div>
            <div class="vamp-character-list__playbook">
              {[c.playbook, c.ageBracket].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      ))}

      {list.length < maxCharacters() && (
        <div
          class="vamp-character-list__new"
          onClick={handleCreate}
        >
          + New Character
        </div>
      )}

      {list.length >= maxCharacters() && (
        <div class="vamp-character-list__limit">
          Character limit reached ({maxCharacters()})
        </div>
      )}

      <StorytellerClaim />
    </div>
  );
}
