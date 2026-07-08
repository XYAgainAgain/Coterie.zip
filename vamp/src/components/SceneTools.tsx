import { signal, useSignal, effect } from '@preact/signals';
import { useRef, useEffect } from 'preact/hooks';
import { character, updateCharacter, newNight, newSession, newScene } from '../state/character';
import { activeCoterie, activeCharacterId, setMyInitiative } from '../state/persistence';
import { coterieState } from '../state/coterie';
import { debounce } from '../utils/debounce';
import { vampConfirm } from '../state/dialog';

export const staked = signal(false);

/* Sync the dim-everything body class to the signal so the button and the S shortcut agree. */
effect(() => { document.body.classList.toggle('vamp-staked', staked.value); });

/* In a Coterie, Initiative is table-owned on the member entry (the ST edits the same value
   from the Initiative ladder); solo characters keep the old local string. */
function inCoterieNow(): boolean {
  const cid = activeCharacterId.value;
  return !!activeCoterie.value && !!cid && coterieState.value.members.some(m => m.characterId === cid);
}

function commitInitiativeValue(val: string): void {
  if (inCoterieNow()) {
    const n = val.trim() === '' ? null : parseInt(val, 10);
    void setMyInitiative(n !== null && Number.isFinite(n) ? n : null);
  } else {
    updateCharacter({ initiative: val });
  }
}

export function SceneTools() {
  const char = character.value;
  /* Coterie members read/write Initiative through their member entry; solo play stays local. */
  const inCoterie = inCoterieNow();
  const myInit = inCoterie
    ? coterieState.value.members.find(m => m.characterId === activeCharacterId.value)?.initiative ?? null
    : null;
  const initStr = inCoterie ? (myInit != null ? String(myInit) : '') : char.initiative;

  const initDraft = useSignal(initStr);
  const notesDraft = useSignal(char.combatNotes);
  const editingInit = useSignal(false);
  const editingNotes = useSignal(false);
  const initRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const initSaved = useRef(initStr);
  const notesSaved = useRef(char.combatNotes);

  const debouncedInit = useRef(
    debounce((val: string) => {
      initSaved.current = val;
      commitInitiativeValue(val);
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
    initDraft.value = initStr;
    initSaved.current = initStr;
  }
  if (!editingNotes.value) {
    notesDraft.value = char.combatNotes;
    notesSaved.current = char.combatNotes;
  }

  function handleStaked() {
    staked.value = !staked.value;
  }

  function startInitEdit() {
    initDraft.value = initStr;
    initSaved.current = initStr;
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
    if (inCoterieNow()) void setMyInitiative(null);
    initDraft.value = '';
    notesDraft.value = '';
  }

  /* Feeding clears all Superficial Harm on waking. */
  async function handleNewNight() {
    const fed = await vampConfirm(
      <>Did you <strong>Feed</strong> at least once tonight?</>,
      { title: 'New Night' },
    );
    newNight(fed);
  }

  function clearInit() {
    debouncedInit.cancel();
    initDraft.value = '';
    commitInitiativeValue('');
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
            class={`vamp-scene-init__display ${!initStr ? 'vamp-scene-init__display--empty' : ''}`}
            onDblClick={startInitEdit}
            title="Double-click to set initiative"
          >
            {initStr || '--'}
          </span>
        )}
        <span class="vamp-scene-init__label">
          Initiative
          {initStr && (
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
        <button class="vamp-scene-btn" onClick={handleNewNight}>New Night</button>
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
