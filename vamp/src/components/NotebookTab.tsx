import { useSignal } from '@preact/signals';
import { useRef, useEffect } from 'preact/hooks';
import {
  character, addNote, removeNote, updateNote, reorderNotes,
} from '../state/character';
import type { Note } from '../state/character';
import { renderUserMarkdown } from '../data/transforms';
import { debounce } from '../utils/debounce';

// All rendered markdown comes from user-authored note content (trusted, not external)

function NoteCard({ note, index, onMaximize }: {
  note: Note;
  index: number;
  onMaximize: (id: string, edit: boolean) => void;
}) {
  const confirming = useSignal(false);
  const dragOver = useSignal(false);
  const clickTimer = useSignal<ReturnType<typeof setTimeout> | null>(null);

  function handleDelete(e: Event) {
    e.stopPropagation();
    if (confirming.value) {
      removeNote(note.id);
    } else {
      confirming.value = true;
    }
  }

  function handleClick() {
    if (clickTimer.value) clearTimeout(clickTimer.value);
    clickTimer.value = setTimeout(() => {
      onMaximize(note.id, false);
      clickTimer.value = null;
    }, 250);
  }

  function handleDblClick() {
    if (clickTimer.value) {
      clearTimeout(clickTimer.value);
      clickTimer.value = null;
    }
    onMaximize(note.id, true);
  }

  function handleDragStart(e: DragEvent) {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', String(index));
    (e.currentTarget as HTMLElement).classList.add('vamp-note--dragging');
  }

  function handleDragEnd(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('vamp-note--dragging');
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    dragOver.value = true;
  }

  function handleDragLeave() {
    dragOver.value = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver.value = false;
    const fromIndex = parseInt(e.dataTransfer!.getData('text/plain'), 10);
    if (!isNaN(fromIndex) && fromIndex !== index) {
      reorderNotes(fromIndex, index);
    }
  }

  return (
    <div
      class={`vamp-note ${dragOver.value ? 'vamp-note--drag-over' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onDblClick={handleDblClick}
    >
      <div class="vamp-note__header">
        <span class="vamp-note__title">{note.title || 'Untitled'}</span>
        <button
          class={`vamp-note__delete ${confirming.value ? 'vamp-note__delete--confirming' : ''}`}
          onClick={handleDelete}
          onMouseLeave={() => { confirming.value = false; }}
          title={confirming.value ? 'Click again to delete' : 'Delete note'}
        >
          {confirming.value ? '?' : (
            <svg viewBox="0 0 16 16" width="10" height="10">
              <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
              <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            </svg>
          )}
        </button>
      </div>
      <div class="vamp-note__preview">
        {note.body
          ? <div dangerouslySetInnerHTML={{ __html: renderUserMarkdown(note.body) }} />
          : <span class="vamp-note__empty">Empty note</span>
        }
      </div>
    </div>
  );
}

function MaximizedNote({ note, editing, onClose }: {
  note: Note;
  editing: boolean;
  onClose: () => void;
}) {
  const isEditing = useSignal(editing);
  const titleDraft = useSignal(note.title);
  const bodyDraft = useSignal(note.body);
  const savedTitle = useRef(note.title);
  const savedBody = useRef(note.body);

  const debouncedSave = useRef(
    debounce((title: string, body: string) => {
      savedTitle.current = title;
      savedBody.current = body;
      updateNote(note.id, { title, body });
    }, 3000)
  ).current;

  useEffect(() => () => debouncedSave.flush(), []);

  if (!isEditing.value) {
    titleDraft.value = note.title;
    bodyDraft.value = note.body;
    savedTitle.current = note.title;
    savedBody.current = note.body;
  }

  function handleClose() {
    debouncedSave.flush();
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (isEditing.value) {
        debouncedSave.cancel();
        titleDraft.value = savedTitle.current;
        bodyDraft.value = savedBody.current;
        isEditing.value = false;
      } else {
        handleClose();
      }
    }
  }

  return (
    <div class="vamp-note-max" onKeyDown={handleKeyDown}>
      <div class="vamp-note-max__header">
        {isEditing.value ? (
          <input
            class="vamp-note-max__title-input"
            type="text"
            value={titleDraft.value}
            onInput={(e) => {
              titleDraft.value = (e.target as HTMLInputElement).value;
              debouncedSave(titleDraft.value, bodyDraft.value);
            }}
            placeholder="Note title"
          />
        ) : (
          <span
            class="vamp-note-max__title"
            onDblClick={() => { isEditing.value = true; }}
            title="Double-click to edit"
          >
            {note.title || 'Untitled'}
          </span>
        )}
        <div class="vamp-note-max__actions">
          <button class="vamp-note-max__close" onClick={handleClose}>
            <svg viewBox="0 0 16 16" width="14" height="14">
              <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
              <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div class="vamp-note-max__body">
        {isEditing.value ? (
          <textarea
            class="vamp-note-max__editor"
            value={bodyDraft.value}
            onInput={(e) => {
              bodyDraft.value = (e.target as HTMLTextAreaElement).value;
              debouncedSave(titleDraft.value, bodyDraft.value);
            }}
            placeholder="Write your note here... (Markdown supported)"
          />
        ) : (
          <div
            class="vamp-note-max__rendered"
            onDblClick={() => { isEditing.value = true; }}
            title="Double-click to edit"
            dangerouslySetInnerHTML={{ __html: renderUserMarkdown(note.body || '*Empty note*') }}
          />
        )}
      </div>
    </div>
  );
}

function NewNoteWidget({ onCreate }: { onCreate: () => void }) {
  const active = useSignal(false);
  const title = useSignal('');

  function handleCreate() {
    addNote(title.value.trim() || 'Untitled', '');
    title.value = '';
    active.value = false;
    onCreate();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleCreate();
    if (e.key === 'Escape') { active.value = false; title.value = ''; }
  }

  if (!active.value) {
    return (
      <div class="vamp-note-new" onClick={() => { active.value = true; }}>
        <span class="vamp-note-new__label">Write a{'\n'}New Note</span>
      </div>
    );
  }

  return (
    <div class="vamp-note-new vamp-note-new--active" onKeyDown={handleKeyDown}>
      <input
        class="vamp-note-new__input"
        type="text"
        value={title.value}
        onInput={(e) => { title.value = (e.target as HTMLInputElement).value; }}
        placeholder="Note title"
        ref={(el) => el?.focus()}
      />
      <div class="vamp-note-new__actions">
        <button onClick={() => { active.value = false; title.value = ''; }}>Cancel</button>
        <button class="vamp-note-new__create" onClick={handleCreate}>Create</button>
      </div>
    </div>
  );
}

export function NotebookTab() {
  const notes = character.value.notes;
  const maximizedId = useSignal<string | null>(null);
  const editOnOpen = useSignal(false);

  const maximizedNote = maximizedId.value
    ? notes.find(n => n.id === maximizedId.value) ?? null
    : null;

  if (maximizedNote) {
    return (
      <MaximizedNote
        key={maximizedNote.id}
        note={maximizedNote}
        editing={editOnOpen.value}
        onClose={() => { maximizedId.value = null; }}
      />
    );
  }

  return (
    <div class="vamp-notebook">
      <div class="vamp-notebook__grid">
        {notes.map((note, i) => (
          <NoteCard
            key={note.id}
            note={note}
            index={i}
            onMaximize={(id, edit) => {
              maximizedId.value = id;
              editOnOpen.value = edit;
            }}
          />
        ))}
        <NewNoteWidget onCreate={() => {
          const latest = character.value.notes[character.value.notes.length - 1];
          if (latest) {
            maximizedId.value = latest.id;
            editOnOpen.value = true;
          }
        }} />
      </div>
    </div>
  );
}
