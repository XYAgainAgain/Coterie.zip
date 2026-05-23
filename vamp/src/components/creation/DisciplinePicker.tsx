import { character, updateCharacter } from '../../state/character';
import { gameData, currentPlaybook } from '../../state/derived';
import { nextStep } from '../../state/creation';

export function DisciplinePicker() {
  const data = gameData.value;
  const pb = currentPlaybook.value;
  if (!data || !pb) return null;

  const selected = character.value.unlockedDisciplines;
  const config = getDisciplineConfig(pb, data.disciplines.map(d => d.slug));
  const grantedSlugs = config.options.filter(o => o.granted).map(o => o.slug);

  /* Auto-include granted Disciplines if not already selected */
  if (grantedSlugs.length > 0 && !grantedSlugs.every(s => selected.includes(s))) {
    const merged = [...new Set([...grantedSlugs, ...selected])];
    updateCharacter({ unlockedDisciplines: merged });
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

    if (current.length >= config.minRequired) {
      nextStep();
    }
  }

  return (
    <div class="creation-picker">
      <h3 class="creation-picker__heading">Starting Disciplines</h3>
      <p class="creation-picker__hint">{config.hint}</p>

      <div class="creation-picker__grid">
        {config.options.map(opt => {
          const disc = data.disciplines.find(d => d.slug === opt.slug);
          if (!disc) return null;

          const isSelected = selected.includes(opt.slug);
          const isGranted = opt.granted;
          const isLocked = !isSelected && !isGranted && selected.length >= config.maxPicks;

          return (
            <div
              key={opt.slug}
              class={`creation-card ${isSelected ? 'creation-card--selected' : ''} ${isLocked ? 'creation-card--locked' : ''} ${isGranted ? 'creation-card--granted' : ''}`}
              onClick={() => { if (!isLocked && !isGranted) toggle(opt.slug); }}
            >
              <div class="creation-card__header">
                <span class="creation-card__name">{disc.name}</span>
                {isSelected && <span class="creation-card__check" aria-label="selected" />}
              </div>
              {opt.granted && <div class="creation-card__badge">Granted</div>}
              {opt.exclusive && <div class="creation-card__badge">Exclusive</div>}
            </div>
          );
        })}
      </div>
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

/* Parses the Playbook's discipline string to determine available choices.
   Handles 6+ Clanless patterns (exclusive access, granted, choose-any, etc.) */
function getDisciplineConfig(
  pb: { name: string; disciplines: string; category: 'clan' | 'clanless' },
  allSlugs: string[],
): DisciplineConfig {
  const raw = pb.disciplines;
  const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

  /* Extract discipline names from markdown links and bold text */
  const linkedNames: string[] = [];
  for (const match of raw.matchAll(/\[([^\]]+)\]\([^)]+\)/g)) {
    linkedNames.push(match[1].replace(/\*\*/g, ''));
  }

  const exclusivePattern = /exclusive|only\s+you|unique/i;
  const hasExclusive = exclusivePattern.test(raw);

  /* "choose any N" pattern (Caitiff) */
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

  /* "granted"/"automatically receive" pattern (single given, choose 1 more) */
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

  /* Default: choose N from listed disciplines */
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
