import { useSignal } from '@preact/signals';
import { ClockDisplay } from '../../ClockDisplay';
import { clocksForCanvas } from './clockAggregate';
import { stState, setStClocks } from '../../../state/stState';
import type { StRosterEntry } from '../../../state/stRosterLogic';
import type { Clock } from '../../../state/character';

const noop = () => {};

type Step = 'idle' | 'pick-size' | 'details';
type Segments = 4 | 6 | 8;
type Scope = 'st-private' | 'character' | 'coterie';

/* "Start a New Clock" for the ST. Only the ST-private scope builds today; the other two are
   shown disabled ("soon") so the scoping UI shape is already in place (see §12.9 item 6). */
function NewStClock() {
  const step = useSignal<Step>('idle');
  const segments = useSignal<Segments>(4);
  const name = useSignal('');
  const condition = useSignal('');

  function reset() { step.value = 'idle'; name.value = ''; condition.value = ''; segments.value = 4; }

  function create() {
    const trimmed = name.value.trim();
    if (!trimmed) return;
    const clock: Clock = { id: crypto.randomUUID(), name: trimmed, segments: segments.value, filled: 0 };
    if (condition.value.trim()) clock.condition = condition.value.trim();
    setStClocks([...stState.value.clocks, clock]);
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
            <button key={s} class="vamp-clock-new__size-btn" onClick={() => { segments.value = s; step.value = 'details'; }}>{s}</button>
          ))}
        </div>
        <button class="vamp-clock-new__cancel" onClick={reset}>cancel</button>
      </div>
    );
  }

  return (
    <div class="vamp-clock-new vamp-clock-new--active">
      <input
        class="vamp-clock-new__input" type="text" placeholder="Clock name" value={name.value}
        onInput={(e) => { name.value = (e.target as HTMLInputElement).value; }}
        onKeyDown={handleKeyDown} ref={(el) => el?.focus()}
      />
      <input
        class="vamp-clock-new__input vamp-clock-new__input--small" type="text" placeholder="Condition (optional)" value={condition.value}
        onInput={(e) => { condition.value = (e.target as HTMLInputElement).value; }}
        onKeyDown={handleKeyDown}
      />
      <div class="vamp-st-clocks__scopes" role="group" aria-label="Clock scope">
        <button class="vamp-st-btn vamp-st-btn--select" aria-pressed="true" title="Visible only to you">ST Private</button>
        <button class="vamp-st-btn" disabled title="Coming soon">Push to character<span class="vamp-st-clocks__soon">soon</span></button>
        <button class="vamp-st-btn" disabled title="Coming soon">Coterie-wide<span class="vamp-st-clocks__soon">soon</span></button>
      </div>
      <div class="vamp-clock-new__actions">
        <button class="vamp-clock-new__create" onClick={create}>Create</button>
        <button class="vamp-clock-new__cancel" onClick={reset}>cancel</button>
      </div>
    </div>
  );
}

/* Read-only aggregate of every consented member's personal clocks, plus the ST's own private
   clocks (fillable, deletable). The shared Masquerade Clock lives on the rail, not here. */
export function AllClocksTile({ roster }: { roster: StRosterEntry[] }) {
  const { members, totalPersonal } = clocksForCanvas({ roster });
  const stClocks = stState.value.clocks;

  const fill = (id: string) => setStClocks(stClocks.map(c => (c.id === id ? { ...c, filled: Math.min(c.segments, c.filled + 1) } : c)));
  const unfill = (id: string) => setStClocks(stClocks.map(c => (c.id === id ? { ...c, filled: Math.max(0, c.filled - 1) } : c)));
  const remove = (id: string) => setStClocks(stClocks.filter(c => c.id !== id));

  return (
    <div class="vamp-st-clocks">
      <div class="vamp-st-clocks__group">
        <h4 class="vamp-st-clocks__heading">ST Private</h4>
        <div class="vamp-st-clocks__grid">
          {stClocks.map(c => (
            <ClockDisplay key={c.id} clock={c} onFill={() => fill(c.id)} onUnfill={() => unfill(c.id)} onRemove={() => remove(c.id)} />
          ))}
          <NewStClock />
        </div>
      </div>

      {totalPersonal === 0
        ? <p class="vamp-st-tile__empty">No personal clocks among consented members yet.</p>
        : members.map(m => (
            <div class="vamp-st-clocks__group" key={m.name}>
              <h4 class="vamp-st-clocks__heading">{m.name}</h4>
              <div class="vamp-st-clocks__grid">
                {m.clocks.map(c => <ClockDisplay key={c.id} clock={c} onFill={noop} onUnfill={noop} />)}
              </div>
            </div>
          ))}
    </div>
  );
}
