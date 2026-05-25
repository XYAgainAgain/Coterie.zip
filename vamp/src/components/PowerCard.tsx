/* Rendered markdown comes from Coterie's verified JSON parsers (trusted content) */

import { useSignal } from '@preact/signals';
import { renderGameMarkdown, resolveSnippetTokens, type SnippetContext } from '../data/transforms';
import { learnPower, unlearnPower, character } from '../state/character';
import { creationMode } from '../state/creation';
import { getSnippet, maxHP } from '../state/derived';
import type { PowerWithStatus } from '../state/derived';

export interface PowerBuyInfo {
  cost: number;
  onBuy: (powerName: string, level: number, disciplineSlug: string) => void;
  disciplineSlug: string;
}

const LEVEL_VARS = [
  '',
  'var(--v-lvl-1)',
  'var(--v-lvl-2)',
  'var(--v-lvl-3)',
  'var(--v-lvl-4)',
  'var(--v-lvl-5)',
];

export function PowerCard({ entry, atPickLimit, buyInfo }: {
  entry: PowerWithStatus;
  atPickLimit?: boolean;
  buyInfo?: PowerBuyInfo;
}) {
  const { power, status, lockReason } = entry;
  const isKnown = status === 'known';
  const rawSnippet = isKnown ? getSnippet('powers', power.name) : null;
  const char = character.value;
  const snippet = rawSnippet ? resolveSnippetTokens(rawSnippet, {
    blood: char.stats.Blood, shadow: char.stats.Shadow, resolve: char.stats.Resolve,
    wits: char.stats.Wits, demeanor: char.stats.Demeanor,
    bp: char.bp, humanity: char.humanity, maxHp: maxHP.value,
    patronBp: char.ghoulPatron?.bp ?? 0,
  }) : null;
  const expanded = useSignal(isKnown && !snippet);
  const isCreation = creationMode.value;
  const canToggle = isCreation && !buyInfo && (isKnown || (status === 'available' && !atPickLimit));
  const canBuy = buyInfo && status === 'available' && character.value.xp >= buyInfo.cost;

  function handleToggle(e: Event) {
    e.stopPropagation();
    if (isKnown) {
      unlearnPower(power.name);
    } else {
      learnPower(power.name);
      expanded.value = true;
    }
  }

  function handleBuy(e: Event) {
    e.stopPropagation();
    if (buyInfo && canBuy) {
      buyInfo.onBuy(power.name, power.level, buyInfo.disciplineSlug);
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
        {buyInfo && status === 'available' && (
          <button
            class="vamp-btn vamp-btn--sm vamp-btn--buy"
            disabled={!canBuy}
            onClick={handleBuy}
          >
            {buyInfo.cost} XP
          </button>
        )}
        <span class={`vamp-disc__bat vamp-disc__bat--sm ${expanded.value ? 'vamp-disc__bat--open' : ''}`} />
      </div>
      {/* Snippet for known Powers: compact quick-ref when collapsed. All content is from verified JSON parsers. */}
      {isKnown && snippet && !expanded.value && (
        <div class="vamp-power__body vamp-power__body--snippet"
          dangerouslySetInnerHTML={{ __html: renderGameMarkdown(snippet) }}
        />
      )}
      {expanded.value && (
        <div class="vamp-power__body"
          dangerouslySetInnerHTML={{ __html: renderGameMarkdown(power.body) }}
        />
      )}
    </div>
  );
}
