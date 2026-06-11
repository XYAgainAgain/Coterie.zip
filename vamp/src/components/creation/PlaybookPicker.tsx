import { useSignal } from '@preact/signals';
import { character, updateCharacter } from '../../state/character';
import { gameData, baaliGrantedBaneEntries } from '../../state/derived';
import { nextStep } from '../../state/creation';
import { BLANK_CHARACTER } from '../../state/persistence';
import type { Playbook } from '../../data/types';

export function PlaybookPicker() {
  const data = gameData.value;
  if (!data) return null;

  const expanded = useSignal<string | null>(null);
  const current = character.value.playbook;

  const clanPlaybooks = data.playbooks.filter(p => p.category === 'clan');
  const clanlessPlaybooks = data.playbooks.filter(p => p.category === 'clanless');

  function select(pb: Playbook) {
    if (pb.name === current) return;

    /* Reset downstream state when Playbook changes */
    updateCharacter({
      playbook: pb.name,
      archetypeName: '',
      stats: { ...BLANK_CHARACTER.stats },
      predatorType: '',
      unlockedDisciplines: [],
      startingDisciplines: [],
      knownPowers: [],
      knownProjectPowers: [],
      xpTriggers: [],
      merits: [],
      flaws: [],
      folkloricBanes: pb.name === 'Baali' ? baaliGrantedBaneEntries() : [],
      baneChoice: 'standard',
    });

    nextStep();
  }

  function renderCard(pb: Playbook) {
    const isSelected = pb.name === current;
    const isExpanded = expanded.value === pb.name;

    return (
      <div
        key={pb.name}
        class={`creation-card ${isSelected ? 'creation-card--selected' : ''}`}
        onClick={() => select(pb)}
      >
        <div class="creation-card__header">
          <span class="creation-card__name">{pb.name}</span>
          {isSelected && <span class="creation-card__check" aria-label="selected" />}
        </div>
        <div class="creation-card__tagline">{pb.tagline}</div>
        <button
          class="creation-card__expand"
          onClick={(e) => {
            e.stopPropagation();
            expanded.value = isExpanded ? null : pb.name;
          }}
        >
          {isExpanded ? 'Less' : 'More'}
        </button>
        {isExpanded && (
          <div class="creation-card__details">
            <p><strong>Disciplines:</strong> {pb.disciplines}</p>
            <p><strong>Bane:</strong> {pb.baneName}</p>
            {pb.compulsionName && (
              <p><strong>Compulsion:</strong> {pb.compulsionName}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div class="creation-picker">
      <h3 class="creation-picker__heading">Clan Playbooks</h3>
      <div class="creation-picker__grid">
        {clanPlaybooks.map(renderCard)}
      </div>
      <h3 class="creation-picker__heading">Clanless Playbooks</h3>
      <div class="creation-picker__grid">
        {clanlessPlaybooks.map(renderCard)}
      </div>
    </div>
  );
}
