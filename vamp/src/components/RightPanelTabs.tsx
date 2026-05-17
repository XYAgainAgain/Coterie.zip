/* All rendered markdown is from Coterie's verified JSON parsers (trusted content, duh) */

import { useRef } from 'preact/hooks';
import { useSignal, useSignalEffect } from '@preact/signals';
import {
  RPANEL_TABS, TAB_TOOLTIPS, activeRightTab, scrollToMove, switchTab,
  type RPanelTab,
} from '../state/panel';
import {
  currentPlaybook, currentPredatorType, currentBloodlineUrl, gameData,
} from '../state/derived';
import { character, setXP } from '../state/character';
import { coterieState, adjustCoterieStat, setHavenDescription } from '../state/coterie';
import { editMode } from '../app';
import { EditableText } from './EditableText';
import { renderGameMarkdown, capitalizeFirst, parseStatString } from '../data/transforms';
import type { AgeBracket, StatName, BasicMove, StandardMove, BlushOfLife } from '../data/types';

const STAT_ABBREV: Record<string, string> = {
  Blood: 'BLD', Shadow: 'SHA', Resolve: 'RES', Demeanor: 'DEM', Wits: 'WIT',
};

function formatStatChip(name: StatName, val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val} ${STAT_ABBREV[name] ?? name.slice(0, 3).toUpperCase()}`;
}

function formatRollStat(raw: string): string {
  if (raw.toLowerCase().includes('dictated by your predator type')) {
    return 'per Pred. Type (else +Blood)';
  }
  return raw;
}

const TAB_ICONS: Record<RPanelTab, string> = {
  coterie: 'C',
  character: '',
  moves: 'M',
  advancement: 'A',
  rules: 'R',
};

function TabBar() {
  const current = activeRightTab.value;
  const idx = RPANEL_TABS.indexOf(current);
  const bloodlineUrl = currentBloodlineUrl.value;

  return (
    <nav
      class="vamp-rpanel-bar"
      role="tablist"
      style={`--tab-count: ${RPANEL_TABS.length}; --tab-active-idx: ${idx}`}
    >
      {RPANEL_TABS.map(id => (
        <button
          key={id}
          role="tab"
          aria-selected={current === id}
          class={`vamp-rpanel-bar__tab ${current === id ? 'vamp-rpanel-bar__tab--active' : ''}`}
          onClick={() => switchTab(id)}
          title={TAB_TOOLTIPS[id]}
        >
          {id === 'character' && bloodlineUrl ? (
            <img
              class="vamp-rpanel-bar__clan-img"
              src={bloodlineUrl}
              alt={TAB_TOOLTIPS[id]}
            />
          ) : (
            TAB_ICONS[id] || '?'
          )}
        </button>
      ))}
    </nav>
  );
}

function currentAgeBracket(): AgeBracket | null {
  const data = gameData.value;
  if (!data) return null;
  return data.ageBrackets.find(a => a.name === character.value.ageBracket) ?? null;
}


const COTERIE_STAT_ORDER = ['Clout', 'Cohesion', 'Charm', 'Claim', 'Currency'];

const COTERIE_STAT_DESC: Record<string, string> = {
  Clout: 'Reputation and influence among Kindred.',
  Cohesion: 'How well you work together. Modifies Coterie Move rolls.',
  Charm: 'How likable your Coterie is to mortals and Kindred.',
  Claim: 'Territory size and quality.',
  Currency: 'Abstracted monetary wealth.',
};

function CoteriePanel() {
  const cot = coterieState.value;
  const data = gameData.value;
  const isEditing = editMode.value;
  const coterieType = data?.coterieTypes.find(t => t.name === cot.typeName) ?? null;
  const coterieMoves = data?.coterieMoves ?? [];
  const expandedMove = useSignal<string | null>(null);

  return (
    <div class="vamp-rpanel-scroll">
      <CollapsibleSection title={cot.typeName} pill="Coterie Type">
        {coterieType && (
          <div class="vamp-rpanel-field__body"
            dangerouslySetInnerHTML={{ __html: renderGameMarkdown(coterieType.description) }}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Coterie Stats" defaultOpen>
        <div class="vamp-coterie-stats">
          {COTERIE_STAT_ORDER.map(name => {
            const val = cot.stats[name] ?? 0;
            return (
              <div class="vamp-stat vamp-stat--coterie" key={name}>
                <div class="vamp-stat__header">
                  <div class="vamp-stat__circle">
                    {val >= 0 ? `+${val}` : val}
                  </div>
                  <div class="vamp-stat__name-col">
                    <div class="vamp-stat__name">{name}</div>
                    <div class="vamp-stat__desc">{COTERIE_STAT_DESC[name]}</div>
                  </div>
                  <div class={`vamp-stat__rocker ${isEditing ? '' : 'vamp-stat__rocker--disabled'}`}>
                    <button
                      class="vamp-stat__rocker-btn"
                      onClick={() => isEditing && adjustCoterieStat(name, -1)}
                      disabled={!isEditing}
                      aria-label={`Decrease ${name}`}
                    >-</button>
                    <button
                      class="vamp-stat__rocker-btn"
                      onClick={() => isEditing && adjustCoterieStat(name, 1)}
                      disabled={!isEditing}
                      aria-label={`Increase ${name}`}
                    >+</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Members" defaultOpen>
        <div class="vamp-coterie-members">
          {cot.members.map(m => (
            <div class="vamp-coterie-member" key={m.name}>
              <div class="vamp-coterie-member__portrait">
                {m.portraitUrl
                  ? <img src={m.portraitUrl} alt={m.name} />
                  : <span class="vamp-coterie-member__placeholder">?</span>
                }
              </div>
              <div class="vamp-coterie-member__info">
                <div class="vamp-coterie-member__name">{m.name} <span class="vamp-coterie-member__pronouns">({m.pronouns})</span></div>
                <div class="vamp-coterie-member__meta">{m.playbook} | {m.ageBracket} | BP {m.bp}</div>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Haven" defaultOpen>
        <div class="vamp-rpanel-field">
          <EditableText
            value={cot.havenDescription}
            onSave={setHavenDescription}
            placeholder="Describe your Haven..."
            multiline
            className="vamp-haven-desc"
          />
        </div>
        <div class="vamp-rpanel-field">
          <span class="vamp-rpanel-field__label">Positives</span>
          <ul class="vamp-rpanel-field__list">
            {cot.havenPositives.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
        <div class="vamp-rpanel-field">
          <span class="vamp-rpanel-field__label">Negatives</span>
          <ul class="vamp-rpanel-field__list">
            {cot.havenNegatives.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Coterie Moves">
        {coterieMoves.map(cm => (
          <div class={`vamp-move-section ${expandedMove.value === cm.name ? 'vamp-move-section--open' : ''}`} key={cm.name}>
            <div class="vamp-move-section__bar" onClick={() => {
              expandedMove.value = expandedMove.value === cm.name ? null : cm.name;
            }}>
              <span class="vamp-move-section__name">{cm.name}</span>
              <span class="vamp-move-section__badge">+Cohesion</span>
            </div>
            {expandedMove.value === cm.name && (
              <div class="vamp-move-section__body">
                <div class="vamp-rpanel-field">
                  <span class="vamp-rpanel-field__label">Trigger</span>
                  <div class="vamp-rpanel-field__value"><strong>{cm.trigger}</strong></div>
                </div>
                <div class="vamp-rpanel-field">
                  <span class="vamp-rpanel-field__label">Rule</span>
                  <div class="vamp-rpanel-field__value"
                    dangerouslySetInnerHTML={{ __html: renderGameMarkdown(cm.countRule) }}
                  />
                </div>
                {cm.tiers.map(t => {
                  const groupCls = t.tier.startsWith('Everyone') ? 'vamp-move-tier--group-all'
                    : t.tier.startsWith('Half') ? 'vamp-move-tier--group-half'
                    : t.tier.startsWith('Less') ? 'vamp-move-tier--group-less'
                    : t.tier.startsWith('Nobody') ? 'vamp-move-tier--group-none' : '';
                  return (
                  <div class={`vamp-move-tier ${groupCls}`} key={t.tier}>
                    <div class="vamp-move-tier__label">{t.tier}</div>
                    <div class="vamp-move-tier__content"
                      dangerouslySetInnerHTML={{ __html: renderGameMarkdown(t.description) }}
                    />
                  </div>
                  );
                })}
                {cm.holdOptions && (
                  <div class="vamp-rpanel-field">
                    <span class="vamp-rpanel-field__label">Spend Hold to...</span>
                    <ul class="vamp-rpanel-field__list">
                      {cm.holdOptions.map((opt, i) => (
                        <li key={i} dangerouslySetInnerHTML={{ __html: renderGameMarkdown(opt) }} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </CollapsibleSection>
    </div>
  );
}


function CollapsibleSection({ title, pill, defaultOpen, children }: {
  title: string;
  pill?: string;
  defaultOpen?: boolean;
  children: preact.ComponentChildren;
}) {
  return (
    <details class="vamp-rpanel-section" open={defaultOpen}>
      <summary class="vamp-rpanel-section__bar">
        {title}
        {pill && <span class="vamp-rpanel-section__pill">{pill}</span>}
      </summary>
      <div class="vamp-rpanel-section__content">{children}</div>
    </details>
  );
}

function CharacterPanel() {
  const pb = currentPlaybook.value;
  const pt = currentPredatorType.value;
  const ab = currentAgeBracket();

  return (
    <div class="vamp-rpanel-scroll">
      {pb && (
        <CollapsibleSection title={pb.name} pill="Playbook" defaultOpen>
          <div class="vamp-rpanel-field__tagline">{pb.tagline}</div>

          <details class="vamp-detail__collapsible">
            <summary class="vamp-detail__summary">What Are You?</summary>
            <div class="vamp-detail__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pb.whatAreYou) }} />
          </details>

          <div class="vamp-rpanel-field">
            <span class="vamp-rpanel-field__label">Disciplines</span>
            <div class="vamp-rpanel-field__value" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pb.disciplines) }} />
          </div>

          <div class="vamp-rpanel-tier vamp-rpanel-tier--flaw">
            <div class="vamp-rpanel-tier__label">Bane: <em>{pb.baneName}</em></div>
            <div class="vamp-rpanel-tier__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pb.baneDescription) }} />
          </div>

          <div class="vamp-rpanel-tier vamp-rpanel-tier--compulsion">
            <div class="vamp-rpanel-tier__label">Compulsion: <em>{pb.compulsionName ?? 'None'}</em></div>
            <div class="vamp-rpanel-tier__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pb.compulsionDescription) }} />
          </div>

          {pb.archetypes.length > 0 && (
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Archetypes</span>
              <div class="vamp-detail__archetypes">
                {pb.archetypes.map(arch => {
                  const stats = parseStatString(arch.stats);
                  return (
                    <div class="vamp-archetype" key={arch.name}>
                      <div class="vamp-archetype__name">{arch.name}</div>
                      <div class="vamp-archetype__tagline">{arch.tagline}</div>
                      <div class="vamp-archetype__stats">
                        {(Object.entries(stats) as [StatName, number][]).map(([name, val]) => (
                          <span class="vamp-archetype__chip" key={name}>
                            {formatStatChip(name, val)}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div class="vamp-archetype">
            <div class="vamp-archetype__name">Custom Archetype</div>
            <div class="vamp-archetype__tagline">Your concept, your spread.</div>
            <div class="vamp-archetype__stats">
              <span class="vamp-archetype__chip">+2</span>
              <span class="vamp-archetype__chip">+1</span>
              <span class="vamp-archetype__chip">+1</span>
              <span class="vamp-archetype__chip">+0</span>
              <span class="vamp-archetype__chip">-1</span>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {ab && (
        <CollapsibleSection title={ab.name} pill="Age Bracket">
          <div class="vamp-rpanel-field">
            <span class="vamp-rpanel-field__label">Embraced</span>
            <span class="vamp-rpanel-field__value">{ab.embraced}</span>
          </div>
          {ab.flavor && (
            <div class="vamp-rpanel-field__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(ab.flavor) }} />
          )}
          <div class="vamp-rpanel-field">
            <span class="vamp-rpanel-field__label">Starting BP/Humanity</span>
            <span class="vamp-rpanel-field__value">BP {ab.startingBloodPotency}/{ab.startingHumanity}</span>
          </div>
          <div class="vamp-rpanel-field">
            <span class="vamp-rpanel-field__label">Advancement</span>
            <span class="vamp-rpanel-field__value">{ab.advancement}</span>
          </div>
          <div class="vamp-rpanel-field">
            <span class="vamp-rpanel-field__label">Narrative Feel</span>
            <span class="vamp-rpanel-field__value">{ab.narrativeFeel}</span>
          </div>
        </CollapsibleSection>
      )}

      {pt && (
        <CollapsibleSection title={pt.name} pill="Predator Type">
          <div class="vamp-rpanel-field">
            <span class="vamp-rpanel-field__label">Hunting Stat</span>
            <span class="vamp-rpanel-field__value vamp-rpanel-field__value--accent">{pt.huntingStat}</span>
          </div>
          <div class="vamp-rpanel-field">
            <span class="vamp-rpanel-field__label">Discipline</span>
            <span class="vamp-rpanel-field__value vamp-rpanel-field__value--accent">{pt.discipline}</span>
          </div>
          <div class="vamp-rpanel-tier vamp-rpanel-tier--merit">
            <div class="vamp-rpanel-tier__label">Merit</div>
            <div class="vamp-rpanel-tier__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pt.merit) }} />
          </div>
          <div class="vamp-rpanel-tier vamp-rpanel-tier--flaw">
            <div class="vamp-rpanel-tier__label">Flaw</div>
            <div class="vamp-rpanel-tier__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pt.flaw) }} />
          </div>
          {pt.humanity && (
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Humanity</span>
              <span class="vamp-rpanel-field__value">{pt.humanity}</span>
            </div>
          )}
          {pt.feedingRules && (
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Feeding Rules</span>
              <div class="vamp-rpanel-field__value" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pt.feedingRules) }} />
            </div>
          )}
        </CollapsibleSection>
      )}
    </div>
  );
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

function MoveSection({ move, expanded, onToggle, sectionRef }: {
  move: BasicMove;
  expanded: boolean;
  onToggle: () => void;
  sectionRef?: (el: HTMLElement | null) => void;
}) {
  const isBlush = move.type === 'blush-of-life';
  const std = isBlush ? null : move as StandardMove;
  const blush = isBlush ? move as BlushOfLife : null;

  return (
    <div class={`vamp-move-section ${expanded ? 'vamp-move-section--open' : ''}`} ref={sectionRef}>
      <div class="vamp-move-section__bar" onClick={onToggle}>
        <span class="vamp-move-section__name">{move.name}</span>
        {std?.rollStat && <span class="vamp-move-section__badge">{formatRollStat(std.rollStat)}</span>}
        {isBlush && <span class="vamp-move-section__badge">Special</span>}
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

          {std?.outcomes && std.outcomes.map(o => (
            <div class={`vamp-move-tier ${tierClass(o.tier)}`} key={o.tier}>
              <div class="vamp-move-tier__label">{tierLabel(o.tier)}</div>
              <div
                class="vamp-move-tier__content"
                dangerouslySetInnerHTML={{ __html: renderGameMarkdown(capitalizeFirst(o.content)) }}
              />
            </div>
          ))}

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
            <div class="vamp-move-tier vamp-move-tier--12">
              <div class="vamp-move-tier__label">Advanced: 12+</div>
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

function MovesPanel() {
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

  return (
    <div class="vamp-rpanel-scroll" ref={scrollRef}>
      {moves.map(m => (
        <MoveSection
          key={m.name}
          move={m}
          expanded={expandedMove.value === m.name}
          onToggle={() => toggle(m.name)}
          sectionRef={el => { sectionRefs.current[m.name] = el; }}
        />
      ))}
    </div>
  );
}


function AdvancementPanel() {
  const data = gameData.value;
  const char = character.value;
  const costs = data?.advancement.xpCosts ?? [];
  const flashingRef = useRef<Record<string, boolean>>({});
  const flashSignal = useSignal(0);

  function handleAcquire(name: string, cost: number) {
    if (char.xp >= cost) {
      setXP(char.xp - cost);
    } else {
      flashingRef.current[name] = true;
      flashSignal.value++;
      setTimeout(() => {
        flashingRef.current[name] = false;
        flashSignal.value++;
      }, 600);
    }
  }

  return (
    <div class="vamp-rpanel-scroll">
      <div class="vamp-advancement-xp">
        <span class="vamp-advancement-xp__label">Available XP</span>
        <span class="vamp-advancement-xp__value">{char.xp}</span>
      </div>
      {costs.map(item => {
        const numericCost = parseInt(item.cost, 10);
        const hasNumericCost = !isNaN(numericCost);
        const isFlashing = flashingRef.current[item.name];
        const pillText = item.cost
          .replace('(in-Clan) or ', 'or ')
          .replace(' (out-of-Clan)', '')
          .replace('1 + the Power\'s level', '1 + level');

        return (
          <CollapsibleSection key={item.name} title={item.name} pill={pillText}>
            <div class="vamp-rpanel-field__body"
              dangerouslySetInnerHTML={{ __html: renderGameMarkdown(item.description) }}
            />
            {hasNumericCost && (
              <button
                class={`vamp-advancement-acquire ${isFlashing ? 'vamp-advancement-acquire--flash' : ''}`}
                onClick={() => handleAcquire(item.name, numericCost)}
              >
                Acquire ({numericCost} XP)
              </button>
            )}
          </CollapsibleSection>
        );
      })}
    </div>
  );
}

function RulesPanel() {
  return (
    <div class="vamp-rpanel-scroll">
      <div class="vamp-placeholder">
        Rules Reference
        <br /><span class="vamp-placeholder__note">Quick-look rules, tables, glossary</span>
      </div>
    </div>
  );
}


export function RightPanelContent() {
  const current = activeRightTab.value;

  return (
    <>
      <TabBar />
      {current === 'coterie' && <CoteriePanel />}
      {current === 'character' && <CharacterPanel />}
      {current === 'moves' && <MovesPanel />}
      {current === 'advancement' && <AdvancementPanel />}
      {current === 'rules' && <RulesPanel />}
    </>
  );
}
