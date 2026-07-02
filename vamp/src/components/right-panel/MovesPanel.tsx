/* All rendered markdown is from Coterie's verified JSON parsers (trusted content, duh) */

import { useRef } from 'preact/hooks';
import { useSignal, useSignalEffect } from '@preact/signals';
import { scrollToMove } from '../../state/panel';
import { gameData } from '../../state/derived';
import { character, updateCharacter, buyAdvancedMove } from '../../state/character';
import { editMode } from '../../state/ui';
import { renderGameMarkdown, capitalizeFirst } from '../../data/transforms';
import type { BasicMove, StandardMove, BlushOfLife } from '../../data/types';

function formatRollStat(raw: string): string {
  if (raw.toLowerCase().includes('dictated by your predator type')) {
    return 'per Pred. Type (else +Blood)';
  }
  return raw;
}

function tierClass(tier: string): string {
  if (tier.startsWith('12')) return 'vamp-move-tier--12';
  if (tier.startsWith('10')) return 'vamp-move-tier--10';
  if (tier.startsWith('7')) return 'vamp-move-tier--7';
  if (tier.startsWith('6')) return 'vamp-move-tier--6';
  return '';
}

function tierLabel(tier: string): string {
  if (tier.startsWith('12')) return `Advanced: ${tier}`;
  return `On a ${tier}`;
}

const BLUSH_COLORS = ['#e8a0b0', '#d8a0b8', '#c8a4c0', '#b8a8c0', '#a8acc0', '#a0b0c8', '#c8c8d0'];

function MoveSection({ move, expanded, onToggle, sectionRef, isAdvanced, onBuy, onAdd }: {
  move: BasicMove;
  expanded: boolean;
  onToggle: () => void;
  sectionRef?: (el: HTMLElement | null) => void;
  isAdvanced: boolean;
  onBuy?: () => void;
  onAdd?: () => void;
}) {
  const isBlush = move.type === 'blush-of-life';
  const std = isBlush ? null : move as StandardMove;
  const blush = isBlush ? move as BlushOfLife : null;

  return (
    <div class={`vamp-move-section ${expanded ? 'vamp-move-section--open' : ''}`} ref={sectionRef}>
      <div class="vamp-move-section__bar" onClick={onToggle}>
        <span class={`vamp-move-section__name ${isAdvanced ? 'vamp-move-section__name--advanced' : ''}`}>{move.name}</span>
        {std?.rollStat && <span class="vamp-move-section__badge">{formatRollStat(std.rollStat)}</span>}
        {isBlush && <span class="vamp-move-section__badge">Special</span>}
        {!isAdvanced && onBuy && (
          <button class="vamp-btn vamp-btn--sm vamp-btn--buy vamp-move-section__buy"
            disabled={character.value.xp < 5}
            onClick={(e) => { e.stopPropagation(); onBuy(); }}
          >BUY (5 XP)</button>
        )}
        {!isAdvanced && onAdd && (
          <button class="vamp-btn vamp-btn--sm vamp-move-section__add"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
          >ADD (via ST)</button>
        )}
      </div>

      {expanded && (
        <div class="vamp-move-section__body">
          <div class="vamp-rpanel-field">
            <span class="vamp-rpanel-field__label">Trigger</span>
            <div class="vamp-rpanel-field__value"><strong>{move.trigger}</strong></div>
          </div>

          {std?.rollStat && (
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Roll Stat</span>
              <div class="vamp-rpanel-field__value vamp-rpanel-field__value--accent">{formatRollStat(std.rollStat)}</div>
            </div>
          )}

          {std?.statOptions && (
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Stat Options</span>
              <ul class="vamp-rpanel-field__list">
                {std.statOptions.map((opt, i) => (
                  <li key={i} dangerouslySetInnerHTML={{ __html: renderGameMarkdown(opt) }} />
                ))}
              </ul>
            </div>
          )}

          {std?.outcomes && std.outcomes.map(o => {
            const is12 = o.tier.startsWith('12');
            const locked12 = is12 && !isAdvanced;
            return (
              <div class={`vamp-move-tier ${tierClass(o.tier)} ${locked12 ? 'vamp-move-tier--locked' : ''}`} key={o.tier}>
                <div class="vamp-move-tier__label">
                  {tierLabel(o.tier)}
                  {locked12 && <span class="vamp-move-tier__lock-note"> (requires Advancement)</span>}
                </div>
                <div
                  class="vamp-move-tier__content"
                  dangerouslySetInnerHTML={{ __html: renderGameMarkdown(capitalizeFirst(o.content)) }}
                />
              </div>
            );
          })}

          {blush && blush.humanityThresholds.map((t, i) => (
            <div
              class="vamp-move-tier vamp-move-tier--blush"
              key={t.threshold}
              style={{ borderLeftColor: BLUSH_COLORS[i] ?? BLUSH_COLORS[BLUSH_COLORS.length - 1] }}
            >
              <div class="vamp-move-tier__label" style={{ color: BLUSH_COLORS[i] ?? BLUSH_COLORS[BLUSH_COLORS.length - 1] }}>
                {t.threshold}
              </div>
              <div
                class="vamp-move-tier__content"
                dangerouslySetInnerHTML={{ __html: renderGameMarkdown(capitalizeFirst(t.description)) }}
              />
            </div>
          ))}

          {blush?.advanced && (
            <div class={`vamp-move-tier vamp-move-tier--12 ${!isAdvanced ? 'vamp-move-tier--locked' : ''}`}>
              <div class="vamp-move-tier__label">
                Advanced: 12+
                {!isAdvanced && <span class="vamp-move-tier__lock-note"> (requires Advancement)</span>}
              </div>
              <div
                class="vamp-move-tier__content"
                dangerouslySetInnerHTML={{ __html: renderGameMarkdown(capitalizeFirst(blush.advanced)) }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MovesPanel() {
  const data = gameData.value;
  const moves = data?.basicMoves ?? [];
  const expandedMove = useSignal<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useSignalEffect(() => {
    const target = scrollToMove.value;
    if (!target) return;
    scrollToMove.value = null;
    expandedMove.value = target;
    requestAnimationFrame(() => {
      const el = sectionRefs.current[target];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  function toggle(name: string) {
    expandedMove.value = expandedMove.value === name ? null : name;
  }

  const isEdit = editMode.value;
  const char = character.value;

  function addAdvancedMove(name: string) {
    const cur = character.value;
    if (cur.advancedMoves.includes(name)) return;
    updateCharacter({ advancedMoves: [...cur.advancedMoves, name] });
  }

  return (
    <div class="vamp-rpanel-scroll" ref={scrollRef}>
      {moves.map(m => (
        <MoveSection
          key={m.name}
          move={m}
          expanded={expandedMove.value === m.name}
          onToggle={() => toggle(m.name)}
          sectionRef={el => { sectionRefs.current[m.name] = el; }}
          isAdvanced={char.advancedMoves.includes(m.name)}
          onBuy={isEdit ? () => buyAdvancedMove(m.name) : undefined}
          onAdd={isEdit ? () => addAdvancedMove(m.name) : undefined}
        />
      ))}
    </div>
  );
}
