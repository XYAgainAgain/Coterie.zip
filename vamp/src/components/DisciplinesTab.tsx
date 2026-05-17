import { useSignal } from '@preact/signals';
import { accessibleDisciplineData, getPowerStatus } from '../state/derived';
import { PowerCard } from './PowerCard';
import type { Discipline } from '../data/types';

function DisciplineSection({ discipline }: { discipline: Discipline }) {
  const expanded = useSignal(true);
  const showAvailable = useSignal(false);
  const showLocked = useSignal(false);

  const powers = discipline.powers.map(p => getPowerStatus(p, discipline.slug));
  const known = powers.filter(p => p.status === 'known');
  const available = powers.filter(p => p.status === 'available');
  const locked = powers.filter(p => p.status === 'locked');

  return (
    <div class="vamp-disc">
      <div class="vamp-disc__header" onClick={() => { expanded.value = !expanded.value; }}>
        <span class="vamp-disc__name">{discipline.name}</span>
        <span class="vamp-disc__count">
          {known.length}/{powers.length}
        </span>
        <span class={`vamp-disc__chevron ${expanded.value ? 'vamp-disc__chevron--open' : ''}`}>&#9662;</span>
      </div>

      {expanded.value && (
        <div class="vamp-disc__body">
          {discipline.perk && (
            <div class="vamp-disc__perk-ref">
              Perk: <strong>{discipline.perk.name}</strong>
              <span class="vamp-disc__perk-note"> (see Vitals tab)</span>
            </div>
          )}

          {known.length > 0 && (
            <div class="vamp-disc__group">
              <div class="vamp-disc__group-label">Known</div>
              {known.map(entry => (
                <PowerCard key={entry.power.name} entry={entry} />
              ))}
            </div>
          )}

          {available.length > 0 && (
            <div class="vamp-disc__group">
              <button
                class="vamp-disc__group-toggle"
                onClick={() => { showAvailable.value = !showAvailable.value; }}
              >
                Available ({available.length})
                <span class={`vamp-disc__toggle-chevron ${showAvailable.value ? 'vamp-disc__toggle-chevron--open' : ''}`}>&#9662;</span>
              </button>
              {showAvailable.value && available.map(entry => (
                <PowerCard key={entry.power.name} entry={entry} />
              ))}
            </div>
          )}

          {locked.length > 0 && (
            <div class="vamp-disc__group">
              <button
                class="vamp-disc__group-toggle vamp-disc__group-toggle--locked"
                onClick={() => { showLocked.value = !showLocked.value; }}
              >
                Locked ({locked.length})
                <span class={`vamp-disc__toggle-chevron ${showLocked.value ? 'vamp-disc__toggle-chevron--open' : ''}`}>&#9662;</span>
              </button>
              {showLocked.value && locked.map(entry => (
                <PowerCard key={entry.power.name} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DisciplinesTab() {
  const disciplines = accessibleDisciplineData.value;

  if (disciplines.length === 0) {
    return <div class="vamp-placeholder">No Disciplines available</div>;
  }

  return (
    <div class="vamp-disc-list">
      {disciplines.map(d => (
        <DisciplineSection key={d.slug} discipline={d} />
      ))}
    </div>
  );
}
