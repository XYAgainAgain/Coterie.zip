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
} from '../state/persistence';
import { vampConfirm } from '../state/dialog';
import { showToast } from '../state/toasts';

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
    </div>
  );
}
