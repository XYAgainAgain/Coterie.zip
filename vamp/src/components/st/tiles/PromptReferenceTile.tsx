import { signal, useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

interface StMoveCategory {
  category: string;
  soft: string[];
  hard: string[];
}
interface StPrompts {
  discernVibes: string[];
  catchTheScent: string[];
  stMoves: StMoveCategory[];
}

/* Module-scoped so the fetch runs once per session even as the tile mounts/unmounts on
   drag; the promise is shared, the result cached. */
const prompts = signal<StPrompts | null>(null);
const loadError = signal(false);
let inFlight: Promise<void> | null = null;

function loadPrompts(): Promise<void> {
  if (prompts.value || inFlight) return inFlight ?? Promise.resolve();
  inFlight = fetch(`${import.meta.env.BASE_URL}data/st-prompts.json`)
    .then(r => { if (!r.ok) throw new Error(`st-prompts ${r.status}`); return r.json(); })
    .then(json => { prompts.value = json.data as StPrompts; })
    .catch(err => { console.warn('[ST] prompt reference load failed:', err); loadError.value = true; })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/* The Move lists bold Game Terms in corebook markdown; strip the emphasis for a compact
   plain-text reference (asterisks and backticks only). */
function plain(s: string): string {
  return s.replace(/\*\*\*|\*\*|\*|`/g, '');
}

function QuestionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div class="vamp-st-prompt__block">
      <h4 class="vamp-st-prompt__heading">{title}</h4>
      <ul class="vamp-st-prompt__questions">
        {items.map((q, i) => <li key={i}>{plain(q)}</li>)}
      </ul>
    </div>
  );
}

function MoveGroup({ cat }: { cat: StMoveCategory }) {
  const open = useSignal(false);
  return (
    <div class={`vamp-st-move ${open.value ? 'is-open' : ''}`}>
      <button
        class="vamp-st-move__head"
        aria-expanded={open.value}
        onClick={() => { open.value = !open.value; }}
      >
        <svg viewBox="0 0 12 12" width="11" height="11" class={`vamp-st-move__chev ${open.value ? 'is-open' : ''}`}>
          <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="vamp-st-move__name">{cat.category}</span>
      </button>
      {open.value && (
        <div class="vamp-st-move__body">
          <div class="vamp-st-move__tier">
            <span class="vamp-st-move__tier-label vamp-st-move__tier-label--soft">Soft</span>
            <ul>{cat.soft.map((m, i) => <li key={i}>{plain(m)}</li>)}</ul>
          </div>
          <div class="vamp-st-move__tier">
            <span class="vamp-st-move__tier-label vamp-st-move__tier-label--hard">Hard</span>
            <ul>{cat.hard.map((m, i) => <li key={i}>{plain(m)}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function PromptReferenceTile() {
  useEffect(() => { void loadPrompts(); }, []);
  const data = prompts.value;

  if (loadError.value) return <p class="vamp-st-tile__empty">Couldn't load the prompt reference.</p>;
  if (!data) return <p class="vamp-st-tile__empty">Consulting the Storyteller's notes…</p>;

  return (
    <div class="vamp-st-prompt">
      <QuestionList title="Discern Vibes" items={data.discernVibes} />
      <QuestionList title="Catch the Scent" items={data.catchTheScent} />
      <div class="vamp-st-prompt__block">
        <h4 class="vamp-st-prompt__heading">Storyteller Moves</h4>
        <div class="vamp-st-prompt__moves">
          {data.stMoves.map(c => <MoveGroup key={c.category} cat={c} />)}
        </div>
      </div>
    </div>
  );
}
