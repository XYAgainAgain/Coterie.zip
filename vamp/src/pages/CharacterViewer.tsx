import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { route } from 'preact-router';
import { CharacterSheet } from './CharacterSheet';
import { character } from '../state/character';
import { loadCharacterForViewing, activeCharacterId, loadCoterie } from '../state/persistence';
import { viewingOtherSheet } from '../state/ui';

const viewerLoading = signal(false);
const viewerError = signal<string | null>(null);
const viewerReady = signal(false);
const viewerIsOwner = signal(false);

export function CharacterViewer({ coterieCode, charSlug }: { coterieCode?: string; charSlug?: string }) {
  useEffect(() => {
    if (!coterieCode || !charSlug) return;

    viewerLoading.value = true;
    viewerError.value = null;
    viewerReady.value = false;

    loadCharacterForViewing(coterieCode, charSlug)
      .then(async ({ state, coterieId, isOwner }) => {
        if (isOwner) {
          /* Owner viewing their own sheet: redirect to the editable route */
          const charId = activeCharacterId.value;
          if (charId) {
            route(`/vamp/${charId}`, true);
            return;
          }
        }

        character.value = state;
        viewerIsOwner.value = isOwner;
        viewingOtherSheet.value = true;

        await loadCoterie(coterieId);

        viewerReady.value = true;
      })
      .catch(err => {
        viewerError.value = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        viewerLoading.value = false;
      });

    return () => { viewingOtherSheet.value = false; };
  }, [coterieCode, charSlug]);

  if (viewerLoading.value) {
    return <div class="vamp-loading">Materializing...</div>;
  }

  if (viewerError.value) {
    return (
      <div class="vamp-loading vamp-loading--error">
        {viewerError.value}
      </div>
    );
  }

  if (!viewerReady.value) {
    return <div class="vamp-loading">Materializing...</div>;
  }

  return <CharacterSheet />;
}
