import { useSignal } from '@preact/signals';
import { addClock } from '../state/character';

type Step = 'idle' | 'pick-size' | 'details';
type Segments = 4 | 6 | 8;

export function NewClockWidget() {
  const step = useSignal<Step>('idle');
  const segments = useSignal<Segments>(4);
  const name = useSignal('');
  const condition = useSignal('');

  function reset() {
    step.value = 'idle';
    name.value = '';
    condition.value = '';
  }

  function pickSize(s: Segments) {
    segments.value = s;
    step.value = 'details';
  }

  function create() {
    const trimmed = name.value.trim();
    if (!trimmed) return;
    addClock(trimmed, segments.value, condition.value.trim() || undefined);
    reset();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') create();
    if (e.key === 'Escape') reset();
  }

  if (step.value === 'idle') {
    return (
      <button class="vamp-clock-new" onClick={() => { step.value = 'pick-size'; }}>
        <span class="vamp-clock-new__plus">+</span>
        <span class="vamp-clock-new__label">Start a<br />New Clock</span>
      </button>
    );
  }

  if (step.value === 'pick-size') {
    return (
      <div class="vamp-clock-new vamp-clock-new--active">
        <span class="vamp-clock-new__prompt">Segments</span>
        <div class="vamp-clock-new__sizes">
          {([4, 6, 8] as Segments[]).map(s => (
            <button
              key={s}
              class="vamp-clock-new__size-btn"
              onClick={() => pickSize(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <button class="vamp-clock-new__cancel" onClick={reset}>cancel</button>
      </div>
    );
  }

  return (
    <div class="vamp-clock-new vamp-clock-new--active">
      <input
        class="vamp-clock-new__input"
        type="text"
        placeholder="Clock name"
        value={name.value}
        onInput={(e) => { name.value = (e.target as HTMLInputElement).value; }}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      <input
        class="vamp-clock-new__input vamp-clock-new__input--small"
        type="text"
        placeholder="Condition (optional)"
        value={condition.value}
        onInput={(e) => { condition.value = (e.target as HTMLInputElement).value; }}
        onKeyDown={handleKeyDown}
      />
      <div class="vamp-clock-new__actions">
        <button class="vamp-clock-new__create" onClick={create}>Create</button>
        <button class="vamp-clock-new__cancel" onClick={reset}>cancel</button>
      </div>
    </div>
  );
}
