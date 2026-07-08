import { useSignal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { stState, setStInitiative } from '../../../state/stState';
import { coterieState } from '../../../state/coterie';
import { stSetMemberInitiative } from '../../../state/stHaven';
import {
  addOpponent, renameOpponent, setOpponentTpr, removeOpponent, setTurnPosition,
  nextTurn, prevTurn, mergeLadder,
  type PcLadderInput, type LadderRow,
} from '../../../state/stInitiativeLogic';
import type { StRosterEntry } from '../../../state/stRosterLogic';

type PcRowT = Extract<LadderRow, { kind: 'pc' }>;
type NpcRowT = Extract<LadderRow, { kind: 'npc' }>;

/* PC row: Initiative is table-owned; the ST edits it here and the player's SceneTools edits the
   same value from their sheet. Both sides update live via the Coterie snapshot. The left edge
   bar takes the player's custom-theme accent (neutral fallback when they have none). */
function PcRow({ row, current }: { row: PcRowT; current: boolean }) {
  const draft = useSignal(row.initiative == null ? '' : String(row.initiative));
  const editing = useRef(false);
  if (!editing.current) draft.value = row.initiative == null ? '' : String(row.initiative);

  function commit() {
    const t = draft.value.trim();
    const n = t === '' ? null : Math.trunc(Number(t));
    void stSetMemberInitiative(row.characterId, n !== null && Number.isFinite(n) ? n : null);
    editing.current = false;
  }

  const edge = row.accent ?? 'var(--v-border-accent)';
  return (
    <div
      class={`vamp-st-init__row vamp-st-init__row--pc ${current ? 'is-current' : ''}`}
      style={{ '--row-color': edge } as Record<string, string>}
      data-ladder-row
    >
      <span class="vamp-st-init__kind" title="Player character" aria-hidden="true">◆</span>
      <span class="vamp-st-init__name vamp-st-init__name--pc" title={row.name}>{row.name || 'Unnamed'}</span>
      <input
        class="vamp-input vamp-st-init__val" type="number" inputMode="numeric" value={draft.value}
        aria-label={`${row.name || 'Player'} initiative`}
        onFocus={() => { editing.current = true; }}
        onInput={(e) => { editing.current = true; draft.value = (e.target as HTMLInputElement).value; }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      />
    </div>
  );
}

/* One turn entry of an ST opponent. Every row of an opponent carries the same shared controls
   (rename, TPR, remove), so any row edits the whole opponent live. The colored edge bar + badge
   keep same-color rows recognizable; the grip starts a pointer drag handled by the parent. */
function NpcRow({ row, current, dragging, pcCount, onGripDown }: {
  row: NpcRowT; current: boolean; dragging: boolean; pcCount: number; onGripDown: (e: PointerEvent, turnId: string) => void;
}) {
  const confirmDel = useSignal(false);
  const init = () => stState.value.initiative;

  return (
    <div
      class={`vamp-st-init__row vamp-st-init__row--npc ${current ? 'is-current' : ''} ${dragging ? 'is-dragging' : ''}`}
      style={{ '--row-color': row.color } as Record<string, string>}
      data-ladder-row
    >
      <span
        class="vamp-st-init__grip" title="Drag to reorder this turn" aria-label="Drag to reorder"
        onPointerDown={(e) => onGripDown(e, row.turnId)}
      >⠿</span>
      <input
        class="vamp-input vamp-st-init__name" value={row.baseName} placeholder="Opponent" title={row.name}
        onInput={(e) => setStInitiative(renameOpponent(init(), row.opponentId, (e.target as HTMLInputElement).value))}
      />
      {row.badge && <span class="vamp-st-init__seq" aria-hidden="true">{row.badge}</span>}
      <span class="vamp-st-init__tpr" title="Turns Per Round: how many turns this opponent gets">
        <button class="vamp-st-init__step" aria-label="Fewer turns per round" onClick={() => setStInitiative(setOpponentTpr(init(), row.opponentId, row.tpr - 1, pcCount))}>−</button>
        <span class="vamp-st-init__tpr-badge">TPR {row.tpr}</span>
        <button class="vamp-st-init__step" aria-label="More turns per round" onClick={() => setStInitiative(setOpponentTpr(init(), row.opponentId, row.tpr + 1, pcCount))}>+</button>
      </span>
      <button
        class={`vamp-st-btn vamp-st-btn--del ${confirmDel.value ? 'is-danger' : ''}`}
        onMouseLeave={() => { confirmDel.value = false; }}
        onClick={() => { confirmDel.value ? setStInitiative(removeOpponent(init(), row.opponentId)) : (confirmDel.value = true); }}
        aria-label={`Remove ${row.baseName || 'opponent'}`}
      >{confirmDel.value ? '?' : '×'}</button>
    </div>
  );
}

function AddForm({ pcCount }: { pcCount: number }) {
  const name = useSignal('');
  const tpr = useSignal('1');

  function commit() {
    if (!name.value.trim()) return;
    setStInitiative(addOpponent(stState.value.initiative, name.value, Math.trunc(Number(tpr.value)) || 1, pcCount));
    name.value = '';
    tpr.value = '1';
  }

  return (
    <div class="vamp-st-init__add">
      <input
        class="vamp-input vamp-st-init__name" placeholder="Add opponent…" value={name.value}
        onInput={(e) => { name.value = (e.target as HTMLInputElement).value; }}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      />
      <input
        class="vamp-input vamp-st-init__tpr-input" type="number" inputMode="numeric" min={1} value={tpr.value}
        aria-label="Turns per round" title="Turns Per Round"
        onInput={(e) => { tpr.value = (e.target as HTMLInputElement).value; }}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      />
      {/* TPR will later auto-populate from Compendium stat blocks. */}
      <button class="vamp-st-btn vamp-st-btn--primary" disabled={!name.value.trim()} onClick={commit}>Add</button>
    </div>
  );
}

export function InitiativeTile({ roster }: { roster: StRosterEntry[] }) {
  const st = stState.value.initiative;
  const members = coterieState.value.members;
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragTurnId = useSignal<string | null>(null);
  /* Insert index (0..count) in the merged list where a drop would land; -1 when not dragging. */
  const dropIndex = useSignal(-1);

  /* PC rows: one per consented member, Initiative + accent pulled from their published data. */
  const pcs: PcLadderInput[] = roster
    .filter(r => r.consented)
    .map(r => ({
      characterId: r.characterId,
      name: r.name,
      initiative: members.find(m => m.characterId === r.characterId)?.initiative ?? null,
      portraitUrl: r.portraitUrl,
      accent: r.themeAccent,
    }));

  const merged = mergeLadder(pcs, st);
  const count = merged.length;
  const turn = count ? Math.min(st.turn, count - 1) : 0;
  const currentName = count ? (merged[turn].name || 'Unnamed') : '—';

  /* Pointer-drag a turn entry: track the pointer, compute the insert index from row midpoints,
     preview it with a drop line, and commit on release. The whole ladder is a drop zone (the old
     HTML5 drag only accepted drops onto other NPC rows, so most positions were dead). */
  function onGripDown(e: PointerEvent, turnId: string) {
    const list = listRef.current;
    if (!list || dragTurnId.value != null) return; // ignore re-entrant grabs mid-drag
    e.preventDefault();
    dragTurnId.value = turnId;
    const from = merged.findIndex(r => r.kind === 'npc' && r.turnId === turnId);
    dropIndex.value = from;

    const compute = (clientY: number) => {
      const els = Array.from(list.querySelectorAll<HTMLElement>('[data-ladder-row]'));
      let idx = els.length;
      for (let i = 0; i < els.length; i++) {
        const rect = els[i].getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) { idx = i; break; }
      }
      dropIndex.value = idx;
    };

    const move = (ev: PointerEvent) => compute(ev.clientY);
    const teardown = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      dragTurnId.value = null;
      dropIndex.value = -1;
    };
    const up = () => {
      const to = dropIndex.value;
      teardown();
      if (to < 0 || from < 0) return;
      /* Insert before the drop target; removing the dragged row shifts a later target down one. */
      const insertIndex = from < to ? to - 1 : to;
      setStInitiative(setTurnPosition(stState.value.initiative, pcs, turnId, insertIndex));
    };
    /* pointercancel (touch gesture stolen, focus loss, right-click) aborts without committing;
       teardown still runs so listeners never leak into the next drag. */
    const cancel = () => teardown();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  const dragging = dragTurnId.value;
  const showLineAt = (i: number) => dragging != null && dropIndex.value === i;

  return (
    <div class="vamp-st-init">
      <div class="vamp-st-init__controls">
        <button class="vamp-st-btn" disabled={!count} onClick={() => setStInitiative(prevTurn(st, count))} aria-label="Previous turn">‹ Prev</button>
        <div class="vamp-st-init__status">
          <span class="vamp-st-init__round">Round {st.round}</span>
          <span class="vamp-st-init__turn" title="Whose turn it is">{currentName}</span>
        </div>
        <button class="vamp-st-btn vamp-st-btn--primary" disabled={!count} onClick={() => setStInitiative(nextTurn(st, count))} aria-label="Next turn">Next ›</button>
      </div>

      <div class={`vamp-st-init__list ${dragging != null ? 'is-dragging-active' : ''}`} ref={listRef}>
        {count ? merged.flatMap((r, i) => {
          const nodes = [];
          if (showLineAt(i)) nodes.push(<div key={`line:${i}`} class="vamp-st-init__dropline" aria-hidden="true" />);
          nodes.push(r.kind === 'pc'
            ? <PcRow key={r.key} row={r} current={i === turn} />
            : <NpcRow key={r.key} row={r} current={i === turn} dragging={dragging === r.turnId} pcCount={pcs.length} onGripDown={onGripDown} />);
          if (i === count - 1 && showLineAt(count)) nodes.push(<div key="line:tail" class="vamp-st-init__dropline" aria-hidden="true" />);
          return nodes;
        }) : (
          <p class="vamp-st-tile__empty">No combatants yet. Consented players appear automatically; add opponents below.</p>
        )}
      </div>

      <AddForm pcCount={pcs.length} />
    </div>
  );
}
