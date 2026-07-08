import { useSignal } from '@preact/signals';
import { useRef, useEffect } from 'preact/hooks';
import { stState, updateStNote, removeStNote } from '../../../state/stState';
import { renderUserMarkdown } from '../../../data/transforms';
import { debounce } from '../../../utils/debounce';

// All rendered markdown is ST-authored note content (trusted, same XSS boundary as player Notes)

/* One ST Note, rendered as markdown; double-click swaps to a debounced editor (mirrors the
   player Notebook's maximized note). Escape reverts to the last saved text. */
export function StNotesTile({ noteId }: { noteId: string }) {
  const note = stState.value.notes.find(n => n.id === noteId);
  const editing = useSignal(false);
  const confirmDel = useSignal(false);
  const draft = useSignal(note?.text ?? '');
  const saved = useRef(note?.text ?? '');

  const save = useRef(
    debounce((text: string) => { saved.current = text; updateStNote(noteId, text); }, 3000)
  ).current;
  useEffect(() => () => save.flush(), []);

  if (!note) return <p class="vamp-st-tile__empty">This note was deleted.</p>;

  /* Resync from the store while viewing (external change / Coterie switch), matching the
     player Notebook's in-render resync so a stale draft can't overwrite fresh text. */
  if (!editing.value) { draft.value = note.text; saved.current = note.text; }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') { save.cancel(); draft.value = saved.current; editing.value = false; }
  }

  if (editing.value) {
    return (
      <div class="vamp-st-notes__edit">
        <textarea
          class="vamp-st-notes__area"
          value={draft.value}
          ref={(el) => el?.focus()}
          placeholder="Write your note — Markdown supported. The first heading names the tile."
          onInput={(e) => { const t = (e.target as HTMLTextAreaElement).value; draft.value = t; save(t); }}
          onBlur={() => { save.flush(); editing.value = false; }}
          onKeyDown={handleKeyDown}
          spellcheck
        />
        {/* mousedown-preventDefault keeps textarea focus so onBlur can't exit edit mid-confirm. */}
        <button
          class={`vamp-st-notes__trash ${confirmDel.value ? 'is-danger' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onMouseLeave={() => { confirmDel.value = false; }}
          onClick={() => { confirmDel.value ? removeStNote(noteId) : (confirmDel.value = true); }}
          aria-label={confirmDel.value ? 'Confirm delete note' : 'Delete note'}
          title={confirmDel.value ? 'Click again to permanently delete this note' : 'Delete note'}
        >
          {confirmDel.value ? 'Delete note?' : (
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path fill="currentColor" d="M6 1h4l1 1h3v2H2V2h3l1-1zM3 5h10l-.8 9.2A1 1 0 0 1 11.2 15H4.8a1 1 0 0 1-1-.8L3 5z" />
            </svg>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      class="vamp-st-notes__rendered"
      onDblClick={() => { editing.value = true; }}
      title="Double-click to edit"
      dangerouslySetInnerHTML={{ __html: renderUserMarkdown(note.text || '*Empty note. Double-click to write.*') }}
    />
  );
}
