import { useSignal } from '@preact/signals';
import { character, updateCharacter } from '../../state/character';
import { currentPlaybook } from '../../state/derived';
import { nextStep } from '../../state/creation';
import { STAT_NAMES, type StatName } from '../../data/types';

export function ArchetypePicker() {
  const pb = currentPlaybook.value;
  if (!pb) return null;

  const current = character.value.archetypeName;
  const isCustom = current === 'Custom';

  function selectPreset(name: string, statStr: string) {
    const stats = parseStatLine(statStr);
    updateCharacter({ archetypeName: name, stats });
    nextStep();
  }

  function selectCustom() {
    updateCharacter({
      archetypeName: 'Custom',
      stats: { Blood: NaN, Shadow: NaN, Resolve: NaN, Demeanor: NaN, Wits: NaN },
    });
  }

  return (
    <div class="creation-picker">
      <h3 class="creation-picker__heading">Archetype</h3>
      <div class="creation-picker__grid">
        {pb.archetypes.map(arch => (
          <div
            key={arch.name}
            class={`creation-card ${arch.name === current ? 'creation-card--selected' : ''}`}
            onClick={() => selectPreset(arch.name, arch.stats)}
          >
            <div class="creation-card__header">
              <span class="creation-card__name">{arch.name}</span>
              {arch.name === current && <span class="creation-card__check" aria-label="selected" />}
            </div>
            <div class="creation-card__tagline">{arch.tagline}</div>
            <div class="creation-card__stats">{arch.stats}</div>
          </div>
        ))}

        <div
          class={`creation-card ${isCustom ? 'creation-card--selected' : ''}`}
          onClick={selectCustom}
        >
          <div class="creation-card__header">
            <span class="creation-card__name">Custom</span>
            {isCustom && <span class="creation-card__check" aria-label="selected" />}
          </div>
          <div class="creation-card__tagline">Assign {pb.customStatSpread} yourself</div>
        </div>
      </div>

      {isCustom && <CustomAllocator spread={pb.customStatSpread} />}
    </div>
  );
}

function CustomAllocator({ spread }: { spread: string }) {
  const pool = parseSpread(spread);
  const stats = character.value.stats;
  const assigned = useSignal<Record<StatName, number | null>>(
    Object.fromEntries(STAT_NAMES.map(s => [s, isNaN(stats[s]) ? null : stats[s]])) as Record<StatName, number | null>,
  );

  function getAvailable(): number[] {
    const usedValues = Object.values(assigned.value).filter((a): a is number => a !== null);
    const poolCopy = [...pool];
    for (const u of usedValues) {
      const idx = poolCopy.indexOf(u);
      if (idx >= 0) poolCopy.splice(idx, 1);
    }
    return poolCopy;
  }

  /* Only write to character state once all 5 stats are assigned.
     Partial writes would trigger a re-render that remounts this component. */
  function assign(stat: StatName, value: number | null) {
    const next = { ...assigned.value, [stat]: value };
    assigned.value = next;

    if (STAT_NAMES.every(s => next[s] !== null)) {
      const finalStats = Object.fromEntries(
        STAT_NAMES.map(s => [s, next[s] as number]),
      ) as Record<StatName, number>;
      updateCharacter({ stats: finalStats });
      nextStep();
    }
  }

  const available = getAvailable();

  return (
    <div class="custom-allocator">
      {STAT_NAMES.map(stat => {
        const val = assigned.value[stat];
        return (
          <div key={stat} class="custom-allocator__row">
            <span class="custom-allocator__label">{stat}</span>
            <select
              class="custom-allocator__select"
              value={val === null ? '' : String(val)}
              onChange={(e) => {
                const raw = (e.target as HTMLSelectElement).value;
                assign(stat, raw === '' ? null : Number(raw));
              }}
            >
              <option value="">--</option>
              {val !== null && !available.includes(val) && <option value={String(val)}>{formatStat(val)}</option>}
              {available.map((v, i) => (
                <option key={`${v}-${i}`} value={String(v)}>{formatStat(v)}</option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function formatStat(n: number): string {
  if (n > 0) return `+${n}`;
  if (n === 0) return '+0';
  return String(n);
}

/* "+2 | +1 | +1 | +0 | -1" → [2, 1, 1, 0, -1] */
function parseSpread(s: string): number[] {
  return s.split('|').map(p => {
    const cleaned = p.trim().replace(/[+−]/g, m => m === '+' ? '+' : '-');
    return parseInt(cleaned, 10);
  }).filter(n => !isNaN(n));
}

/* "Blood +1 | Shadow +2 | ..." → Record<StatName, number> */
function parseStatLine(s: string): Record<StatName, number> {
  const result: Record<string, number> = {};
  for (const segment of s.split('|')) {
    const trimmed = segment.trim();
    const match = trimmed.match(/^(\w+)\s+([+\-−]?\d+)$/);
    if (match) {
      const val = match[2].replace('−', '-');
      result[match[1]] = parseInt(val, 10);
    }
  }
  return result as Record<StatName, number>;
}
