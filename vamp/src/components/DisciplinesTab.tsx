import { useSignal } from '@preact/signals';
import { accessibleDisciplineData, getPowerStatus, gameData, currentPlaybook, currentPredatorType } from '../state/derived';
import { character, updateCharacter } from '../state/character';
import { creationMode, creationStep } from '../state/creation';
import { PowerCard } from './PowerCard';
import { renderGameMarkdown } from '../data/transforms';
import type { Discipline } from '../data/types';

/* All rendered markdown is from Coterie's verified JSON parsers (trusted content) */

function DisciplineSection({ discipline, creationToggle }: {
  discipline: Discipline;
  creationToggle?: { selected: boolean; granted: boolean; disabled: boolean; onToggle: () => void };
}) {
  const isCreation = !!creationToggle;
  const isSelected = creationToggle?.selected ?? false;
  const expanded = useSignal(isCreation);
  const showAvailable = useSignal(isCreation && isSelected);
  const showLocked = useSignal(false);

  const powers = discipline.powers.map(p => getPowerStatus(p, discipline.slug));
  const known = powers.filter(p => p.status === 'known');
  const available = powers.filter(p => p.status === 'available');
  const locked = powers.filter(p => p.status === 'locked');

  return (
    <div class={`vamp-disc ${isSelected ? 'vamp-disc--selected' : ''}`}>
      <div class="vamp-disc__header" onClick={() => { expanded.value = !expanded.value; }}>
        <span class={`vamp-disc__bat ${expanded.value ? 'vamp-disc__bat--open' : ''}`} />
        <span class="vamp-disc__name">{discipline.name}</span>
        {creationToggle ? (
          creationToggle.granted ? (
            <span class="vamp-disc__badge vamp-disc__badge--granted">Granted</span>
          ) : (
            <button
              class={`vamp-btn vamp-btn--sm ${isSelected ? 'vamp-btn--unselect' : 'vamp-btn--select'}`}
              disabled={creationToggle.disabled}
              onClick={(e) => {
                e.stopPropagation();
                creationToggle.onToggle();
                if (!isSelected) { expanded.value = true; showAvailable.value = true; }
              }}
            >
              {isSelected ? 'Unselect' : 'Select'}
            </button>
          )
        ) : (
          <span class="vamp-disc__count">{known.length}/{powers.length}</span>
        )}
      </div>

      {expanded.value && (
        <div class="vamp-disc__body">
          {isCreation && discipline.intro && (
            <div class="vamp-disc__intro"
              dangerouslySetInnerHTML={{ __html: renderGameMarkdown(discipline.intro) }}
            />
          )}

          {discipline.perk && (
            isCreation ? (
              <div class="vamp-disc__perk-full">
                <div class="vamp-disc__perk-label">Perk: <strong>{discipline.perk.name}</strong></div>
                <div class="vamp-disc__perk-body"
                  dangerouslySetInnerHTML={{ __html: renderGameMarkdown(discipline.perk.body) }}
                />
              </div>
            ) : (
              <div class="vamp-disc__perk-ref">
                Perk: <strong>{discipline.perk.name}</strong>
                <span class="vamp-disc__perk-note"> (see Vitals tab)</span>
              </div>
            )
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
                <span class={`vamp-disc__bat vamp-disc__bat--sm ${showAvailable.value ? 'vamp-disc__bat--open' : ''}`} />
                Available ({available.length})
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
                <span class={`vamp-disc__bat vamp-disc__bat--sm ${showLocked.value ? 'vamp-disc__bat--open' : ''}`} />
                Locked ({locked.length})
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

interface DisciplineOption {
  slug: string;
  exclusive: boolean;
  granted: boolean;
}

interface DisciplineConfig {
  options: DisciplineOption[];
  minRequired: number;
  maxPicks: number;
  hint: string;
}

function getDisciplineConfig(
  pb: { name: string; disciplines: string; category: 'clan' | 'clanless' },
  allSlugs: string[],
): DisciplineConfig {
  const raw = pb.disciplines;
  const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

  const linkedNames: string[] = [];
  for (const match of raw.matchAll(/\[([^\]]+)\]\([^)]+\)/g)) {
    linkedNames.push(match[1].replace(/\*\*/g, ''));
  }

  const exclusivePattern = /exclusive|only\s+you|unique/i;
  const hasExclusive = exclusivePattern.test(raw);

  const anyMatch = raw.match(/choose\s+any\s+(\d+)/i);
  if (anyMatch) {
    const count = parseInt(anyMatch[1], 10);
    return {
      options: allSlugs.map(s => ({ slug: s, exclusive: false, granted: false })),
      minRequired: count,
      maxPicks: count,
      hint: `Choose any ${count} Disciplines`,
    };
  }

  if (/granted|automatically\s+receive/i.test(raw) && linkedNames.length >= 1) {
    const grantedSlug = slugify(linkedNames[0]);
    const options = linkedNames.map(n => ({
      slug: slugify(n),
      exclusive: hasExclusive && !allSlugs.includes(slugify(n)),
      granted: slugify(n) === grantedSlug,
    }));
    return {
      options,
      minRequired: 2,
      maxPicks: 2,
      hint: `${linkedNames[0]} is granted. Choose 1 more.`,
    };
  }

  const chooseMatch = raw.match(/choose\s+(\d+)/i);
  const count = chooseMatch ? parseInt(chooseMatch[1], 10) : 2;

  const options = linkedNames.map(n => ({
    slug: slugify(n),
    exclusive: false,
    granted: false,
  }));

  return {
    options: options.length > 0 ? options : allSlugs.map(s => ({ slug: s, exclusive: false, granted: false })),
    minRequired: count,
    maxPicks: count,
    hint: `Choose ${count} to start`,
  };
}

function CreationDisciplineList() {
  const data = gameData.value;
  const pb = currentPlaybook.value;
  const pt = currentPredatorType.value;
  if (!data || !pb) return <div class="vamp-placeholder">Select a Playbook first</div>;

  const config = getDisciplineConfig(pb, data.disciplines.map(d => d.slug));
  const selected = character.value.unlockedDisciplines;
  const grantedSlugs = config.options.filter(o => o.granted).map(o => o.slug);

  if (grantedSlugs.length > 0 && !grantedSlugs.every(s => selected.includes(s))) {
    const merged = [...new Set([...grantedSlugs, ...selected])];
    updateCharacter({ unlockedDisciplines: merged });
  }

  let ptSlug: string | null = null;
  let ptOverlaps = false;
  if (pt) {
    const ptDisc = data.disciplines.find(
      d => d.name.toLowerCase() === pt.discipline.toLowerCase()
    );
    if (ptDisc) {
      ptSlug = ptDisc.slug;
      ptOverlaps = config.options.some(o => o.slug === ptSlug);
    }
  }

  function toggle(slug: string) {
    if (grantedSlugs.includes(slug)) return;
    const current = [...selected];
    const idx = current.indexOf(slug);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      if (current.length >= config.maxPicks) return;
      current.push(slug);
    }
    updateCharacter({ unlockedDisciplines: current, knownPowers: [] });
  }

  return (
    <div class="vamp-disc-list">
      <div class="vamp-disc-creation__hint">{config.hint}</div>
      {ptSlug && !ptOverlaps && (
        <div class="vamp-disc-creation__hint">
          Your Predator Type also grants {pt!.discipline}.
        </div>
      )}
      {ptSlug && ptOverlaps && (
        <div class="vamp-disc-creation__hint">
          Your Predator Type's Discipline ({pt!.discipline}) overlaps with your starting options; pick another free {pt!.discipline} Power of any level you can access!
        </div>
      )}
      {config.options.map(opt => {
        const disc = data.disciplines.find(d => d.slug === opt.slug);
        if (!disc) return null;
        const isSelected = selected.includes(opt.slug);
        const isGranted = opt.granted;
        const atMax = selected.length >= config.maxPicks && !isSelected;

        return (
          <DisciplineSection
            key={disc.slug}
            discipline={disc}
            creationToggle={{
              selected: isSelected || isGranted,
              granted: isGranted,
              disabled: atMax,
              onToggle: () => toggle(opt.slug),
            }}
          />
        );
      })}
      <div class="vamp-disc-creation__count">
        {selected.length}/{config.minRequired} selected
      </div>
    </div>
  );
}

export function DisciplinesTab() {
  const creating = creationMode.value && creationStep.value === 'disciplines';

  if (creating) return <CreationDisciplineList />;

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
