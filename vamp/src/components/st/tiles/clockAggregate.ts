/* Pure aggregation for the All-Clocks tile: filter the roster to consented members that
   actually have clocks. The shared Masquerade Clock lives only on the rail now, so this
   tile is personal clocks only. Kept Firebase-free so the extraction is unit-testable. */
import type { Clock } from '../../../state/character';

export interface ClocksRosterEntry {
  name: string;
  consented: boolean;
  clocks: Clock[];
}

export interface ClocksSource {
  roster: ClocksRosterEntry[];
}

export interface MemberClocks {
  name: string;
  clocks: Clock[];
}

export interface CanvasClocks {
  members: MemberClocks[];
  totalPersonal: number;
}

export function clocksForCanvas(src: ClocksSource): CanvasClocks {
  const members = src.roster
    .filter(e => e.consented && e.clocks.length > 0)
    .map(e => ({ name: e.name, clocks: e.clocks }));
  const totalPersonal = members.reduce((n, m) => n + m.clocks.length, 0);
  return { members, totalPersonal };
}
