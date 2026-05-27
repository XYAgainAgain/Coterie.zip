import { signal, useSignal } from '@preact/signals';
import { useRef, useEffect } from 'preact/hooks';
import { character, updateCharacter, newNight, newSession, newScene } from '../state/character';
import { debounce } from '../utils/debounce';

export const staked = signal(false);

export function SceneTools() {
  const char = character.value;
  const initDraft = useSignal(char.initiative);
  const notesDraft = useSignal(char.combatNotes);
  const editingInit = useSignal(false);
  const editingNotes = useSignal(false);
  const initRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const initSaved = useRef(char.initiative);
  const notesSaved = useRef(char.combatNotes);

  const debouncedInit = useRef(
    debounce((val: string) => {
      initSaved.current = val;
      updateCharacter({ initiative: val });
    }, 3000)
  ).current;

  const debouncedNotes = useRef(
    debounce((val: string) => {
      notesSaved.current = val;
      updateCharacter({ combatNotes: val });
    }, 3000)
  ).current;

  useEffect(() => () => { debouncedInit.cancel(); debouncedNotes.cancel(); }, []);

  if (!editingInit.value) {
    initDraft.value = char.initiative;
    initSaved.current = char.initiative;
  }
  if (!editingNotes.value) {
    notesDraft.value = char.combatNotes;
    notesSaved.current = char.combatNotes;
  }

  function handleStaked() {
    staked.value = !staked.value;
    document.body.classList.toggle('vamp-staked', staked.value);
  }

  function startInitEdit() {
    initDraft.value = char.initiative;
    initSaved.current = char.initiative;
    editingInit.value = true;
    requestAnimationFrame(() => initRef.current?.focus());
  }

  function commitInit() {
    debouncedInit.flush();
    editingInit.value = false;
  }

  function cancelInit() {
    debouncedInit.cancel();
    initDraft.value = initSaved.current;
    editingInit.value = false;
  }

  function startNotesEdit() {
    notesDraft.value = char.combatNotes;
    notesSaved.current = char.combatNotes;
    editingNotes.value = true;
    requestAnimationFrame(() => notesRef.current?.focus());
  }

  function commitNotes() {
    debouncedNotes.flush();
    editingNotes.value = false;
  }

  function cancelNotes() {
    debouncedNotes.cancel();
    notesDraft.value = notesSaved.current;
    editingNotes.value = false;
  }

  function handleNewScene() {
    newScene();
    initDraft.value = '';
    notesDraft.value = '';
  }

  function clearInit() {
    debouncedInit.cancel();
    initDraft.value = '';
    updateCharacter({ initiative: '' });
  }

  return (
    <div class="vamp-scene-tools">
      <div class="vamp-scene-init">
        {editingInit.value ? (
          <input
            ref={initRef}
            class="vamp-scene-init__input"
            type="text"
            maxLength={2}
            value={initDraft.value}
            onBlur={commitInit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitInit();
              if (e.key === 'Escape') cancelInit();
            }}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 2);
              (e.target as HTMLInputElement).value = v;
              initDraft.value = v;
              debouncedInit(v);
            }}
          />
        ) : (
          <span
            class={`vamp-scene-init__display ${!char.initiative ? 'vamp-scene-init__display--empty' : ''}`}
            onDblClick={startInitEdit}
            title="Double-click to set initiative"
          >
            {char.initiative || '--'}
          </span>
        )}
        <span class="vamp-scene-init__label">
          Initiative
          {char.initiative && (
            <button
              class="vamp-scene-init__clear"
              onClick={clearInit}
              aria-label="Clear initiative"
              title="Clear"
            >
              <svg viewBox="0 0 16 16" width="8" height="8">
                <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
              </svg>
            </button>
          )}
        </span>
      </div>

      <div class="vamp-scene-divider" />

      <div class="vamp-scene-notes">
        {editingNotes.value ? (
          <textarea
            ref={notesRef}
            class="vamp-scene-notes__input"
            value={notesDraft.value}
            placeholder="Combat notes..."
            onInput={(e) => {
              const text = (e.target as HTMLTextAreaElement).value;
              notesDraft.value = text;
              debouncedNotes(text);
            }}
            onBlur={commitNotes}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelNotes();
            }}
          />
        ) : (
          <div
            class={`vamp-scene-notes__display ${!char.combatNotes ? 'vamp-scene-notes__display--empty' : ''}`}
            onDblClick={startNotesEdit}
            title="Double-click to edit"
          >
            {char.combatNotes
              ? char.combatNotes.split('\n').map((line, i) => (
                  <div key={i} class="vamp-scene-notes__line">{line}</div>
                ))
              : 'Double-click to add notes...'
            }
          </div>
        )}
        <span class="vamp-scene-notes__label">Combat Notes</span>
      </div>

      <div class="vamp-scene-divider" />

      <div class="vamp-scene-tools__buttons">
        <button class="vamp-scene-btn" onClick={newSession}>New Session</button>
        <button class="vamp-scene-btn" onClick={newNight}>New Night</button>
        <button class="vamp-scene-btn" onClick={handleNewScene}>New Scene</button>
      </div>

      <button
        class={`vamp-stake-btn ${staked.value ? 'vamp-stake-btn--active' : ''}`}
        onClick={handleStaked}
        aria-label={staked.value ? 'Remove stake' : 'Stake character'}
        title={staked.value ? 'Click to unstake' : 'Click to stake your character'}
      >
        {'STAKED'.split('').map((ch, i) => (
          <span key={i} class="vamp-stake-btn__letter">{ch}</span>
        ))}
      </button>
    </div>
  );
}
