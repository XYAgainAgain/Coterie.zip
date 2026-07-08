import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { stState, stDocExisted, setStLayout, seedStDefaults, addStNote, closeNoteTile, reopenNoteTile, setStRollMode } from '../../state/stState';
import { noteTitle, tilelessNotes, type StTile, type StRollMode } from '../../state/stStateLogic';
import {
  GRID_COLS, GRID_COLS_NARROW,
  reflowLayout, moveTile, resizeTile, addTile, removeTile, toggleMinimize,
  fitsAt, layoutRows, addableTypes, tileMeta, tileType, clampColSpan, clampRowSpan,
  type StTileType,
} from '../../state/stCanvasLogic';
import type { StRosterEntry } from '../../state/stRosterLogic';
import { PromptReferenceTile } from './tiles/PromptReferenceTile';
import { StNotesTile } from './tiles/StNotesTile';
import { HavenTile } from './tiles/HavenTile';
import { AllClocksTile } from './tiles/AllClocksTile';
import { InitiativeTile } from './tiles/InitiativeTile';
import { DebtTrackerTile } from './tiles/DebtTrackerTile';
import { RollLogTile } from './tiles/RollLogTile';
import { QuickRefTile } from './tiles/QuickRefTile';

/* The note id embedded in a `notes:{id}` tile id. */
function noteIdOf(tileId: string): string {
  return tileId.slice(tileId.indexOf(':') + 1);
}

/* Below this canvas width the grid drops from 12 to 8 columns (the §12.8 tablet reflow).
   Measured on the canvas element, not the viewport, so the fixed rail is already netted out. */
const WIDE_MIN_PX = 960;
/* Row unit (rem). Halved from the original 9rem for finer vertical placement freedom. */
const ROW_UNIT_REM = 4.5;
/* Empty rows kept below the lowest tile so there's always somewhere to drag into. */
const DROP_HEADROOM = 6;

function remPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function TileBody({ id, roster }: { id: string; roster: StRosterEntry[] }) {
  switch (tileType(id)) {
    case 'prompts': return <PromptReferenceTile />;
    case 'notes': return <StNotesTile noteId={noteIdOf(id)} />;
    case 'haven': return <HavenTile roster={roster} />;
    case 'clocks': return <AllClocksTile roster={roster} />;
    case 'initiative': return <InitiativeTile roster={roster} />;
    case 'debts': return <DebtTrackerTile roster={roster} />;
    case 'rolllog': return <RollLogTile />;
    case 'quickref': return <QuickRefTile />;
    default: return null;
  }
}

function CanvasTile({ tile, cols, stored, roster, resizing, onResizeStart, onResizeEnd, onResize, onCommitMove, onRemove, onToggleMin, onDragStart, onDragEnd }: {
  tile: StTile;
  cols: number;
  stored: StTile[];
  roster: StRosterEntry[];
  resizing: boolean;
  onResizeStart: (id: string) => void;
  onResizeEnd: () => void;
  onResize: (id: string, colSpan: number, rowSpan: number) => void;
  onCommitMove: (id: string, col: number, row: number) => void;
  onRemove: (id: string) => void;
  onToggleMin: (id: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  /* The live settle sequence from the last release; forced to resolve before a re-grab so
     its stale timer can't clobber the new drag or commit an abandoned target. */
  const settleRef = useRef<(() => void) | null>(null);
  const meta = tileMeta(tile.id);
  const interactive = cols === GRID_COLS; // free placement + resize only at canonical width
  const isNotes = tileType(tile.id) === 'notes';

  /* Pointer-drag the header: track the pointer 1:1 via inline inset (transition suspended by
     the is-dragging class), preview snap validity live, then animate to the snapped cell on
     release. Reject-on-overlap: an invalid drop snaps the tile back to its anchor. */
  function onHeadDown(e: PointerEvent) {
    if (!interactive || (e.target as HTMLElement).closest('.vamp-st-tile__x, .vamp-st-tile__min')) return;
    const el = ref.current;
    const grid = el?.offsetParent as HTMLElement | null;
    if (!el || !grid) return;
    e.preventDefault();
    settleRef.current?.();
    onDragStart();

    const cellW = grid.clientWidth / GRID_COLS;
    const rowH = ROW_UNIT_REM * remPx();
    const baseLeft = el.offsetLeft, baseTop = el.offsetTop;
    const startX = e.clientX, startY = e.clientY;
    let target: { col: number; row: number } | null = null;

    el.classList.add('is-dragging');

    const move = (ev: PointerEvent) => {
      const left = baseLeft + (ev.clientX - startX);
      const top = baseTop + (ev.clientY - startY);
      el.style.insetInlineStart = `${left}px`;
      el.style.insetBlockStart = `${top}px`;
      const col = Math.max(1, Math.min(Math.round(left / cellW) + 1, GRID_COLS - tile.colSpan + 1));
      const row = Math.max(1, Math.round(top / rowH) + 1);
      const valid = fitsAt(stored, tile.id, col, row, GRID_COLS);
      target = valid ? { col, row } : null;
      el.classList.toggle('is-invalid', !valid);
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onDragEnd();
      el.classList.remove('is-dragging', 'is-invalid');
      void el.offsetWidth; // flush the transition:none removal before animating the snap

      const committed = target && (target.col !== tile.col || target.row !== tile.row) ? target : null;
      const destLeft = committed ? (committed.col - 1) * cellW : baseLeft;
      const destTop = committed ? (committed.row - 1) * rowH : baseTop;
      el.style.insetInlineStart = `${destLeft}px`;
      el.style.insetBlockStart = `${destTop}px`;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        el.removeEventListener('transitionend', finish);
        if (settleRef.current === finish) settleRef.current = null;
        el.style.transition = 'none';
        el.style.insetInlineStart = '';
        el.style.insetBlockStart = '';
        if (committed) onCommitMove(tile.id, committed.col, committed.row);
        requestAnimationFrame(() => { el.style.transition = ''; });
      };
      settleRef.current = finish;
      el.addEventListener('transitionend', finish);
      const timer = window.setTimeout(finish, 240); // fallback when the snap distance is zero (no transitionend)
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* Pointer-resize from the corner grip: freeze the rect at grab, translate the pointer delta
     into snapped spans. resizeTile clamps growth against neighbors (collision, no push). */
  function onGripDown(e: PointerEvent) {
    if (!interactive) return;
    e.preventDefault();
    e.stopPropagation();
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const unitW = rect.width / tile.colSpan;
    const unitH = rect.height / tile.rowSpan;
    const startX = e.clientX, startY = e.clientY;
    let lastC = tile.colSpan, lastR = tile.rowSpan;
    onResizeStart(tile.id);

    const move = (ev: PointerEvent) => {
      const nc = clampColSpan(tile.id, Math.round((rect.width + (ev.clientX - startX)) / unitW), cols);
      const nr = clampRowSpan(Math.round((rect.height + (ev.clientY - startY)) / unitH));
      if (nc !== lastC || nr !== lastR) { lastC = nc; lastR = nr; onResize(tile.id, nc, nr); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onResizeEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const style = {
    '--c': String(tile.col),
    '--r': String(tile.row),
    '--w': String(tile.colSpan),
    '--h': String(tile.min ? 1 : tile.rowSpan),
  } as Record<string, string>;

  /* A note tile is titled by its first markdown heading, falling back to the generic label. */
  const label = isNotes
    ? (noteTitle(stState.value.notes.find(n => n.id === noteIdOf(tile.id))?.text ?? '') || 'ST Notes')
    : (meta?.label ?? tile.id);

  /* Closing a note tile keeps the note (it moves to the ADD TILE reopen list); deletion lives
     behind the trash control in the note editor. Other tiles just drop off the canvas. */
  function handleRemove() {
    if (isNotes) closeNoteTile(noteIdOf(tile.id));
    else onRemove(tile.id);
  }

  return (
    <section ref={ref} class={`vamp-st-tile ${resizing ? 'is-resizing' : ''} ${tile.min ? 'is-minimized' : ''}`} style={style}>
      <header class="vamp-st-tile__head" onPointerDown={onHeadDown} style={{ cursor: interactive ? 'grab' : 'default' }}>
        <span class="vamp-st-tile__grip" aria-hidden="true">⠿</span>
        <span class="vamp-st-tile__title">{label}</span>
        <button
          class="vamp-st-tile__min"
          onClick={() => onToggleMin(tile.id)}
          aria-label={tile.min ? `Expand ${label} tile` : `Minimize ${label} tile`}
          aria-expanded={!tile.min}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" class={tile.min ? '' : 'is-open'}>
            <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button
          class="vamp-st-tile__x"
          onClick={handleRemove}
          aria-label={isNotes ? `Close ${label} tile (keeps the note)` : `Remove ${label} tile`}
          title={isNotes ? 'Close tile — the note is kept, reopen it from + ADD TILE' : undefined}
        >×</button>
      </header>
      <div class="vamp-st-tile__body">
        <TileBody id={tile.id} roster={roster} />
      </div>
      {interactive && !tile.min && (
        <span class="vamp-st-tile__resize" onPointerDown={onGripDown} title="Drag to resize" role="separator" aria-label="Resize tile" />
      )}
    </section>
  );
}

/* Lives in the global header on the ST route; reads the persisted layout directly. */
export function AddTilePicker() {
  const open = useSignal(false);
  const st = stState.value;
  const tiles = st.layout;
  const options = addableTypes(tiles);
  /* Closed-but-not-deleted notes; closing a note tile parks it here to reopen. */
  const closedNotes = tilelessNotes(st.notes, tiles);

  return (
    <div class="vamp-st-add">
      <button class="vamp-st-btn vamp-st-add__btn" onClick={() => { open.value = !open.value; }} aria-expanded={open.value}>
        + ADD TILE
      </button>
      {open.value && (
        <div class="vamp-st-add__menu">
          {/* Notes are multi-instance, so a new ST Note is always on offer (creates note + tile). */}
          <button class="vamp-st-add__item" onClick={() => { addStNote(); open.value = false; }}>+ ST Note</button>
          {options.map(t => (
            <button
              key={t}
              class="vamp-st-add__item"
              onClick={() => { setStLayout(addTile(tiles, t as StTileType, GRID_COLS)); open.value = false; }}
            >{tileMeta(t)?.label ?? t}</button>
          ))}
          {closedNotes.length > 0 && (
            <>
              <span class="vamp-st-add__heading">Reopen note</span>
              {closedNotes.map(n => (
                <button
                  key={n.id}
                  class="vamp-st-add__item vamp-st-add__item--reopen"
                  onClick={() => { reopenNoteTile(n.id); open.value = false; }}
                >{n.title}</button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const ST_ROLL_MODE_META: { id: StRollMode; label: string; title: string }[] = [
  { id: 'public', label: 'Public', title: 'Your rolls post to the shared log, attributed to the Storyteller' },
  { id: 'secret', label: 'Secret', title: 'Players see only “Storyteller rolled something.” — no dice or total' },
  { id: 'hidden', label: 'Hidden', title: 'The roll stays on your screen only; nothing is shared' },
];

/* Header control on the ST route: which of the Storyteller's free rolls the table can see. */
export function StRollModeToggle() {
  const mode = stState.value.stRollMode;
  return (
    <div class="vamp-st-rollmode" role="group" aria-label="Storyteller roll visibility">
      <span class="vamp-st-rollmode__label" aria-hidden="true">Rolls</span>
      {ST_ROLL_MODE_META.map(m => (
        <button
          key={m.id}
          class={`vamp-st-rollmode__btn ${mode === m.id ? 'is-active' : ''}`}
          title={m.title}
          aria-pressed={mode === m.id}
          onClick={() => setStRollMode(m.id)}
        >{m.label}</button>
      ))}
    </div>
  );
}

export function StCanvas({ roster }: { roster: StRosterEntry[] }) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const cols = useSignal(GRID_COLS);
  const resizingId = useSignal<string | null>(null);
  /* True during any live drag or resize: strengthens the dot grid and adds drop-headroom. */
  const interacting = useSignal(false);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      cols.value = w >= WIDE_MIN_PX ? GRID_COLS : GRID_COLS_NARROW;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Seed the day-one tiles only on a first-ever visit (no stState doc). A persisted empty
     layout means the ST deliberately cleared the canvas — respect it. */
  useEffect(() => {
    if (!stDocExisted.value && stState.value.layout.length === 0) seedStDefaults();
  }, []);

  const stored = stState.value.layout;
  /* Full width honours the stored anchors (free placement); the narrow view repacks for
     display only, never persisting. */
  const display = cols.value >= GRID_COLS ? stored : reflowLayout(stored, cols.value);
  /* Fit content exactly (grid CSS fills the viewport when this is short, so no dead scroll);
     headroom rows only appear mid-interaction so a tile can be dragged past the bottom. */
  const rows = layoutRows(display) + (interacting.value ? DROP_HEADROOM : 0);

  return (
    <div class="vamp-st-canvas" ref={canvasRef}>
      {display.length === 0 ? (
        <p class="vamp-st-canvas__empty">Every tile is put away. Add one to set the table.</p>
      ) : (
        <div class={`vamp-st-canvas__grid ${interacting.value ? 'is-active' : ''}`} style={{ '--st-rows': String(rows), '--st-cols': String(cols.value), '--st-row-unit': `${ROW_UNIT_REM}rem` } as Record<string, string>}>
          {/* Commits read the LIVE layout: the settle timer fires ~240ms after render, so a
              render-stale `stored` there could resurrect a removed tile or revert a 2nd drag. */}
          {display.map(t => (
            <CanvasTile
              key={t.id}
              tile={t}
              cols={cols.value}
              stored={stored}
              roster={roster}
              resizing={resizingId.value === t.id}
              onResizeStart={(id) => { resizingId.value = id; interacting.value = true; }}
              onResizeEnd={() => { resizingId.value = null; interacting.value = false; }}
              onResize={(id, c, r) => setStLayout(resizeTile(stState.value.layout, id, c, r, GRID_COLS))}
              onCommitMove={(id, c, r) => setStLayout(moveTile(stState.value.layout, id, c, r, GRID_COLS))}
              onRemove={(id) => setStLayout(removeTile(stState.value.layout, id, GRID_COLS))}
              onToggleMin={(id) => setStLayout(toggleMinimize(stState.value.layout, id, GRID_COLS))}
              onDragStart={() => { interacting.value = true; }}
              onDragEnd={() => { interacting.value = false; }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
