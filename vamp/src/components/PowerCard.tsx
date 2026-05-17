/* Rendered markdown comes from Coterie's verified JSON parsers (trusted content, duh) */

import { useSignal } from '@preact/signals';
import { renderGameMarkdown } from '../data/transforms';
import type { PowerWithStatus } from '../state/derived';

const LEVEL_VARS = [
  '',
  'var(--v-lvl-1)',
  'var(--v-lvl-2)',
  'var(--v-lvl-3)',
  'var(--v-lvl-4)',
  'var(--v-lvl-5)',
];

export function PowerCard({ entry }: { entry: PowerWithStatus }) {
  const { power, status, lockReason } = entry;
  const expanded = useSignal(status === 'known');

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
        <span class={`vamp-power__chevron ${expanded.value ? 'vamp-power__chevron--open' : ''}`}>&#9662;</span>
      </div>
      {expanded.value && (
        <div class="vamp-power__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(power.body) }} />
      )}
    </div>
  );
}
