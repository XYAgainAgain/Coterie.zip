import { activeCoterie, activeCharacterId } from '../../../state/persistence';
import { coterieState } from '../../../state/coterie';
import { rollLog } from '../../../dice/rollLog';
import { RollLogList } from '../../RollLog';

/* Read-only view of the Coterie's shared dice log (the same list the player sheet shows),
   falling back to the local log if no Coterie is loaded. */
export function RollLogTile() {
  const entries = activeCoterie.value ? coterieState.value.diceRolls : rollLog.value;
  return (
    <div class="vamp-st-rolllog">
      <RollLogList entries={entries} mine={activeCharacterId.value} />
    </div>
  );
}
