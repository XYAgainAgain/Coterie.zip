import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { route } from 'preact-router';
import {
  characterList,
  loadCharacterList,
  createCharacter,
  deleteCharacter,
  MAX_CHARACTERS,
} from '../state/persistence';
import { editMode } from '../state/ui';

export function CharacterList() {
  const loading = useSignal(true);
  const deleting = useSignal<string | null>(null);

  useEffect(() => {
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
      alert(err instanceof Error ? err.message : 'Failed to create character');
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete ${name || 'this character'}? This cannot be undone.`)) return;
    deleting.value = id;
    try {
      await deleteCharacter(id);
    } catch {
      alert('Failed to delete character.');
    } finally {
      deleting.value = null;
    }
  }

  return (
    <div class="vamp-character-list">
      <h2 style={{ fontFamily: 'var(--v-font-display)', color: 'var(--v-text-accent)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '1.6rem' }}>
        Your Kindred
      </h2>

      {list.length === 0 && (
        <div class="vamp-character-list__empty">
          No characters yet. Create your first Kindred below.
        </div>
      )}

      {list.map(c => (
        <div
          class="vamp-character-list__card"
          key={c.id}
          onClick={() => route(`/vamp/${c.id}`)}
        >
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
          {editMode.value && (
            <button
              class="vamp-character-list__delete"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(c.id, c.name);
              }}
              disabled={deleting.value === c.id}
              aria-label={`Delete ${c.name || 'character'}`}
            >
              {deleting.value === c.id ? '...' : '×'}
            </button>
          )}
        </div>
      ))}

      {list.length < MAX_CHARACTERS && (
        <div
          class="vamp-character-list__new"
          onClick={handleCreate}
        >
          + Create New Kindred
        </div>
      )}

      {list.length >= MAX_CHARACTERS && (
        <div class="vamp-character-list__limit">
          Character limit reached ({MAX_CHARACTERS})
        </div>
      )}
    </div>
  );
}
