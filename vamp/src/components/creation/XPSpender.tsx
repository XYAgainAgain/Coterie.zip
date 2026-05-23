import { character } from '../../state/character';
import { gameData, currentPlaybook } from '../../state/derived';

export function XPSpender() {
  const data = gameData.value;
  const pb = currentPlaybook.value;
  if (!data || !pb) return null;

  const char = character.value;
  const bp = Math.max(1, char.bp);
  const baseXP = bp * 2;
  const meritFlawCap = 2 + bp;

  return (
    <div class="creation-picker">
      <h3 class="creation-picker__heading">Starting XP</h3>

      <div class="xp-spender">
        <div class="xp-spender__section">
          <h4 class="xp-spender__subheading">Earn XP</h4>
          <div class="xp-spender__base">
            Base: {baseXP} XP (BP {char.bp} x 2)
          </div>
          <p class="xp-spender__placeholder">
            Clan Bane Variant, Folkloric Banes, and Flaw selection will go here.
          </p>
        </div>

        <div class="xp-spender__section">
          <h4 class="xp-spender__subheading">Spend XP</h4>
          <p class="xp-spender__placeholder">
            Merits, Discipline Powers, additional Discipline access, stat boosts,
            Advanced Moves, and BP boost will go here.
          </p>
          <div class="xp-spender__cap">
            Merit + Flaw cap: {meritFlawCap} (2 + BP)
          </div>
        </div>

        <div class="xp-spender__total">
          Budget: {baseXP} | Spent: 0 | Remaining: {baseXP}
        </div>
      </div>
    </div>
  );
}
