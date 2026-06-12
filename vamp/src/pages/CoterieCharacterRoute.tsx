import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { CharacterSheet } from './CharacterSheet';
import { CharacterViewer } from './CharacterViewer';
import { resolveCoterieCharacter } from '../state/persistence';
import { viewingOtherSheet } from '../state/ui';

/* Canonical Coterie URL: owners get the editable sheet, everyone else the viewer */
export function CoterieCharacterRoute({ coterieCode, charSlug }: {
  coterieCode?: string;
  charSlug?: string;
}) {
  const resolving = useSignal(true);
  const error = useSignal<string | null>(null);
  const ownedCharacterId = useSignal<string | null>(null);
  const viewCharacterId = useSignal<string | null>(null);

  useEffect(() => {
    if (!coterieCode || !charSlug) return;
    /* Guards a slow resolve from applying after navigation to another clean URL */
    let cancelled = false;
    resolving.value = true;
    error.value = null;
    ownedCharacterId.value = null;
    viewCharacterId.value = null;

    resolveCoterieCharacter(coterieCode, charSlug)
      .then(({ characterId, isOwner }) => {
        if (cancelled) return;
        /* Set before the sheet/viewer mounts so their first render sees it */
        viewingOtherSheet.value = !isOwner;
        if (isOwner) ownedCharacterId.value = characterId;
        else viewCharacterId.value = characterId;
      })
      .catch(err => { if (!cancelled) error.value = err instanceof Error ? err.message : String(err); })
      .finally(() => { if (!cancelled) resolving.value = false; });

    return () => { cancelled = true; };
  }, [coterieCode, charSlug]);

  if (resolving.value) {
    return <div class="vamp-loading">Materializing...</div>;
  }
  if (error.value) {
    return <div class="vamp-loading vamp-loading--error">Failed to load character: {error.value}</div>;
  }
  if (ownedCharacterId.value) {
    return <CharacterSheet slug={ownedCharacterId.value} />;
  }
  /* Membership already verified by the resolver; charId skips the duplicate coterie read */
  return <CharacterViewer charId={viewCharacterId.value ?? undefined} />;
}
