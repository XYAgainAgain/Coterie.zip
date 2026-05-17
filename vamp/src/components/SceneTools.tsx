import { signal, useSignal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { newNight, newSession } from '../state/character';

export const staked = signal(false);

export function SceneTools() {
  const initiative = useSignal<string>('');
  const combatNotes = useSignal<string>('');
  const editingInit = useSignal(false);
  const editingNotes = useSignal(false);
  const initRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  function handleStaked() {
    staked.value = !staked.value;
    document.body.classList.toggle('vamp-staked', staked.value);
  }

  function handleInitDoubleClick() {
    editingInit.value = true;
    requestAnimationFrame(() => initRef.current?.focus());
  }

  function commitInit() {
    editingInit.value = false;
    initiative.value = (initRef.current?.value ?? '').replace(/\D/g, '').slice(0, 2);
  }

  function handleNotesDoubleClick() {
    editingNotes.value = true;
    requestAnimationFrame(() => notesRef.current?.focus());
  }

  function commitNotes() {
    editingNotes.value = false;
    combatNotes.value = notesRef.current?.value ?? '';
  }

  return (
    <div class="vamp-scene-tools">
      <div class="vamp-scene-init">
        <span class="vamp-scene-init__label">Initiative</span>
        {editingInit.value ? (
          <input
            ref={initRef}
            class="vamp-scene-init__input"
            type="text"
            maxLength={2}
            value={initiative.value}
            onBlur={commitInit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitInit();
              if (e.key === 'Escape') { editingInit.value = false; }
            }}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 2);
              (e.target as HTMLInputElement).value = v;
            }}
          />
        ) : (
          <span
            class={`vamp-scene-init__display ${!initiative.value ? 'vamp-scene-init__display--empty' : ''}`}
            onDblClick={handleInitDoubleClick}
            title="Double-click to set initiative"
          >
            {initiative.value || '--'}
          </span>
        )}
        {initiative.value && (
          <button
            class="vamp-scene-init__clear"
            onClick={() => { initiative.value = ''; }}
            aria-label="Clear initiative"
            title="Clear"
          >
            <svg viewBox="0 0 16 16" width="10" height="10">
              <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div class="vamp-scene-divider" />

      <div class="vamp-scene-notes">
        <span class="vamp-scene-notes__label">Combat Notes</span>
        {editingNotes.value ? (
          <textarea
            ref={notesRef}
            class="vamp-scene-notes__input"
            value={combatNotes.value}
            placeholder="Combat notes..."
            onBlur={commitNotes}
            onKeyDown={(e) => { if (e.key === 'Escape') commitNotes(); }}
          />
        ) : (
          <div
            class={`vamp-scene-notes__display ${!combatNotes.value ? 'vamp-scene-notes__display--empty' : ''}`}
            onDblClick={handleNotesDoubleClick}
            title="Double-click to edit"
          >
            {combatNotes.value
              ? combatNotes.value.split('\n').map((line, i) => (
                  <div key={i} class="vamp-scene-notes__line">{line}</div>
                ))
              : 'Double-click to add notes...'
            }
          </div>
        )}
      </div>

      <div class="vamp-scene-divider" />

      <div class="vamp-scene-tools__buttons">
        <button class="vamp-scene-btn" onClick={newSession}>New Session</button>
        <button class="vamp-scene-btn" onClick={newNight}>New Night</button>
        <button
          class={`vamp-scene-btn ${staked.value ? 'vamp-scene-btn--active' : ''}`}
          onClick={handleStaked}
        >
          {staked.value ? 'Unstake' : 'Got Staked'}
        </button>
      </div>
    </div>
  );
}
