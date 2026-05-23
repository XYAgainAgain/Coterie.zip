import { character, updateCharacter } from '../../state/character';
import { gameData } from '../../state/derived';
import { nextStep } from '../../state/creation';

export function AgePicker() {
  const data = gameData.value;
  if (!data) return null;

  const current = character.value.ageBracket;

  function select(name: string, bp: number, humanity: number) {
    updateCharacter({
      ageBracket: name,
      bp,
      humanity,
      predatorType: '',
    });
    nextStep();
  }

  return (
    <div class="creation-picker">
      <h3 class="creation-picker__heading">Age Bracket</h3>
      <div class="creation-picker__grid">
        {data.ageBrackets.map(ab => {
          const h = parseHumanity(ab.startingHumanity);
          return (
            <div
              key={ab.name}
              class={`creation-card ${ab.name === current ? 'creation-card--selected' : ''}`}
              onClick={() => select(ab.name, ab.startingBloodPotency, h)}
            >
              <div class="creation-card__header">
                <span class="creation-card__name">{ab.name}</span>
                {ab.name === current && <span class="creation-card__check" aria-label="selected" />}
              </div>
              <div class="creation-card__tagline">
                BP {ab.startingBloodPotency} · Humanity {ab.startingHumanity}
              </div>
              <div class="creation-card__tagline">{ab.embraced}</div>
              {ab.narrativeFeel && (
                <div class="creation-card__details" style={{ marginTop: '0.5rem' }}>
                  {ab.narrativeFeel}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Ranges like "7-8" resolve to the higher value (player chooses during play). */
function parseHumanity(s: string): number {
  const parts = s.split(/[^0-9]+/).map(Number).filter(n => !isNaN(n));
  return parts.length > 0 ? Math.max(...parts) : 7;
}
