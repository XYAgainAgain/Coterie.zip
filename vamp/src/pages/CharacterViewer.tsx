import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { route } from 'preact-router';
import { CharacterSheet } from './CharacterSheet';
import { character } from '../state/character';
import { loadCharacterForViewing, loadCharacterPublic, activeCharacterId, loadCoterie } from '../state/persistence';
import { viewingOtherSheet } from '../state/ui';

const viewerLoading = signal(false);
const viewerError = signal<string | null>(null);
const viewerReady = signal(false);

export function CharacterViewer({ coterieCode, charSlug, charId }: {
  coterieCode?: string;
  charSlug?: string;
  charId?: string;
}) {
  useEffect(() => {
    const isCoteriePath = coterieCode && charSlug;
    const isDirectPath = charId;
    if (!isCoteriePath && !isDirectPath) return;
    /* A slow load landing after navigation away would hijack the shared character signal */
    let cancelled = false;

    viewerLoading.value = true;
    viewerError.value = null;
    viewerReady.value = false;

    const load = isCoteriePath
      ? loadCharacterForViewing(coterieCode!, charSlug!)
          .then(({ state, coterieId, isOwner }) => ({ state, coterieId, isOwner }))
      : loadCharacterPublic(charId!)
          .then(({ state, coterieId, isOwner }) => ({ state, coterieId, isOwner }));

    load
      .then(async ({ state, coterieId, isOwner }) => {
        if (cancelled) return;
        if (isOwner) {
          const ownId = charId ?? activeCharacterId.value;
          if (ownId) { route(`/vamp/${ownId}`, true); return; }
        }

        /* Autosave keys on activeCharacterId: clear it or the viewed state saves into our own doc */
        activeCharacterId.value = null;
        /* Flip viewing on only with the target character already in the signal, so the
           theme effect never applies the previous (own) character's palette mid-load. */
        character.value = state;
        viewingOtherSheet.value = true;

        if (coterieId) await loadCoterie(coterieId);

        viewerReady.value = true;
      })
      .catch(err => {
        if (!cancelled) viewerError.value = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        if (!cancelled) viewerLoading.value = false;
      });

    return () => { cancelled = true; viewingOtherSheet.value = false; };
  }, [coterieCode, charSlug, charId]);

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
