import { character, updateCharacter } from '../../state/character';
import { gameData } from '../../state/derived';
import { nextStep } from '../../state/creation';

function filterAgeBrackets(brackets: { name: string }[], playbook: string): { name: string }[] {
  const isSemimortalOnly = playbook === 'Ghoul' || playbook === 'Thin-Blood';
  const hasPlaybook = playbook !== '';

  if (isSemimortalOnly) return brackets.filter(b => b.name === 'Semimortal');
  if (hasPlaybook) return brackets.filter(b => b.name !== 'Semimortal');
  return brackets;
}

export function AgePicker() {
  const data = gameData.value;
  if (!data) return null;

  const current = character.value.ageBracket;
  const available = filterAgeBrackets(data.ageBrackets, character.value.playbook);

  function select(name: string, bp: number, humanity: number) {
    updateCharacter({
      ageBracket: name,
      bp,
      humanity,
      xp: Math.min(10, Math.max(1, bp) * 2),
      predatorType: '',
    });
    nextStep();
  }

  return (
    <div class="creation-picker">
      <h3 class="creation-picker__heading">Age Bracket</h3>
      <div class="creation-picker__grid">
        {available.map(ab => {
          const full = data.ageBrackets.find(b => b.name === ab.name)!;
          const h = parseHumanity(full.startingHumanity);
          return (
            <div
              key={full.name}
              class={`creation-card ${full.name === current ? 'creation-card--selected' : ''}`}
              onClick={() => select(full.name, full.startingBloodPotency, h)}
            >
              <div class="creation-card__header">
                <span class="creation-card__name">{full.name}</span>
                {full.name === current && <span class="creation-card__check" aria-label="selected" />}
              </div>
              <div class="creation-card__tagline">
                BP {full.startingBloodPotency} · Humanity {full.startingHumanity}
              </div>
              <div class="creation-card__tagline">{full.embraced}</div>
              {full.narrativeFeel && (
                <div class="creation-card__details" style={{ marginTop: '0.5rem' }}>
                  {full.narrativeFeel}
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
