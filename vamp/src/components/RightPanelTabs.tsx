/* All rendered markdown is from Coterie's verified JSON parsers (trusted content, duh) */

import { useRef, useEffect } from 'preact/hooks';
import { useSignal, useSignalEffect } from '@preact/signals';
import {
  RPANEL_TABS, TAB_TOOLTIPS, activeRightTab, scrollToMove, switchTab,
  type RPanelTab,
} from '../state/panel';
import {
  currentPlaybook, currentPredatorType, currentBloodlineUrl, currentAgeBracket, gameData,
} from '../state/derived';
import { character, setXP, updateCharacter, type GhoulPatron } from '../state/character';
import { coterieState, adjustCoterieStat, setHavenDescription } from '../state/coterie';
import { editMode } from '../state/ui';
import { creationMode, creationStep } from '../state/creation';
import { activeCoterie, createCoterie, joinCoterie, BLANK_CHARACTER } from '../state/persistence';
import { EditableText } from './EditableText';
import { renderGameMarkdown, capitalizeFirst, parseStatString } from '../data/transforms';
import { COTERIE_STAT_NAMES } from '../data/types';
import type { StatName, CoterieStatName, BasicMove, StandardMove, BlushOfLife } from '../data/types';

const STAT_ABBREV: Record<string, string> = {
  Blood: 'BLD', Shadow: 'SHA', Resolve: 'RES', Demeanor: 'DEM', Wits: 'WIT',
};

const CUSTOM_SPREAD = [2, 1, 1, 0, -1] as const;
const ALL_STATS: StatName[] = ['Blood', 'Shadow', 'Resolve', 'Demeanor', 'Wits'];

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

const TAB_SVGS: Partial<Record<RPanelTab, string>> = {
  coterie: '/assets/images/vamp/group.svg',
  moves: '/assets/images/vamp/2d6.svg',
  advancement: '/assets/images/vamp/upgrade.svg',
  rules: '/assets/images/vamp/rulebook.svg',
};

function TabBar() {
  const current = activeRightTab.value;
  const idx = RPANEL_TABS.indexOf(current);
  const bloodlineUrl = currentBloodlineUrl.value;

  useEffect(() => {
    if (!bloodlineUrl) return;
    const existing = document.querySelector(`link[rel="preload"][href="${bloodlineUrl}"]`);
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = bloodlineUrl;
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, [bloodlineUrl]);

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
              class="vamp-rpanel-bar__playbook-img"
              src={bloodlineUrl}
              alt={TAB_TOOLTIPS[id]}
              loading="eager"
            />
          ) : TAB_SVGS[id] ? (
            <span
              class="vamp-rpanel-bar__icon"
              style={`-webkit-mask-image: url(${TAB_SVGS[id]}); mask-image: url(${TAB_SVGS[id]})`}
            />
          ) : (
            '?'
          )}
        </button>
      ))}
    </nav>
  );
}


const COTERIE_STAT_DESC: Record<CoterieStatName, string> = {
  Clout: 'Reputation and influence among Kindred.',
  Cohesion: 'How well you work together. Modifies Coterie Move rolls.',
  Charm: 'How likable your Coterie is to mortals and Kindred.',
  Claim: 'Territory size and quality.',
  Currency: 'Abstracted monetary wealth.',
};

function CoterieSetup() {
  const data = gameData.value;
  const selectedType = useSignal<string | null>(null);
  const mode = useSignal<'idle' | 'create' | 'join'>('idle');
  const joinId = useSignal('');
  const busy = useSignal(false);
  const error = useSignal<string | null>(null);

  async function handleCreate() {
    const typeName = selectedType.value;
    if (!typeName || !data) return;
    const ct = data.coterieTypes.find(t => t.name === typeName);
    if (!ct) return;
    busy.value = true;
    error.value = null;
    try {
      const parsed: Record<string, number> = {};
      for (const piece of ct.coterieStats.split('|')) {
        const m = piece.trim().match(/(\w+)\s*([+\-−])(\d+)/);
        if (m) parsed[m[1]] = (m[2] === '+' ? 1 : -1) * parseInt(m[3], 10);
      }
      await createCoterie({
        typeName,
        stats: {
          Clout: parsed['Clout'] ?? 0, Cohesion: parsed['Cohesion'] ?? 0,
          Charm: parsed['Charm'] ?? 0, Claim: parsed['Claim'] ?? 0, Currency: parsed['Currency'] ?? 0,
        },
        havenPositives: [], havenNegatives: [], havenDescription: '', members: [],
      });
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
    busy.value = false;
  }

  async function handleJoin() {
    const id = joinId.value.trim();
    if (!id) return;
    busy.value = true;
    error.value = null;
    try { await joinCoterie(id); }
    catch (err) { error.value = err instanceof Error ? err.message : String(err); }
    busy.value = false;
  }

  if (mode.value === 'idle') {
    return (
      <div class="vamp-rpanel-scroll" style="padding: 1rem;">
        <p style="color: var(--v-text-secondary); font-size: 0.85rem; margin-bottom: 1rem;">
          No Coterie linked. Create one or join by ID.
        </p>
        <button class="vamp-btn vamp-btn--primary" style="width:100%; margin-bottom: 0.5rem;"
          onClick={() => { mode.value = 'create'; }}>Create Coterie</button>
        <button class="vamp-btn" style="width:100%;"
          onClick={() => { mode.value = 'join'; }}>Join by ID</button>
      </div>
    );
  }

  if (mode.value === 'join') {
    return (
      <div class="vamp-rpanel-scroll" style="padding: 1rem;">
        <p style="color: var(--v-text-secondary); font-size: 0.85rem; margin-bottom: 0.75rem;">
          Enter the Coterie ID shared by another player.
        </p>
        <input class="vamp-input" type="text" placeholder="Coterie ID"
          value={joinId.value} onInput={(e) => { joinId.value = (e.target as HTMLInputElement).value; }} />
        {error.value && <p style="color: #cc3333; font-size: 0.8rem; margin-top: 0.5rem;">{error.value}</p>}
        <div style="display:flex; gap:0.5rem; margin-top: 0.75rem;">
          <button class="vamp-btn" onClick={() => { mode.value = 'idle'; }}>Back</button>
          <button class="vamp-btn vamp-btn--primary" disabled={busy.value || !joinId.value.trim()} onClick={handleJoin}>Join</button>
        </div>
      </div>
    );
  }

  return (
    <div class="vamp-rpanel-scroll" style="padding: 1rem;">
      <p style="color: var(--v-text-secondary); font-size: 0.85rem; margin-bottom: 0.75rem;">
        Pick a Coterie Type. Stats are set automatically.
      </p>
      <div style="max-height: 22rem; overflow-y: auto;">
        {data?.coterieTypes.map(ct => {
          const isSelected = selectedType.value === ct.name;
          return (
            <div key={ct.name} class={`creation-card ${isSelected ? 'creation-card--selected' : ''}`}
              onClick={() => { selectedType.value = ct.name; }}>
              <div class="creation-card__name">{ct.name}</div>
              <div class="creation-card__tagline">{ct.coterieStats}</div>
              {isSelected && (
                <div class="creation-card__detail">
                  {/* Rendered markdown from Coterie's verified JSON parsers (trusted content, duh) */}
                  <div class="vamp-rpanel-field__body"
                    dangerouslySetInnerHTML={{ __html: renderGameMarkdown(ct.description) }}
                  />
                  <div class="creation-card__haven">
                    <span class="creation-card__haven-label creation-card__haven-label--pos">
                      Pick {ct.havenFeatures.positiveCount}: </span>
                    {ct.havenFeatures.positiveOptions.join(', ')}
                  </div>
                  <div class="creation-card__haven">
                    <span class="creation-card__haven-label creation-card__haven-label--neg">
                      Pick {ct.havenFeatures.negativeCount}: </span>
                    {ct.havenFeatures.negativeOptions.join(', ')}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error.value && <p style="color: #cc3333; font-size: 0.8rem; margin-top: 0.5rem;">{error.value}</p>}
      <div style="display:flex; gap:0.5rem; margin-top: 0.75rem;">
        <button class="vamp-btn" onClick={() => { mode.value = 'idle'; }}>Back</button>
        <button class="vamp-btn vamp-btn--primary" disabled={busy.value || !selectedType.value} onClick={handleCreate}>Create</button>
      </div>
    </div>
  );
}

function CoteriePanel() {
  const coterieId = activeCoterie.value;
  if (!coterieId) return <CoterieSetup />;

  const cot = coterieState.value;
  const data = gameData.value;
  const isEditing = editMode.value;
  const coterieType = data?.coterieTypes.find(t => t.name === cot.typeName) ?? null;
  const coterieMoves = data?.coterieMoves ?? [];
  const expandedMove = useSignal<string | null>(null);
  const copied = useSignal(false);

  function copyId() {
    navigator.clipboard.writeText(coterieId!).then(() => {
      copied.value = true;
      setTimeout(() => { copied.value = false; }, 2000);
    });
  }

  return (
    <div class="vamp-rpanel-scroll">
      <div style="padding: 0.4rem 0.6rem; display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
        <span style="font-size:0.85rem; color:var(--v-text-accent); font-family:var(--v-font-display); letter-spacing:0.15em;">{coterieId}</span>
        <button class="wiz-card__toggle" onClick={copyId}>{copied.value ? 'Copied!' : 'Copy'}</button>
      </div>
      <CollapsibleSection title={cot.typeName} pill="Coterie Type">
        {coterieType && (
          <div class="vamp-rpanel-field__body"
            dangerouslySetInnerHTML={{ __html: renderGameMarkdown(coterieType.description) }}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Coterie Stats" defaultOpen>
        <div class="vamp-coterie-stats">
          {COTERIE_STAT_NAMES.map(name => {
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

function CustomStatAllocator() {
  const char = character.value;

  /* Which stat is assigned to each spread slot (index into CUSTOM_SPREAD) */
  const slotAssignments: (StatName | null)[] = CUSTOM_SPREAD.map(() => null);
  for (const stat of ALL_STATS) {
    const val = char.stats[stat];
    if (isNaN(val)) continue;
    /* Find the first unoccupied slot with this value */
    const idx = CUSTOM_SPREAD.findIndex((sv, i) => sv === val && slotAssignments[i] === null);
    if (idx !== -1) slotAssignments[idx] = stat;
  }

  const assignedStats = new Set(slotAssignments.filter(Boolean) as StatName[]);

  function assignSlot(slotIndex: number, stat: string) {
    const newStats = { ...char.stats };
    const prev = slotAssignments[slotIndex];
    if (prev) newStats[prev] = NaN;
    if (stat) {
      newStats[stat as StatName] = CUSTOM_SPREAD[slotIndex];
    }
    updateCharacter({ stats: newStats });
  }

  return (
    <div class="vamp-custom-allocator" onClick={(e) => e.stopPropagation()}>
      {CUSTOM_SPREAD.map((val, i) => {
        const current = slotAssignments[i];
        return (
          <div class="vamp-custom-allocator__slot" key={i}>
            <span class="vamp-custom-allocator__value">{val >= 0 ? `+${val}` : val}</span>
            <select
              class="creation-dropdown creation-dropdown--stat"
              value={current ?? ''}
              onChange={(e) => assignSlot(i, (e.target as HTMLSelectElement).value)}
            >
              <option value="">Stat</option>
              {ALL_STATS.map(s => {
                const taken = assignedStats.has(s) && s !== current;
                return !taken && <option key={s} value={s}>{s}</option>;
              })}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function PlaybookDropdown() {
  const data = gameData.value;
  const char = character.value;
  if (!data) return null;

  const clanPlaybooks = data.playbooks.filter(p => p.category === 'clan');
  const clanless = data.playbooks.filter(p => p.category === 'clanless');

  return (
    <select
      class="creation-dropdown"
      value={char.playbook}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        if (val === char.playbook) return;
        updateCharacter({
          playbook: val,
          archetypeName: '',
          stats: { ...BLANK_CHARACTER.stats },
          predatorType: '',
          unlockedDisciplines: [],
          knownPowers: [],
          merits: [],
          flaws: [],
          folkloricBanes: [],
          baneChoice: 'standard',
        });
      }}
    >
      <option value="">Choose Playbook</option>
      <optgroup label="Clan Playbooks">
        {clanPlaybooks.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
      </optgroup>
      <optgroup label="Clanless Playbooks">
        {clanless.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
      </optgroup>
    </select>
  );
}

const PATRON_EXCLUDED = new Set(['Ghoul', 'Thin-Blood', 'Devorari', 'Osirian', 'Baali']);

function GhoulPatronPrompt() {
  const char = character.value;
  const patron = char.ghoulPatron;
  const data = gameData.value;
  const allPlaybooks = data?.playbooks ?? [];
  const eligible = allPlaybooks.filter(p => !PATRON_EXCLUDED.has(p.name));

  function setPatronType(type: 'npc' | 'pc') {
    if (patron?.type === type) return;
    updateCharacter({
      ghoulPatron: { type, bloodline: '', bp: 1, vampUrl: '' },
      unlockedDisciplines: [],
      knownPowers: [],
    });
  }

  function updatePatron(patch: Partial<GhoulPatron>) {
    if (!patron) return;
    updateCharacter({ ghoulPatron: { ...patron, ...patch } });
  }

  return (
    <div class="vamp-ghoul-patron">
      <div class="vamp-ghoul-patron__title">Who's your patron?</div>
      <div class="vamp-ghoul-patron__buttons">
        <button
          class={`vamp-btn ${patron?.type === 'npc' ? 'vamp-btn--active' : ''}`}
          onClick={() => setPatronType('npc')}
        >NPC</button>
        <button
          class={`vamp-btn ${patron?.type === 'pc' ? 'vamp-btn--active' : ''}`}
          onClick={() => setPatronType('pc')}
        >PC</button>
      </div>

      {patron?.type === 'npc' && (
        <div class="vamp-ghoul-patron__fields">
          <label class="vamp-ghoul-patron__label">
            Bloodline
            <select
              class="vamp-input"
              value={patron.bloodline}
              onChange={e => updatePatron({ bloodline: (e.target as HTMLSelectElement).value })}
            >
              <option value="">Choose...</option>
              {eligible.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </label>
          <label class="vamp-ghoul-patron__label">
            Blood Potency
            <select
              class="vamp-input"
              value={patron.bp}
              onChange={e => updatePatron({ bp: parseInt((e.target as HTMLSelectElement).value, 10) })}
            >
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}

      {patron?.type === 'pc' && (
        <div class="vamp-ghoul-patron__fields">
          <label class="vamp-ghoul-patron__label">
            Patron's Vamp URL
            <input
              class="vamp-input"
              type="text"
              placeholder="Paste URL or invite code..."
              value={patron.vampUrl}
              onInput={e => updatePatron({ vampUrl: (e.target as HTMLInputElement).value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function PlaybookSection({ creating }: { creating: boolean }) {
  const pb = currentPlaybook.value;
  const char = character.value;

  const sectionTitle = creating ? <PlaybookDropdown /> : pb?.name;
  const showContent = creating || !!pb;
  if (!showContent) return null;

  return (
    <details class="vamp-rpanel-section" open={creating || undefined}>
      <summary class="vamp-rpanel-section__bar">
        {sectionTitle}
        <span class="vamp-rpanel-section__pill">Playbook</span>
      </summary>
      <div class="vamp-rpanel-section__content">
        {pb ? (
          <>
            <div class="vamp-rpanel-field__tagline">{pb.tagline}</div>
            <details class="vamp-detail__collapsible" open={creating || undefined}>
              <summary class="vamp-detail__summary">What Are You?</summary>
              <div class="vamp-detail__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pb.whatAreYou) }} />
            </details>
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Disciplines</span>
              <div class="vamp-rpanel-field__value" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pb.disciplines) }} />
              {creating && <div class="vamp-rpanel-field__aside">(Click for full details. You'll pick yours soon!)</div>}
            </div>
            <div class="vamp-rpanel-tier vamp-rpanel-tier--flaw">
              <div class="vamp-rpanel-tier__label">Bane: <em>{pb.baneName}</em></div>
              <div class="vamp-rpanel-tier__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pb.baneDescription) }} />
            </div>
            <div class="vamp-rpanel-tier vamp-rpanel-tier--compulsion">
              <div class="vamp-rpanel-tier__label">Compulsion: <em>{pb.compulsionName ?? 'None'}</em></div>
              <div class="vamp-rpanel-tier__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pb.compulsionDescription) }} />
            </div>
            {creating && char.playbook === 'Ghoul' && <GhoulPatronPrompt />}
            {pb.archetypes.length > 0 && (
              <div class="vamp-rpanel-field">
                <span class="vamp-rpanel-field__label">Archetypes</span>
                <div class="vamp-detail__archetypes">
                  {pb.archetypes.map(arch => {
                    const stats = parseStatString(arch.stats);
                    const isActive = char.archetypeName === arch.name;
                    return (
                      <div
                        class={`vamp-archetype ${creating ? 'vamp-archetype--selectable' : ''} ${isActive ? 'vamp-archetype--active' : ''}`}
                        key={arch.name}
                        onClick={creating ? () => updateCharacter({ archetypeName: arch.name, stats: parseStatString(arch.stats) as Record<StatName, number> }) : undefined}
                      >
                        {creating && <input type="radio" name="archetype" checked={isActive} readOnly class="vamp-archetype__radio" />}
                        <div class="vamp-archetype__name">{arch.name}</div>
                        <div class="vamp-archetype__tagline">{arch.tagline}</div>
                        <div class="vamp-archetype__stats">
                          {(Object.entries(stats) as [StatName, number][]).map(([name, val]) => (
                            <span class="vamp-archetype__chip" key={name}>{formatStatChip(name, val)}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div
              class={`vamp-archetype ${creating ? 'vamp-archetype--selectable' : ''} ${char.archetypeName === 'Custom' ? 'vamp-archetype--active' : ''}`}
              onClick={creating && char.archetypeName !== 'Custom' ? () => updateCharacter({ archetypeName: 'Custom', stats: { Blood: NaN, Shadow: NaN, Resolve: NaN, Demeanor: NaN, Wits: NaN } }) : undefined}
            >
              {creating && <input type="radio" name="archetype" checked={char.archetypeName === 'Custom'} readOnly class="vamp-archetype__radio" />}
              <div class="vamp-archetype__name">Custom Archetype</div>
              <div class="vamp-archetype__tagline">Your concept, your spread.</div>
              {creating && char.archetypeName === 'Custom' ? (
                <CustomStatAllocator />
              ) : (
                <div class="vamp-archetype__stats">
                  <span class="vamp-archetype__chip">+2</span>
                  <span class="vamp-archetype__chip">+1</span>
                  <span class="vamp-archetype__chip">+1</span>
                  <span class="vamp-archetype__chip">+0</span>
                  <span class="vamp-archetype__chip">-1</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div class="vamp-rpanel-field__tagline">Select a Playbook to see its details.</div>
        )}
      </div>
    </details>
  );
}

function AgeBracketSection({ creating }: { creating: boolean }) {
  const ab = currentAgeBracket.value;
  const data = gameData.value;
  const char = character.value;

  const title = creating ? (
    <select
      class="creation-dropdown"
      value={char.ageBracket}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        const bracket = data?.ageBrackets.find(b => b.name === val);
        if (!bracket) return;
        const h = bracket.startingHumanity.split(/[^0-9]+/).map(Number).filter(n => !isNaN(n));
        updateCharacter({
          ageBracket: val,
          bp: bracket.startingBloodPotency,
          humanity: h.length > 0 ? Math.max(...h) : 7,
          predatorType: '',
        });
      }}
    >
      <option value="">Choose Age</option>
      {data?.ageBrackets.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
    </select>
  ) : ab?.name;

  if (!creating && !ab) return null;

  return (
    <details class="vamp-rpanel-section" open={creating || undefined}>
      <summary class="vamp-rpanel-section__bar">
        {title}
        <span class="vamp-rpanel-section__pill">Age Bracket</span>
      </summary>
      <div class="vamp-rpanel-section__content">
        {ab ? (
          <>
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
          </>
        ) : (
          <div class="vamp-rpanel-field__tagline">Select an Age Bracket to see its details.</div>
        )}
      </div>
    </details>
  );
}

function PredatorTypeSection({ creating }: { creating: boolean }) {
  const pt = currentPredatorType.value;
  const data = gameData.value;
  const char = character.value;

  const canSkip = char.ageBracket === 'Fledgling' || char.ageBracket === 'Thin-Blood'
    || char.playbook === 'Devorari' || char.playbook === 'Ghoul';

  const title = creating ? (
    <select
      class="creation-dropdown"
      value={char.predatorType}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        updateCharacter({ predatorType: (e.target as HTMLSelectElement).value });
      }}
    >
      <option value="">{canSkip ? 'None (optional)' : 'Choose Predator Type'}</option>
      {data?.predatorTypes.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
    </select>
  ) : pt?.name;

  if (!creating && !pt) return null;

  return (
    <details class="vamp-rpanel-section" open={creating || undefined}>
      <summary class="vamp-rpanel-section__bar">
        {title}
        <span class="vamp-rpanel-section__pill">Predator Type</span>
      </summary>
      <div class="vamp-rpanel-section__content">
        {pt ? (
          <>
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
          </>
        ) : (
          <div class="vamp-rpanel-field__tagline">Select a Predator Type to see its details.</div>
        )}
      </div>
    </details>
  );
}

function CharacterPanel() {
  const creating = creationMode.value;

  return (
    <div class="vamp-rpanel-scroll">
      <PlaybookSection creating={creating} />
      <AgeBracketSection creating={creating} />
      <PredatorTypeSection creating={creating} />
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
  const isCreation = creationMode.value && creationStep.value === 'xp';
  const startingXP = Math.min(10, Math.max(1, char.bp) * 2);

  useEffect(() => {
    if (isCreation && char.xp === 0) setXP(startingXP);
  }, []);

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
      {isCreation && (
        <div class="vamp-advancement-creation">
          <p class="vamp-advancement-creation__title">Starting XP</p>
          <p class="vamp-advancement-creation__formula">
            BP {char.bp} (min 1) x 2 = <strong>{startingXP} XP</strong>
          </p>
          <p class="vamp-advancement-creation__hint">
            Spend your starting XP below. Anything unspent carries over into play. You can also gain XP by taking on Folkloric Banes or Flaws.
          </p>
        </div>
      )}
      <div class="vamp-advancement-xp">
        <span class="vamp-advancement-xp__label">Available XP</span>
        <span class="vamp-advancement-xp__value">{char.xp}</span>
      </div>
      {costs.map(item => {
        const numericCost = /^\d+$/.test(item.cost.trim()) ? parseInt(item.cost, 10) : NaN;
        const hasNumericCost = !isNaN(numericCost);
        const isFlashing = flashingRef.current[item.name];
        const pillText = item.cost
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
