import { RulesPanel } from '../../right-panel/RulesPanel';

/* The full How-to-Coterie rules, rendered exactly as the player sheet's right-panel Rules
   tab (same component, same rulesCache source). Scrolls within the tile. */
export function QuickRefTile() {
  return (
    <div class="vamp-st-quickref">
      <RulesPanel />
    </div>
  );
}
