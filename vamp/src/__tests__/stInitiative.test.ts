import { describe, it, expect } from 'vitest';
import {
  blankInitiative, addOpponent, renameOpponent, setOpponentTpr, removeOpponent,
  setTurnPosition, mergeLadder, nextTurn, prevTurn, coerceInitiative, opponentColor,
  type InitiativeState, type OpponentEntry, type TurnEntry, type PcLadderInput,
} from '../state/stInitiativeLogic';

const opp = (id: string, color = 0, name = id): OpponentEntry => ({ id, name, color });
const trn = (id: string, opponentId: string, slot: number): TurnEntry => ({ id, opponentId, slot });
const pc = (characterId: string, initiative: number | null, name = characterId): PcLadderInput => ({ characterId, name, initiative });
const state = (opponents: OpponentEntry[], turns: TurnEntry[], turn = 0, round = 1): InitiativeState => ({ opponents, turns, turn, round });
const keys = (rows: { key: string }[]) => rows.map(r => r.key);
const names = (rows: { name?: string }[]) => rows.map(r => r.name ?? '');

describe('mergeLadder (PC autosort + turn-entry slotting)', () => {
  it('sorts PCs by Initiative descending, unset scores sinking to the bottom (stable)', () => {
    const rows = mergeLadder([pc('a', 8), pc('b', 12), pc('c', null), pc('d', 8)], blankInitiative());
    expect(keys(rows)).toEqual(['pc:b', 'pc:a', 'pc:d', 'pc:c']); // 12, then 8/8 in input order, then unset
  });

  it('slots turn entries between the sorted PCs by slot = PCs above (clamped to the PC count)', () => {
    const s = state([opp('x')], [trn('top', 'x', 0), trn('mid', 'x', 1), trn('bot', 'x', 9)]); // 9 clamps to 2 PCs
    const rows = mergeLadder([pc('a', 5), pc('b', 10)], s);
    expect(keys(rows)).toEqual(['npc:top', 'pc:b', 'npc:mid', 'pc:a', 'npc:bot']);
  });

  it('keeps same-slot turn entries in array order', () => {
    const s = state([opp('x')], [trn('t1', 'x', 0), trn('t2', 'x', 0)]);
    const rows = mergeLadder([pc('a', 5)], s);
    expect(keys(rows)).toEqual(['npc:t1', 'npc:t2', 'pc:a']);
  });

  it('a turn slot survives a PC re-sort (stays after the same number of PCs)', () => {
    const s = state([opp('x')], [trn('m', 'x', 1)]);
    expect(keys(mergeLadder([pc('a', 10), pc('b', 5)], s))).toEqual(['pc:a', 'npc:m', 'pc:b']);
    // b now rolls higher: the ladder re-sorts, but 'm' still sits after exactly one PC
    expect(keys(mergeLadder([pc('a', 4), pc('b', 9)], s))).toEqual(['pc:b', 'npc:m', 'pc:a']);
  });

  it('passes the PC accent through (neutral null when unset)', () => {
    const rows = mergeLadder([{ characterId: 'a', name: 'A', initiative: 5, accent: '#ff0000' }, pc('b', 3)], blankInitiative());
    const pcs = rows.filter(r => r.kind === 'pc') as Extract<typeof rows[number], { kind: 'pc' }>[];
    expect(pcs.map(r => r.accent)).toEqual(['#ff0000', null]);
  });
});

describe('turn-entry spawning, labels, and duplicate-name suffixing', () => {
  it('spawns TPR separate turn entries, numbered T1..TN in ladder order', () => {
    const s = addOpponent(blankInitiative(), 'Bad Guy', 3, 0);
    const rows = mergeLadder([], s);
    expect(names(rows)).toEqual(['Bad Guy (T1)', 'Bad Guy (T2)', 'Bad Guy (T3)']);
  });

  it('omits the T-number for a single-turn opponent', () => {
    const s = addOpponent(blankInitiative(), 'Lone Wolf', 1, 0);
    expect(names(mergeLadder([], s))).toEqual(['Lone Wolf']);
  });

  it('suffixes duplicate base names A/B (retroactively) and prefixes it before the turn', () => {
    let s = addOpponent(blankInitiative(), 'Bad Guy', 2, 0);
    s = addOpponent(s, 'Bad Guy', 1, 0);
    expect(names(mergeLadder([], s))).toEqual(['Bad Guy A (T1)', 'Bad Guy A (T2)', 'Bad Guy B']);
  });

  it('gives each opponent a distinct auto-assigned color, reused after removal', () => {
    let s = addOpponent(blankInitiative(), 'A', 1, 0);
    s = addOpponent(s, 'B', 1, 0);
    expect(s.opponents.map(o => o.color)).toEqual([0, 1]);
    s = removeOpponent(s, s.opponents[0].id);
    s = addOpponent(s, 'C', 1, 0); // fills the freed index 0
    expect(s.opponents.map(o => o.color).sort()).toEqual([0, 1]);
    const rows = mergeLadder([], s).filter(r => r.kind === 'npc') as Extract<ReturnType<typeof mergeLadder>[number], { kind: 'npc' }>[];
    expect(new Set(rows.map(r => r.color)).size).toBe(2); // two distinct colors
  });

  it('opponentColor is deterministic and oklch', () => {
    expect(opponentColor(0)).toBe(opponentColor(0));
    expect(opponentColor(0)).not.toBe(opponentColor(1));
    expect(opponentColor(2).startsWith('oklch(')).toBe(true);
  });
});

describe('add / rename / TPR / remove opponents', () => {
  it('adds an opponent with a trimmed name and TPR turn entries at the bottom (slot = PC count)', () => {
    const out = addOpponent(blankInitiative(), '  Ghoul  ', 3, 2);
    expect(out.opponents).toHaveLength(1);
    expect(out.opponents[0].name).toBe('Ghoul');
    expect(out.turns).toHaveLength(3);
    expect(out.turns.every(t => t.slot === 2 && t.opponentId === out.opponents[0].id)).toBe(true);
  });

  it('floors a bad TPR to 1', () => {
    expect(addOpponent(blankInitiative(), 'x', 0, 0).turns).toHaveLength(1);
  });

  it('renames the shared opponent (every turn row follows)', () => {
    const s = addOpponent(blankInitiative(), 'Old', 2, 0);
    const out = renameOpponent(s, s.opponents[0].id, 'New');
    expect(names(mergeLadder([], out))).toEqual(['New (T1)', 'New (T2)']);
  });

  it('growing TPR appends new turns at the bottom, preserving surviving turn positions', () => {
    const pcs = [pc('a', 10)];
    let s = addOpponent(blankInitiative(), 'G', 1, 0); // one turn at slot 0 (above the PC)
    const id = s.opponents[0].id;
    expect(keys(mergeLadder(pcs, s))).toEqual(['npc:' + s.turns[0].id, 'pc:a']);
    s = setOpponentTpr(s, id, 3, 1); // +2 turns at slot 1 (below the PC)
    const rows = mergeLadder(pcs, s);
    expect(rows[0].kind).toBe('npc'); // original survivor still above the PC
    expect(rows[1].key).toBe('pc:a');
    expect(rows.slice(2).every(r => r.kind === 'npc')).toBe(true); // two new turns below
    expect(rows).toHaveLength(4);
  });

  it('shrinking TPR drops the highest T-numbers, keeping the earlier turns put', () => {
    let s = addOpponent(blankInitiative(), 'G', 3, 0);
    const id = s.opponents[0].id;
    const firstTwo = s.turns.slice(0, 2).map(t => t.id);
    s = setOpponentTpr(s, id, 2, 0);
    expect(s.turns.map(t => t.id)).toEqual(firstTwo);
  });

  it('TPR change is a no-op when the count is unchanged or the opponent is missing', () => {
    const s = addOpponent(blankInitiative(), 'G', 2, 0);
    expect(setOpponentTpr(s, s.opponents[0].id, 2, 0)).toBe(s);
    expect(setOpponentTpr(s, 'ghost', 5, 0)).toBe(s);
  });

  it('removing an opponent drops it and all its turn entries; no-op by reference when missing', () => {
    let s = addOpponent(blankInitiative(), 'A', 2, 0);
    s = addOpponent(s, 'B', 1, 0);
    const aId = s.opponents[0].id;
    const out = removeOpponent(s, aId);
    expect(out.opponents.map(o => o.name)).toEqual(['B']);
    expect(out.turns.every(t => t.opponentId !== aId)).toBe(true);
    expect(removeOpponent(s, 'ghost')).toBe(s);
  });
});

describe('setTurnPosition (drag one turn entry within the merged ladder)', () => {
  const pcs = [pc('a', 10), pc('b', 5)]; // sorted: a (idx0), b (idx1)

  it('drops a turn entry to the very top (slot 0)', () => {
    const s = state([opp('x')], [trn('n', 'x', 2)]); // below both PCs
    expect(keys(mergeLadder(pcs, s))).toEqual(['pc:a', 'pc:b', 'npc:n']);
    const out = setTurnPosition(s, pcs, 'n', 0);
    expect(out.turns[0].slot).toBe(0);
    expect(keys(mergeLadder(pcs, out))).toEqual(['npc:n', 'pc:a', 'pc:b']);
  });

  it('drops between the two PCs (slot becomes 1)', () => {
    const s = state([opp('x')], [trn('n', 'x', 0)]);
    const out = setTurnPosition(s, pcs, 'n', 1); // after 'a' in the without-list [a, b]
    expect(out.turns[0].slot).toBe(1);
    expect(keys(mergeLadder(pcs, out))).toEqual(['pc:a', 'npc:n', 'pc:b']);
  });

  it('reorders two same-opponent turns relative to each other via array order', () => {
    const s = state([opp('x')], [trn('t1', 'x', 2), trn('t2', 'x', 2)]); // both below the PCs, t1 then t2
    expect(keys(mergeLadder(pcs, s))).toEqual(['pc:a', 'pc:b', 'npc:t1', 'npc:t2']);
    const out = setTurnPosition(s, pcs, 't2', 2); // move t2 above t1 (insert at without-index 2)
    expect(keys(mergeLadder(pcs, out))).toEqual(['pc:a', 'pc:b', 'npc:t2', 'npc:t1']);
  });

  it('is a no-op for an unknown turn id', () => {
    const s = state([opp('x')], [trn('n', 'x', 0)]);
    expect(setTurnPosition(s, pcs, 'ghost', 0)).toBe(s);
  });
});

describe('nextTurn / prevTurn over the merged count', () => {
  const empty = blankInitiative();
  it('advances within a round', () => {
    expect(nextTurn(state([], [], 0, 1), 3)).toMatchObject({ turn: 1, round: 1 });
  });
  it('wraps past the last row and increments the round', () => {
    expect(nextTurn(state([], [], 2, 1), 3)).toMatchObject({ turn: 0, round: 2 });
  });
  it('steps back within a round', () => {
    expect(prevTurn(state([], [], 1, 2), 3)).toMatchObject({ turn: 0, round: 2 });
  });
  it('wraps before the first row and rewinds the round (floored at 1)', () => {
    expect(prevTurn(state([], [], 0, 3), 3)).toMatchObject({ turn: 2, round: 2 });
    expect(prevTurn(state([], [], 0, 1), 3)).toMatchObject({ turn: 2, round: 1 });
  });
  it('is a no-op on an empty ladder', () => {
    expect(nextTurn(empty, 0)).toBe(empty);
    expect(prevTurn(empty, 0)).toBe(empty);
  });
});

describe('coerceInitiative', () => {
  it('returns a blank ladder for junk input', () => {
    expect(coerceInitiative(null)).toEqual({ opponents: [], turns: [], turn: 0, round: 1 });
    expect(coerceInitiative('nope')).toEqual({ opponents: [], turns: [], turn: 0, round: 1 });
  });

  it('reads a well-formed opponents/turns doc through, dropping id-less and orphaned rows', () => {
    const out = coerceInitiative({
      opponents: [{ id: 'a', name: 'Ghoul', color: 1 }, { name: 'no id', color: 0 }],
      turns: [{ id: 't1', opponentId: 'a', slot: 1 }, { id: 't2', opponentId: 'ghost', slot: 0 }, { id: '', opponentId: 'a', slot: 0 }],
      turn: 5, round: -2,
    });
    expect(out.opponents).toEqual([{ id: 'a', name: 'Ghoul', color: 1 }]);
    expect(out.turns).toEqual([{ id: 't1', opponentId: 'a', slot: 1 }]);
    expect(out).toMatchObject({ turn: 5, round: 1 });
  });

  it('is idempotent on its own output', () => {
    let s = addOpponent(blankInitiative(), 'Bad Guy', 3, 1);
    s = addOpponent(s, 'Bad Guy', 1, 0);
    const once = coerceInitiative(JSON.parse(JSON.stringify(s)));
    const twice = coerceInitiative(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });

  it('synthesizes a turn entry for an opponent that lost all of them', () => {
    const out = coerceInitiative({ opponents: [{ id: 'a', name: 'A', color: 0 }], turns: [] });
    expect(out.turns).toHaveLength(1);
    expect(out.turns[0].opponentId).toBe('a');
  });

  it('migrates the {npcs:[{id,name,tpr,slot}]} model: one opponent, TPR turn entries at its old slot', () => {
    const out = coerceInitiative({
      npcs: [{ id: 'a', name: 'Ghoul', tpr: 3, slot: 1 }, { id: 'b', name: 'Mook', tpr: 1, slot: 0 }],
      turn: 2, round: 4,
    });
    expect(out.opponents).toEqual([{ id: 'a', name: 'Ghoul', color: 0 }, { id: 'b', name: 'Mook', color: 1 }]);
    expect(out.turns.filter(t => t.opponentId === 'a')).toHaveLength(3);
    expect(out.turns.filter(t => t.opponentId === 'a').every(t => t.slot === 1)).toBe(true);
    expect(out.turns.filter(t => t.opponentId === 'b')).toHaveLength(1);
    expect(out).toMatchObject({ turn: 2, round: 4 });
  });

  it('migrates the oldest {entries} model into single-turn opponents', () => {
    const out = coerceInitiative({ entries: [{ id: 'x', name: 'Moe', value: 12 }, { id: 'y', name: 'Lor', value: 9 }], round: 2 });
    expect(out.opponents.map(o => o.name)).toEqual(['Moe', 'Lor']);
    expect(out.turns).toHaveLength(2);
    expect(out.round).toBe(2);
  });
});
