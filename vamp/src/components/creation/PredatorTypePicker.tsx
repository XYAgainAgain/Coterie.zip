import { useSignal } from '@preact/signals';
import { character, updateCharacter } from '../../state/character';
import { gameData } from '../../state/derived';
import { nextStep } from '../../state/creation';

export function PredatorTypePicker() {
  const data = gameData.value;
  if (!data) return null;

  const filter = useSignal('');
  const current = character.value.predatorType;
  const ageBracket = character.value.ageBracket;

  const playbook = character.value.playbook;
  const canSkip = ageBracket === 'Fledgling'
    || playbook === 'Devorari' || playbook === 'Ghoul';

  const filtered = data.predatorTypes.filter(pt =>
    pt.name.toLowerCase().includes(filter.value.toLowerCase()),
  );

  function select(name: string) {
    updateCharacter({ predatorType: name });
    nextStep();
  }

  function skip() {
    updateCharacter({ predatorType: '' });
    nextStep();
  }

  return (
    <div class="creation-picker">
      <h3 class="creation-picker__heading">Predator Type</h3>

      <input
        class="creation-picker__filter"
        type="text"
        placeholder="Filter by name..."
        value={filter.value}
        onInput={(e) => { filter.value = (e.target as HTMLInputElement).value; }}
      />

      {canSkip && (
        <button class="creation-picker__skip" onClick={skip}>
          Skip (choose during play)
        </button>
      )}

      <div class="creation-picker__list">
        {filtered.map(pt => (
          <div
            key={pt.name}
            class={`creation-card ${pt.name === current ? 'creation-card--selected' : ''}`}
            onClick={() => select(pt.name)}
          >
            <div class="creation-card__header">
              <span class="creation-card__name">{pt.name}</span>
              {pt.name === current && <span class="creation-card__check" aria-label="selected" />}
            </div>
            <div class="creation-card__tagline">
              {pt.huntingStat} · {pt.discipline}
            </div>
            {pt.merit && <div class="creation-card__detail">Merit: {pt.merit}</div>}
            {pt.flaw && <div class="creation-card__detail">Flaw: {pt.flaw}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
