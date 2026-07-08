import { rosterDebtGroups, type StRosterEntry } from '../../../state/stRosterLogic';
import type { Debt } from '../../../state/character';

/* Read-only debt line: the sheet's pip (state only, no handlers) plus who + what. */
function DebtLine({ d }: { d: Debt }) {
  return (
    <div class="vamp-st-debt__line">
      <span class={`vamp-pip vamp-pip--${d.state}`} aria-label={`Debt ${d.state}`} />
      <span class="vamp-st-debt__who">{d.who || '(name)'}</span>
      <span class="vamp-st-debt__what">{d.text || '(unspecified)'}</span>
    </div>
  );
}

function DebtColumn({ label, debts }: { label: string; debts: Debt[] }) {
  return (
    <div class="vamp-st-debt__col">
      <div class="vamp-st-debt__heading">{label}</div>
      {debts.length === 0
        ? <div class="vamp-st-debt__empty">None</div>
        : debts.map(d => <DebtLine key={d.id} d={d} />)}
    </div>
  );
}

/* Read-only, full-Coterie debt aggregation. Mirrors the sheet's OWED / OWE bifurcation, but
   from the ST's POV (owed TO them | they owe). Locked members are excluded upstream. */
export function DebtTrackerTile({ roster }: { roster: StRosterEntry[] }) {
  const groups = rosterDebtGroups(roster);
  if (groups.length === 0) {
    return <p class="vamp-st-tile__empty">No debts among consented members yet.</p>;
  }
  return (
    <div class="vamp-st-debt">
      {groups.map(g => (
        <div class="vamp-st-debt__group" key={g.characterId}>
          <h4 class="vamp-st-debt__name">{g.name}</h4>
          <div class="vamp-st-debt__split">
            <DebtColumn label="Owed to them" debts={g.owed} />
            <div class="vamp-st-debt__divider" role="presentation" />
            <DebtColumn label="They owe" debts={g.owe} />
          </div>
        </div>
      ))}
    </div>
  );
}
