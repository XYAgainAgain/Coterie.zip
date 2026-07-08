/* Pure core for Initiative. PCs roll, NPCs/hazards act in between per TPR. Same names get A/B/C suffix.
   Ladder merges color-coded PC rows, auto-sorts by Initiative. Full drag-n-drop for ez rearranging! */

/* An ST-authored opponent: identity + an auto-assigned palette index. TPR is not stored here —
   it's the count of this opponent's turn entries (see `turns`). */
export interface OpponentEntry {
  id: string;
  name: string;
  color: number;
}

/* One placeable turn of an opponent. `slot` anchors it in the ladder (PC rows above it); the
   flat array order breaks ties among same-slot entries and also fixes each entry's T-number
   (its ordinal within its opponent, in ladder order). */
export interface TurnEntry {
  id: string;
  opponentId: string;
  slot: number;
}

/* `turn` indexes the highlighted row in the MERGED ladder; `round` counts full passes (from 1). */
export interface InitiativeState {
  opponents: OpponentEntry[];
  turns: TurnEntry[];
  turn: number;
  round: number;
}

/* A PC's ladder input: identity from the roster, Initiative from the member entry (null = unset).
   `accent` is the player's custom-theme accent (null = no custom theme; the row falls back to a
   neutral accent). */
export interface PcLadderInput {
  characterId: string;
  name: string;
  initiative: number | null;
  portraitUrl?: string | null;
  accent?: string | null;
}

export type LadderRow =
  | { kind: 'pc'; key: string; characterId: string; name: string; initiative: number | null; portraitUrl: string | null; accent: string | null }
  | { kind: 'npc'; key: string; turnId: string; opponentId: string; name: string; baseName: string; badge: string; tpr: number; color: string };

export function blankInitiative(): InitiativeState {
  return { opponents: [], turns: [], turn: 0, round: 1 };
}

function toInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

/* Golden-angle hue rotation gives well-separated hues for any opponent count; fixed lightness /
   chroma keep them readable on Night, Sunset, and Abyss (used only as an edge bar + name tint). */
const HUE_SEED = 25;
const GOLDEN_ANGLE = 137.508;
export function opponentColor(index: number): string {
  const hue = ((HUE_SEED + index * GOLDEN_ANGLE) % 360 + 360) % 360;
  return `oklch(0.72 0.14 ${hue.toFixed(1)})`;
}

/* Smallest unused palette index, so colors stay distinct and get reused after a removal. */
function nextColorIndex(opponents: OpponentEntry[]): number {
  const used = new Set(opponents.map(o => o.color));
  let i = 0;
  while (used.has(i)) i++;
  return i;
}

/* Spreadsheet-style column letters (0 → A, 25 → Z, 26 → AA) for duplicate-name suffixes. */
function suffixLetter(i: number): string {
  let out = '';
  i += 1;
  while (i > 0) {
    const rem = (i - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    i = Math.floor((i - 1) / 26);
  }
  return out;
}

/* Map opponent id → disambiguating suffix (' A', ' B', …), empty for names that are unique.
   Case-insensitive grouping, so a casing typo still disambiguates; letters follow array order. */
function suffixes(opponents: OpponentEntry[]): Map<string, string> {
  const groups = new Map<string, string[]>();
  for (const o of opponents) {
    const key = (o.name.trim() || 'Opponent').toLowerCase();
    const ids = groups.get(key);
    if (ids) ids.push(o.id);
    else groups.set(key, [o.id]);
  }
  const out = new Map<string, string>();
  for (const ids of groups.values()) {
    if (ids.length < 2) { out.set(ids[0], ''); continue; }
    ids.forEach((id, i) => out.set(id, ` ${suffixLetter(i)}`));
  }
  return out;
}

/* PCs highest-first; an unset Initiative sinks to the bottom. Stable, so equal scores (and the
   unset ones) keep their incoming roster order. */
function sortPcs(pcs: PcLadderInput[]): PcLadderInput[] {
  return pcs
    .map((p, i) => [p, i] as const)
    .sort((a, b) => {
      const av = a[0].initiative, bv = b[0].initiative;
      if (av === null && bv === null) return a[1] - b[1];
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av || a[1] - b[1];
    })
    .map(([p]) => p);
}

/* Interleaves the auto-sorted PCs with every opponent turn entry at its stored slot (clamped
   to live PC count; same-slot entries keep `turns` array order). Turn entries number T1..TN in ladder order, suppressed for single-turn opponents. */
export function mergeLadder(pcs: PcLadderInput[], state: InitiativeState): LadderRow[] {
  const sorted = sortPcs(pcs);
  const oppById = new Map(state.opponents.map(o => [o.id, o] as const));
  const suffix = suffixes(state.opponents);
  const totals = new Map<string, number>();
  for (const t of state.turns) totals.set(t.opponentId, (totals.get(t.opponentId) ?? 0) + 1);
  const ordinals = new Map<string, number>();
  const clampedSlot = (t: TurnEntry) => Math.max(0, Math.min(t.slot, sorted.length));
  const rows: LadderRow[] = [];
  for (let i = 0; i <= sorted.length; i++) {
    for (const t of state.turns) {
      if (clampedSlot(t) !== i) continue;
      const opp = oppById.get(t.opponentId);
      if (!opp) continue;
      const ord = (ordinals.get(opp.id) ?? 0) + 1;
      ordinals.set(opp.id, ord);
      const total = totals.get(opp.id) ?? 1;
      const baseName = opp.name.trim() || 'Opponent';
      const letter = (suffix.get(opp.id) ?? '').trim();
      const turn = total > 1 ? `T${ord}` : '';
      const badge = [letter, turn].filter(Boolean).join(' · ');
      const display = baseName + (letter ? ` ${letter}` : '') + (turn ? ` (${turn})` : '');
      rows.push({
        kind: 'npc', key: `npc:${t.id}`, turnId: t.id, opponentId: opp.id,
        name: display, baseName, badge, tpr: total, color: opponentColor(opp.color),
      });
    }
    if (i < sorted.length) {
      const p = sorted[i];
      rows.push({ kind: 'pc', key: `pc:${p.characterId}`, characterId: p.characterId, name: p.name, initiative: p.initiative, portraitUrl: p.portraitUrl ?? null, accent: p.accent ?? null });
    }
  }
  return rows;
}

/* Add an opponent whose TPR turn entries all start at the bottom of the ladder (slot = PC count),
   with the next free palette color. */
export function addOpponent(state: InitiativeState, name: string, tpr: number, pcCount: number): InitiativeState {
  const id = crypto.randomUUID();
  const count = Math.max(1, Math.trunc(tpr) || 1);
  const slot = Math.max(0, Math.trunc(pcCount) || 0);
  const opponent: OpponentEntry = { id, name: name.trim(), color: nextColorIndex(state.opponents) };
  const turns: TurnEntry[] = Array.from({ length: count }, () => ({ id: crypto.randomUUID(), opponentId: id, slot }));
  return { ...state, opponents: [...state.opponents, opponent], turns: [...state.turns, ...turns] };
}

export function renameOpponent(state: InitiativeState, id: string, name: string): InitiativeState {
  return { ...state, opponents: state.opponents.map(o => (o.id === id ? { ...o, name } : o)) };
}

/* Grow or shrink an opponent's turn-entry count. Surviving turns keep their slot and order;
   growth appends new entries at the bottom, shrink drops the highest T-numbers. */
export function setOpponentTpr(state: InitiativeState, id: string, tpr: number, pcCount: number): InitiativeState {
  const count = Math.max(1, Math.trunc(tpr) || 1);
  const mine = state.turns.filter(t => t.opponentId === id);
  if (!mine.length || mine.length === count) return state;
  if (count < mine.length) {
    const keep = new Set(mine.slice(0, count).map(t => t.id));
    return { ...state, turns: state.turns.filter(t => t.opponentId !== id || keep.has(t.id)) };
  }
  const slot = Math.max(0, Math.trunc(pcCount) || 0);
  const added: TurnEntry[] = Array.from({ length: count - mine.length }, () => ({ id: crypto.randomUUID(), opponentId: id, slot }));
  return { ...state, turns: [...state.turns, ...added] };
}

export function removeOpponent(state: InitiativeState, id: string): InitiativeState {
  const opponents = state.opponents.filter(o => o.id !== id);
  if (opponents.length === state.opponents.length) return state;
  return { ...state, opponents, turns: state.turns.filter(t => t.opponentId !== id) };
}

/* Reposition one turn entry to a merged-list insert index (from a drag). Rebuilds every turn
   entry's slot AND array order from the resulting merged order, so both the slotting and the
   intra-slot tie-break stay self-consistent and the moved entry lands exactly where dropped. */
export function setTurnPosition(state: InitiativeState, pcs: PcLadderInput[], turnId: string, insertIndex: number): InitiativeState {
  const merged = mergeLadder(pcs, state);
  const draggedIdx = merged.findIndex(r => r.kind === 'npc' && r.turnId === turnId);
  if (draggedIdx < 0) return state;
  const dragged = merged[draggedIdx];
  const without = merged.filter((_, i) => i !== draggedIdx);
  const at = Math.max(0, Math.min(Math.trunc(insertIndex), without.length));
  without.splice(at, 0, dragged);

  const byId = new Map(state.turns.map(t => [t.id, t] as const));
  let pcsBefore = 0;
  const turns: TurnEntry[] = [];
  for (const row of without) {
    if (row.kind === 'pc') { pcsBefore++; continue; }
    const t = byId.get(row.turnId);
    if (t) turns.push({ ...t, slot: pcsBefore });
  }
  return { ...state, turns };
}

/* Advance the turn over the merged ladder; wrapping past the last row starts a new round. */
export function nextTurn(state: InitiativeState, count: number): InitiativeState {
  if (count <= 0) return state;
  const nt = state.turn + 1;
  if (nt >= count) return { ...state, turn: 0, round: state.round + 1 };
  return { ...state, turn: nt };
}

/* Step back a turn; wrapping before the first row rewinds the round (floored at 1). */
export function prevTurn(state: InitiativeState, count: number): InitiativeState {
  if (count <= 0) return state;
  const pt = state.turn - 1;
  if (pt < 0) return { ...state, turn: count - 1, round: Math.max(1, state.round - 1) };
  return { ...state, turn: pt };
}

/* Guarantee every opponent owns at least one turn entry, so a corrupted or partial doc can't
   hide an opponent from the ladder. Appends a bottom-slot entry for any that lost all of theirs. */
function ensureTurns(opponents: OpponentEntry[], turns: TurnEntry[]): TurnEntry[] {
  const have = new Set(turns.map(t => t.opponentId));
  const patched = [...turns];
  for (const o of opponents) {
    if (!have.has(o.id)) patched.push({ id: crypto.randomUUID(), opponentId: o.id, slot: 0 });
  }
  return patched;
}

export function coerceInitiative(raw: unknown): InitiativeState {
  if (!isObj(raw) || Array.isArray(raw)) return blankInitiative();
  const r = raw;
  const turn = Math.max(0, toInt(r.turn, 0));
  const round = Math.max(1, toInt(r.round, 1));

  /* Current shape: {opponents, turns} passes through, dropping id-less/orphaned rows. */
  if (Array.isArray(r.opponents)) {
    const opponents: OpponentEntry[] = r.opponents
      .filter(isObj)
      .map((o, i) => ({
        id: typeof o.id === 'string' ? o.id : '',
        name: typeof o.name === 'string' ? o.name : '',
        color: Math.max(0, toInt(o.color, i)),
      }))
      .filter(o => o.id !== '');
    const validIds = new Set(opponents.map(o => o.id));
    const rawTurns = Array.isArray(r.turns) ? r.turns : [];
    const turns: TurnEntry[] = rawTurns
      .filter(isObj)
      .map(t => ({
        id: typeof t.id === 'string' ? t.id : '',
        opponentId: typeof t.opponentId === 'string' ? t.opponentId : '',
        slot: Math.max(0, toInt(t.slot, 0)),
      }))
      .filter(t => t.id !== '' && validIds.has(t.opponentId));
    return { opponents, turns: ensureTurns(opponents, turns), turn, round };
  }

  /* Migrate the pre-turn-entry model {npcs:[{id,name,tpr,slot}]}: each NPC becomes an opponent
     whose `tpr` turn entries all sit at its old slot, keeping its ladder position. */
  if (Array.isArray(r.npcs)) {
    const opponents: OpponentEntry[] = [];
    const turns: TurnEntry[] = [];
    r.npcs
      .filter(isObj)
      .forEach((n, i) => {
        const id = typeof n.id === 'string' ? n.id : '';
        if (!id) return;
        const count = Math.max(1, toInt(n.tpr, 1));
        const slot = Math.max(0, toInt(n.slot, 0));
        opponents.push({ id, name: typeof n.name === 'string' ? n.name : '', color: i });
        for (let k = 0; k < count; k++) turns.push({ id: crypto.randomUUID(), opponentId: id, slot });
      });
    return { opponents, turns, turn, round };
  }

  /* Migrate the oldest {entries:[{id,name,value}]} model: one single-turn opponent per entry. */
  if (Array.isArray(r.entries)) {
    const opponents: OpponentEntry[] = [];
    const turns: TurnEntry[] = [];
    r.entries
      .filter(isObj)
      .forEach((e, i) => {
        const id = typeof e.id === 'string' ? e.id : '';
        if (!id) return;
        opponents.push({ id, name: typeof e.name === 'string' ? e.name : '', color: i });
        turns.push({ id: crypto.randomUUID(), opponentId: id, slot: 0 });
      });
    return { opponents, turns, turn, round };
  }

  return { opponents: [], turns: [], turn, round };
}
