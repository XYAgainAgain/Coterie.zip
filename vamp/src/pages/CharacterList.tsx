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

const ST_CODE_KEY = 'vamp-st-code';

/* "I'm a Storyteller" entry: claim-by-code plus a status card for the claimed Coterie.
   Phase 1 has no ST dashboard or Chronicles query, so the last claimed code is remembered
   locally and re-resolved on open; re-entering a code you already ST shows the same card. */
function StorytellerClaim() {
  const open = useSignal(false);
  const code = useSignal('');
  const status = useSignal<StClaimStatus | null>(null);
  const working = useSignal(false);
  const confirmStepDown = useSignal(false);

  async function toggleOpen() {
    open.value = !open.value;
    if (!open.value || status.value) return;
    const remembered = localStorage.getItem(ST_CODE_KEY);
    if (!remembered) return;
    working.value = true;
    try {
      const s = await getStClaimStatus(remembered);
      if (s?.isStoryteller) status.value = s;
      else localStorage.removeItem(ST_CODE_KEY);
    } catch {}
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
      localStorage.setItem(ST_CODE_KEY, c);
      status.value = (await getStClaimStatus(c)) ?? existing;
      code.value = '';
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not claim that Coterie.', 'error');
    }
    working.value = false;
  }

  async function handleStepDown() {
    const s = status.value;
    if (!s || working.value) return;
    working.value = true;
    try {
      await clearStoryteller(s.code);
      localStorage.removeItem(ST_CODE_KEY);
      status.value = null;
      confirmStepDown.value = false;
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
          {status.value ? (
            <div class="vamp-st-claim__card">
              <div class="vamp-st-claim__title">{status.value.typeName || 'Your Chronicle'}</div>
              <div class="vamp-st-claim__meta">
                Code {status.value.code} &middot; {status.value.memberCount} member{status.value.memberCount === 1 ? '' : 's'} &middot; {status.value.consented} of {status.value.memberCount} consented
              </div>
              <div class="vamp-st-claim__note">Storyteller Dashboard coming soon! For now, all consenting players in the Coterie have granted you read-only access to their sheets.</div>
              {confirmStepDown.value ? (
                <div class="vamp-st-claim__actions">
                  <span>Step down as Storyteller?</span>
                  <button class="vamp-btn vamp-btn--sm" onClick={handleStepDown} disabled={working.value}>Yes, step down</button>
                  <button class="vamp-btn vamp-btn--sm" onClick={() => { confirmStepDown.value = false; }}>Cancel</button>
                </div>
              ) : (
                <button class="vamp-btn vamp-btn--sm" onClick={() => { confirmStepDown.value = true; }} disabled={working.value}>Step down</button>
              )}
            </div>
          ) : (
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
          )}
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
