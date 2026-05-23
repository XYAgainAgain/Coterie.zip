/* Rendered markdown comes from Coterie's verified JSON parsers (trusted content, duh) */

import { useSignal } from '@preact/signals';
import { renderGameMarkdown } from '../data/transforms';
import { learnPower, unlearnPower } from '../state/character';
import { creationMode } from '../state/creation';
import type { PowerWithStatus } from '../state/derived';

const LEVEL_VARS = [
  '',
  'var(--v-lvl-1)',
  'var(--v-lvl-2)',
  'var(--v-lvl-3)',
  'var(--v-lvl-4)',
  'var(--v-lvl-5)',
];

export function PowerCard({ entry, atPickLimit }: { entry: PowerWithStatus; atPickLimit?: boolean }) {
  const { power, status, lockReason } = entry;
  const expanded = useSignal(status === 'known');
  const isKnown = status === 'known';
  const isCreation = creationMode.value;
  const canToggle = isCreation && (isKnown || (status === 'available' && !atPickLimit));

  function handleToggle(e: Event) {
    e.stopPropagation();
    if (isKnown) {
      unlearnPower(power.name);
    } else {
      learnPower(power.name);
      expanded.value = true;
    }
  }

  return (
    <div class={`vamp-power vamp-power--${status}`}>
      <div class="vamp-power__header" onClick={() => { expanded.value = !expanded.value; }}>
        <span
          class="vamp-power__level"
          style={`background: ${LEVEL_VARS[power.level] ?? LEVEL_VARS[5]}`}
        >
          {power.level}
        </span>
        <span class="vamp-power__name">{power.name}</span>
        {power.tags.map(tag => (
          <span class="vamp-power__tag" key={tag}>{tag}</span>
        ))}
        {status === 'locked' && lockReason && (
          <span class="vamp-power__lock" title={lockReason} />
        )}
        {canToggle && (
          <button
            class={`vamp-btn vamp-btn--sm ${isKnown ? 'vamp-btn--unselect' : 'vamp-btn--select'}`}
            onClick={handleToggle}
          >
            {isKnown ? 'Unselect' : 'Select'}
          </button>
        )}
        <span class={`vamp-disc__bat vamp-disc__bat--sm ${expanded.value ? 'vamp-disc__bat--open' : ''}`} />
      </div>
      {expanded.value && (
        <div class="vamp-power__body"
          dangerouslySetInnerHTML={{ __html: renderGameMarkdown(power.body) }}
        />
      )}
    </div>
  );
}
