import { activeCoterie, activeCharacterId } from '../state/persistence';
import { coterieState } from '../state/coterie';
import { rollLog, rollLogCollapsed } from '../dice/rollLog';
import { TIER_COLORS, FANGS_D } from '../dice/rollMove';
import { giftDisplayName } from '../data/gifts';
import type { RollLogEntry } from '../dice/types';

const STAT_ABBR: Record<string, string> = {
  Blood: 'BLD', Shadow: 'SHA', Resolve: 'RES', Demeanor: 'DEM', Wits: 'WIT',
};

function fmtMod(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/* Renders one entry in the compressed toast syntax, reusing its classes. This is the
   single obfuscation seam: a future Storyteller pass blanks dice/total here. */
function RollRow({ entry, mine, index }: { entry: RollLogEntry; mine: string | null; index: number }) {
  const who = entry.characterId && entry.characterId === mine ? 'You' : giftDisplayName(entry.who || 'Someone');
  const fanged = entry.tier === 'fanged';
  const crit = entry.tier === 'crit';
  const isStat = entry.statName !== '';
  const modClass = fanged ? 'vamp-roll-toast__mod vamp-roll-toast__struck' : 'vamp-roll-toast__mod';
  const statClass = fanged ? 'vamp-roll-toast__stat vamp-roll-toast__struck' : 'vamp-roll-toast__stat';

  /* Crit and Fanged own the whole row's background (set in CSS); other tiers get the inline
     left-edge accent. Past the 24th row, fade 2% per row to ~50% so older reads as fainter. */
  const accent = entry.tier && !crit && !fanged ? TIER_COLORS[entry.tier].border : null;
  const dim = index >= 24 ? Math.max(0.5, 1 - 0.02 * (index - 24)) : 1;
  const style = [
    accent ? `border-inline-start-color: ${accent}` : '',
    dim < 1 ? `opacity: ${dim}` : '',
  ].filter(Boolean).join('; ') || undefined;

  const rowClass = `vamp-roll-log__row${crit ? ' vamp-roll-log__row--crit' : ''}${fanged ? ' vamp-roll-log__row--fanged' : ''}`;

  return (
    <li class={rowClass} style={style}>
      <span class="vamp-roll-log__who">{who}</span>
      <span class="vamp-roll-log__syntax">
        {entry.kept.map((d, i) => <span key={`k${i}`} class="vamp-roll-toast__die">{d}</span>)}
        {entry.dropped.map((d, i) => <span key={`d${i}`} class="vamp-roll-toast__die vamp-roll-toast__die--dropped">{d}</span>)}
        {isStat && entry.forwardMod !== 0 && (
          <span class={modClass}>{fmtMod(entry.forwardMod)}<span class="vamp-roll-toast__mod-label">F</span></span>
        )}
        {isStat && entry.ongoingMod !== 0 && (
          <span class={modClass}>{fmtMod(entry.ongoingMod)}<span class="vamp-roll-toast__mod-label">O</span></span>
        )}
        {isStat && <span class={modClass}>{fmtMod(entry.statValue)}</span>}
        {isStat && ' '}
        {isStat && <span class={statClass}>{STAT_ABBR[entry.statName] ?? entry.statName}</span>}
        {entry.label && <span class="vamp-roll-log__label">{entry.label}</span>}
        {fanged
          ? (
            <svg class="vamp-roll-log__fangs" viewBox="0 0 736 736" aria-hidden="true">
              <g transform="matrix(0.92,0,0,0.92,0,0)">
                <g transform="matrix(1.69837,0,0,1.69837,-30.4348,-30.4348)">
                  <path d={FANGS_D} />
                </g>
              </g>
            </svg>
          )
          : entry.outcome
            ? <span class="vamp-roll-log__outcome"> · {entry.outcome}</span>
            : <> = <span class="vamp-roll-toast__total">{entry.total}</span></>}
      </span>
    </li>
  );
}

export function RollLog() {
  /* In a Coterie the shared list is the source of truth (it already holds this client's
     own rolls); solo characters fall back to the local log. */
  const entries = activeCoterie.value ? coterieState.value.diceRolls : rollLog.value;
  const mine = activeCharacterId.value;
  const collapsed = rollLogCollapsed.value;

  return (
    <div class="vamp-roll-log">
      <div
        class={`vamp-roll-log__header ${collapsed ? '' : 'vamp-roll-log__header--open'}`}
        onClick={() => { rollLogCollapsed.value = !collapsed; }}
      >
        <span class="vamp-stat__name">Roll Log</span>
      </div>
      {!collapsed && (
        entries.length === 0
          ? <p class="vamp-roll-log__empty">No rolls yet.</p>
          : <ul class="vamp-roll-log__list">{entries.map((e, i) => <RollRow key={e.id} entry={e} mine={mine} index={i} />)}</ul>
      )}
    </div>
  );
}
