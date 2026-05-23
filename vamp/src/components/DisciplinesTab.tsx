import { useSignal } from '@preact/signals';
import { accessibleDisciplineData, getPowerStatus, gameData, currentPlaybook, currentPredatorType, effectiveDisciplineBP } from '../state/derived';
import { character, updateCharacter } from '../state/character';
import { creationMode, creationStep } from '../state/creation';
import { PowerCard } from './PowerCard';
import { renderGameMarkdown } from '../data/transforms';
import type { Discipline } from '../data/types';

/* All rendered markdown is from Coterie's verified JSON parsers (trusted content) */

function DisciplineSection({ discipline, creationToggle, maxFreePowers, hasOverlapBonus }: {
  discipline: Discipline;
  creationToggle?: { selected: boolean; granted: boolean; disabled: boolean; onToggle: () => void };
  maxFreePowers?: number;
  hasOverlapBonus?: boolean;
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
  const atPickLimit = isCreation && maxFreePowers != null && known.length >= maxFreePowers;

  /* Per-level pick tracking: 1 Power per accessible level, overlap bonus allows 1 extra at any level */
  const filledLevels = new Map<number, number>();
  for (const k of known) {
    filledLevels.set(k.power.level, (filledLevels.get(k.power.level) ?? 0) + 1);
  }
  const overlapBonusUsed = hasOverlapBonus
    ? [...filledLevels.values()].some(count => count > 1)
    : true;

  function isLevelFull(level: number): boolean {
    if (!isCreation) return false;
    const count = filledLevels.get(level) ?? 0;
    if (count === 0) return false;
    if (count >= 2) return true;
    if (hasOverlapBonus && !overlapBonusUsed) return false;
    return true;
  }

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
                <PowerCard
                  key={entry.power.name}
                  entry={entry}
                  atPickLimit={atPickLimit || isLevelFull(entry.power.level)}
                />
              ))}
            </div>
          )}

          {isCreation && maxFreePowers != null && (
            <div class={`vamp-disc__pick-count ${atPickLimit ? 'vamp-disc__pick-count--full' : ''}`}>
              {known.length}/{maxFreePowers} free Powers selected
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
  patronPlaybook?: { name: string; disciplines: string; category: 'clan' | 'clanless' } | null,
): DisciplineConfig {
  const raw = pb.disciplines;
  const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

  /* Ghoul: resolve Disciplines from patron's Playbook */
  if (pb.name === 'Ghoul') {
    if (!patronPlaybook) {
      return { options: [], minRequired: 1, maxPicks: 1, hint: 'Select a patron first' };
    }
    const patronConfig = getDisciplineConfig(patronPlaybook, allSlugs);
    const patronSlugs = patronConfig.options.map(o => o.slug);
    return {
      options: patronSlugs.map(s => ({ slug: s, exclusive: false, granted: false })),
      minRequired: 1,
      maxPicks: 1,
      hint: `Choose 1 from your patron's Disciplines (${patronPlaybook.name})`,
    };
  }

  /* Thin-Blood: exclusive Thin-Blood Alchemy, no creation picks needed */
  if (pb.name === 'Thin-Blood') {
    const tbaSlug = slugify('Thin-Blood Alchemy');
    return {
      options: [{ slug: tbaSlug, exclusive: true, granted: true }],
      minRequired: 0,
      maxPicks: 0,
      hint: 'Thin-Blood Alchemy is granted exclusively. Other Disciplines can be temporarily accessed through Vitae in play.',
    };
  }

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
  const char = character.value;
  if (!data || !pb) return <div class="vamp-placeholder">Select a Playbook first</div>;

  const allSlugs = data.disciplines.map(d => d.slug);

  /* Resolve Ghoul patron's Playbook for Discipline lookup */
  let patronPb: typeof pb | null = null;
  if (pb.name === 'Ghoul' && char.ghoulPatron?.bloodline) {
    patronPb = data.playbooks.find(p => p.name === char.ghoulPatron!.bloodline) ?? null;
  }

  const config = getDisciplineConfig(pb, allSlugs, patronPb);

  if (pb.name === 'Ghoul' && !patronPb) {
    return (
      <div class="vamp-disc-list">
        <div class="vamp-disc-creation__hint">
          Choose a patron bloodline first (in the Playbook step) to see available Disciplines.
        </div>
      </div>
    );
  }

  const selected = char.unlockedDisciplines;
  const grantedSlugs = config.options.filter(o => o.granted).map(o => o.slug);

  /* Resolve Predator Type discipline (Ghouls don't get one) */
  let ptSlug: string | null = null;
  let ptOverlaps = false;
  if (pt && pb.name !== 'Ghoul') {
    const ptDisc = data.disciplines.find(
      d => d.name.toLowerCase() === pt.discipline.toLowerCase()
    );
    if (ptDisc) {
      ptSlug = ptDisc.slug;
      ptOverlaps = config.options.some(o => o.slug === ptSlug);
    }
  }

  /* Combine granted slugs: Playbook granted + PT granted (if not overlapping) */
  const allGranted = [...grantedSlugs];
  if (ptSlug && !ptOverlaps) allGranted.push(ptSlug);

  /* Auto-include all granted Disciplines */
  if (allGranted.length > 0 && !allGranted.every(s => selected.includes(s))) {
    const merged = [...new Set([...allGranted, ...selected])];
    updateCharacter({ unlockedDisciplines: merged });
  }

  /* Build the full options list: Playbook options + PT discipline if it doesn't overlap */
  const displayOptions = [...config.options];
  if (ptSlug && !ptOverlaps && !displayOptions.some(o => o.slug === ptSlug)) {
    displayOptions.push({ slug: ptSlug, exclusive: false, granted: true });
  }

  function toggle(slug: string) {
    if (allGranted.includes(slug)) return;
    const current = [...selected];
    const idx = current.indexOf(slug);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      if (current.length >= config.maxPicks + (ptSlug && !ptOverlaps ? 1 : 0)) return;
      current.push(slug);
    }
    updateCharacter({ unlockedDisciplines: current, knownPowers: [] });
  }

  return (
    <div class="vamp-disc-list">
      <div class="vamp-disc-creation__hint">{config.hint}</div>
      {ptSlug && !ptOverlaps && (
        <div class="vamp-disc-creation__hint">
          Your Predator Type also grants access to {pt!.discipline}. It appears below as granted.
        </div>
      )}
      {ptSlug && ptOverlaps && (
        <div class="vamp-disc-creation__hint">
          Your Predator Type's Discipline ({pt!.discipline}) overlaps with your starting options. Pick an extra free Power of any level you can access!
        </div>
      )}
      {displayOptions.map(opt => {
        const disc = data.disciplines.find(d => d.slug === opt.slug);
        if (!disc) return null;
        const isGranted = allGranted.includes(opt.slug);
        const isSelected = selected.includes(opt.slug);
        const userPickCount = selected.filter(s => !allGranted.includes(s)).length;
        const atMax = userPickCount >= config.maxPicks && !isSelected && !isGranted;
        const discBP = effectiveDisciplineBP.value;
        const overlapBonus = ptSlug === opt.slug && ptOverlaps;
        const freePowers = discBP + (overlapBonus ? 1 : 0);

        return (
          <DisciplineSection
            key={disc.slug}
            discipline={disc}
            maxFreePowers={freePowers}
            hasOverlapBonus={overlapBonus}
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
        {selected.filter(s => !allGranted.includes(s)).length}/{config.minRequired} selected
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
