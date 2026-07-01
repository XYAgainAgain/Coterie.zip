/* All rendered markdown is from Coterie's verified JSON parsers (trusted content, duh) */

import { useRef, useEffect } from 'preact/hooks';
import { useSignal, useSignalEffect } from '@preact/signals';
import {
  RPANEL_TABS, TAB_TOOLTIPS, activeRightTab, scrollToMove, switchTab,
  rulesOpenSection, rulesPulse,
  type RPanelTab,
} from '../state/panel';
import {
  currentPlaybook, currentPredatorType, currentBloodlineUrl, currentAgeBracket, gameData,
  statCap, parseXPValue, xpRange, baaliGrantedBaneEntries, grantedBaneXP,
} from '../state/derived';
import { character, setXP, updateCharacter, addPendingUpgrade, buyAdvancedMove, type GhoulPatron } from '../state/character';
import { coterieState, adjustCoterieStat, setHavenDescription, setHavenPicks } from '../state/coterie';
import { editMode, enterDisciplineBuyMode, viewingOtherSheet } from '../state/ui';
import { creationMode, creationStep } from '../state/creation';
import { switchContentTab } from '../state/panel';
import { activeCoterie, createCoterie, joinCoterie, leaveCoterie, BLANK_CHARACTER, activeCharacterId, setStConsent, setStDeclined, castStKickVote } from '../state/persistence';
import { activeStConsent, activeStDeclined, consentValid } from '../state/storyteller';
import { auth } from '../firebase';
import { EditableTextField } from './EditableTextField';
import { showToast } from '../state/toasts';
import { renderGameMarkdown, capitalizeFirst, parseStatString } from '../data/transforms';
import { getCachedRules, getRulesPending, prefetchRules } from '../utils/rulesCache';
import { COTERIE_STAT_NAMES } from '../data/types';
import type { StatName, CoterieStatName, BasicMove, StandardMove, BlushOfLife, Merit, Flaw, HavenFeatures } from '../data/types';
import type { CharacterState } from '../state/character';

function groupByCategory<T extends { category: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.category);
    if (list) list.push(item);
    else map.set(item.category, [item]);
  }
  return [...map.entries()];
}

/* Ascending XP (cost for Merits, gain for Flaws), then A→Z. */
function sortByXPThenName<T extends { name: string }>(items: T[], xpOf: (item: T) => string): T[] {
  return [...items].sort((a, b) =>
    (parseXPValue(xpOf(a)) - parseXPValue(xpOf(b))) || a.name.localeCompare(b.name),
  );
}

function checkLimitEligibility(
  limit: string,
  char: CharacterState,
): boolean {
  if (limit === '—' || limit === '—') return true;

  /* "Requires X access" */
  const reqAccess = limit.match(/^Requires\s+(.+?)\s+access$/i);
  if (reqAccess) {
    const disc = reqAccess[1].toLowerCase().replace(/\s+/g, '-');
    return char.unlockedDisciplines.some(d => d.toLowerCase().replace(/\s+/g, '-') === disc);
  }

  /* "BP N or lower" / "BP N or higher" / "BP N+" */
  const bpLow = limit.match(/^BP\s+(\d+)\s+or\s+lower$/i);
  if (bpLow) return char.bp <= parseInt(bpLow[1]);
  const bpHigh = limit.match(/^BP\s+(\d+)(?:\s+or\s+higher|\+)$/i);
  if (bpHigh) return char.bp >= parseInt(bpHigh[1]);

  /* "Unavailable to X" (Playbook or Predator Type name) */
  const unavail = limit.match(/^Unavailable to\s+(.+)$/i);
  if (unavail) {
    const targets = unavail[1].split(/(?:,\s*|\s+(?:and|&)\s+)/i)
      .map(s => s.replace(/\*/g, '').replace(/\s+Predator\s+Type$/i, '').trim());
    for (const t of targets) {
      if (t.toLowerCase() === char.playbook.toLowerCase()) return false;
      if (t.toLowerCase() === char.predatorType.toLowerCase()) return false;
      /* "Nosferatu with *Monstrous Visage* Bane" — the named Bane may be the
         clan's standard Bane or its variant; resolve via clanBaneVariants. */
      const withBane = t.match(/^(.+?)\s+with\s+(?:the\s+)?(.+?)\s+(?:Variant\s+)?Bane$/i);
      if (withBane) {
        const pb = withBane[1].trim();
        const baneName = withBane[2].replace(/\*/g, '').trim().toLowerCase();
        if (pb.toLowerCase() === char.playbook.toLowerCase()) {
          const variantName = gameData.value?.optionalExtras?.clanBaneVariants
            .find(v => v.clan.toLowerCase() === pb.toLowerCase())?.baneName.toLowerCase();
          const hasNamedBane = baneName === variantName
            ? char.baneChoice === 'variant' || char.baneChoice === 'both'
            : char.baneChoice === 'standard' || char.baneChoice === 'both';
          if (hasNamedBane) return false;
        }
      }
      /* "anyone incapable of the Embrace" */
      if (/incapable of the Embrace/i.test(t)) {
        if (['Ghoul', 'Thin-Blood', 'Osirian'].includes(char.playbook)) return false;
      }
    }
    return true;
  }

  /* "Requires *X* or *Y* Predator Type" */
  const reqPT = limit.match(/^Requires\s+(.+?)\s+Predator\s+Type$/i);
  if (reqPT) {
    const pts = reqPT[1].split(/(?:,\s*|\s+or\s+)/i).map(s => s.replace(/\*/g, '').trim());
    return pts.some(p => p.toLowerCase() === char.predatorType.toLowerCase());
  }

  /* "Requires Toreador or Daughter of Cacophony" (Playbook requirement) */
  const reqPB = limit.match(/^Requires\s+(.+)$/i);
  if (reqPB && !reqPB[1].includes('access') && !reqPB[1].includes('Predator')) {
    const pbs = reqPB[1].split(/(?:,\s*|\s+or\s+)/i).map(s => s.replace(/\*/g, '').trim());
    return pbs.some(p => p.toLowerCase() === char.playbook.toLowerCase());
  }

  /* "X Only" or "Only X" (data uses plural like "Only Ghouls" for Playbook "Ghoul") */
  const onlyMatch = limit.match(/^(.+?)\s+Only$/i) ?? limit.match(/^Only\s+(.+)$/i);
  if (onlyMatch) {
    const target = onlyMatch[1].replace(/\*/g, '').trim().toLowerCase();
    const pb = char.playbook.toLowerCase();
    return target === pb || target === pb + 's';
  }

  /* "Can't have *X* Merit/Flaw" */
  const cantHave = limit.match(/^Can'?t\s+have\s+\*?(.+?)\*?\s+(?:Merit|Flaw)$/i);
  if (cantHave) {
    const name = cantHave[1].trim();
    return !char.merits.some(m => m.name === name) && !char.flaws.some(f => f.name === name);
  }

  /* "Requires *X*" (prerequisite: another Merit, Flaw, or Folkloric Bane) */
  const reqItem = limit.match(/^Requires\s+\*(.+?)\*(?:\s+Folkloric\s+Bane)?$/i);
  if (reqItem) {
    const name = reqItem[1].trim();
    return char.merits.some(m => m.name === name)
      || char.flaws.some(f => f.name === name)
      || char.folkloricBanes.some(b => b.baneName === name);
  }

  /* Combined rules like "BP 3+, unavailable to *Orbiter* Predator Type" */
  if (limit.includes(',')) {
    return limit.split(',').map(s => s.trim()).every(part => checkLimitEligibility(part, char));
  }

  return true;
}

function checkMeritEligibility(merit: Merit, char: CharacterState): boolean {
  return checkLimitEligibility(merit.limit, char);
}

function checkFlawEligibility(flaw: Flaw, char: CharacterState): boolean {
  return checkLimitEligibility(flaw.limit, char);
}

const CLAN_PLAYBOOKS = [
  'Banu Haqim', 'Brujah', 'Gangrel', 'Hecata', 'Lasombra', 'Malkavian',
  'The Ministry', 'Nosferatu', 'Ravnos', 'Salubri', 'Toreador', 'Tremere',
  'Tzimisce', 'Ventrue',
];

type SubSelectionDef = { options: string[] | ((char: CharacterState) => string[]) };

const SUB_SELECTIONS: Record<string, SubSelectionDef> = {
  'Fight or Flight': { options: ['Fight', 'Flight'] },
  'Peculiarly Off-Putting': { options: (char) => CLAN_PLAYBOOKS.filter(c => c !== char.playbook) },
  'Inherited Bane': { options: (char) => CLAN_PLAYBOOKS.filter(c => c !== char.playbook) },
  'Narrow Appetence': { options: ['Choleric', 'Melancholic', 'Sanguine', 'Phlegmatic'] },
  'Baneful Blood': { options: [...CLAN_PLAYBOOKS] },
};

function getSubSelectionOptions(name: string, char: CharacterState): string[] | null {
  const def = SUB_SELECTIONS[name];
  if (!def) return null;
  return typeof def.options === 'function' ? def.options(char) : def.options;
}

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
          data-tab={id}
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
  Clout: 'Kindred reputation/influence.',
  Cohesion: 'How well you work together.',
  Charm: "How likable y'all are.",
  Claim: 'Territory size and quality.',
  Currency: 'Abstracted monetary wealth.',
};

/* Jump to the How-to-Coterie rules and flash the Coterie-stats explainer. */
function openCoterieInfo() {
  rulesOpenSection.value = 'Your Coterie';
  rulesPulse.value++;
  switchTab('rules');
}

/* Module-scoped so it survives RulesPanel remounts; a per-component ref would reset
   on every tab switch and re-fire the flash without a fresh pill click. */
let lastRulesPulse = 0;

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

/* Aggregate (The Uncategorizable) draws from the pooled options with its own caps,
   kept as named consts because Sam wants them unlockable later, not buried literals. */
const AGGREGATE_POSITIVE_CAP = 3;
const AGGREGATE_NEGATIVE_CAP = 2;

const HavenRemoveX = () => (
  <svg class="vamp-haven-pill__x" viewBox="0 0 16 16" width="9" height="9" aria-hidden="true">
    <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
    <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
  </svg>
);

function HavenSide({
  label, polarity, options, selected, cap, aggregate, note, isEditing, onChange,
}: {
  label: string;
  polarity: 'pos' | 'neg';
  options: string[];
  selected: string[];
  cap: number;
  aggregate: boolean;
  note: string | null;
  isEditing: boolean;
  onChange: (next: string[]) => void;
}) {
  const atCap = selected.length >= cap;

  function toggle(opt: string) {
    if (selected.includes(opt)) onChange(selected.filter(o => o !== opt));
    else if (!atCap) onChange([...selected, opt]);
  }

  function addFromDropdown(e: Event) {
    const sel = e.target as HTMLSelectElement;
    const val = sel.value;
    if (val && !selected.includes(val) && !atCap) onChange([...selected, val]);
    sel.value = '';
  }

  const pill = (opt: string, interactive: boolean) => {
    if (!interactive) {
      return (
        <span key={opt} class={`vamp-haven-pill vamp-haven-pill--${polarity} vamp-haven-pill--active vamp-haven-pill--static`}>
          {opt}
        </span>
      );
    }
    return (
      <button
        key={opt}
        type="button"
        class={`vamp-haven-pill vamp-haven-pill--${polarity} vamp-haven-pill--active`}
        onClick={() => toggle(opt)}
        title={`Remove ${opt}`}
      >
        {opt}<HavenRemoveX />
      </button>
    );
  };

  return (
    <div class="vamp-rpanel-field vamp-haven-side">
      <span class={`vamp-haven-side__label vamp-haven-side__label--${polarity}`}>
        {label} <span class="vamp-haven-side__count">{selected.length}/{cap}</span>
      </span>

      {!isEditing && (
        selected.length > 0
          ? <div class="vamp-haven-pills">{selected.map(o => pill(o, false))}</div>
          : <span class="vamp-haven-empty">None selected</span>
      )}

      {isEditing && !aggregate && (
        <div class="vamp-haven-pills">
          {options.map(opt => {
            const sel = selected.includes(opt);
            if (sel) return pill(opt, true);
            return (
              <button
                key={opt}
                type="button"
                class={`vamp-haven-pill vamp-haven-pill--${polarity}`}
                onClick={() => toggle(opt)}
                disabled={atCap}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {isEditing && aggregate && (
        <>
          {note && <p class="vamp-haven-note">{note}</p>}
          <select class="vamp-haven-select" onChange={addFromDropdown} disabled={atCap}>
            <option value="">{atCap ? `Max ${cap} chosen` : 'Add a feature…'}</option>
            {options.filter(o => !selected.includes(o)).map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          {selected.length > 0 && (
            <div class="vamp-haven-pills">{selected.map(o => pill(o, true))}</div>
          )}
        </>
      )}
    </div>
  );
}

function HavenFeatureSelector({
  features, positives, negatives, isEditing,
}: {
  features: HavenFeatures;
  positives: string[];
  negatives: string[];
  isEditing: boolean;
}) {
  const posCap = features.aggregate ? AGGREGATE_POSITIVE_CAP : features.positiveCount;
  const negCap = features.aggregate ? AGGREGATE_NEGATIVE_CAP : features.negativeCount;

  return (
    <>
      <HavenSide
        label="Positives"
        polarity="pos"
        options={features.positiveOptions}
        selected={positives}
        cap={posCap}
        aggregate={features.aggregate}
        note={features.positiveNote}
        isEditing={isEditing}
        onChange={next => setHavenPicks(next, coterieState.value.havenNegatives)}
      />
      <HavenSide
        label="Negatives"
        polarity="neg"
        options={features.negativeOptions}
        selected={negatives}
        cap={negCap}
        aggregate={features.aggregate}
        note={features.negativeNote}
        isEditing={isEditing}
        onChange={next => setHavenPicks(coterieState.value.havenPositives, next)}
      />
    </>
  );
}

function CoteriePanel() {
  const coterieId = activeCoterie.value;
  /* Hooks run unconditionally, before any early return, so hook order stays
     stable when activeCoterie flips null -> set without remounting. */
  const expandedMove = useSignal<string | null>(null);
  const copied = useSignal(false);
  const codeRevealed = useSignal(false);
  const confirmLeave = useSignal(false);
  const leaving = useSignal(false);

  if (!coterieId) return <CoterieSetup />;

  const cot = coterieState.value;
  const data = gameData.value;
  const isEditing = editMode.value;
  const coterieType = data?.coterieTypes.find(t => t.name === cot.typeName) ?? null;
  const coterieMoves = data?.coterieMoves ?? [];

  function copyId() {
    navigator.clipboard?.writeText(coterieId!).then(() => {
      copied.value = true;
      setTimeout(() => { copied.value = false; }, 2000);
    }).catch(() => {
      showToast('Could not copy automatically. Reveal the code and copy it manually.', 'warning');
    });
  }

  async function handleLeave() {
    leaving.value = true;
    try {
      await leaveCoterie();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not leave the Coterie.', 'error');
    }
    leaving.value = false;
    confirmLeave.value = false;
  }

  return (
    <div class="vamp-rpanel-scroll">
      <CollapsibleSection title={cot.typeName} pill="Coterie Type">
        {coterieType && (
          <div class="vamp-rpanel-field__body"
            dangerouslySetInnerHTML={{ __html: renderGameMarkdown(coterieType.description) }}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Coterie Stats" defaultOpen pill="More Info" onPillClick={openCoterieInfo}>
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
          {cot.members.map(m => {
            const viewUrl = coterieId && m.slug
              ? `/vamp/${coterieId}/${m.slug}`
              : null;

            return (
              <div class="vamp-coterie-member" key={m.characterId || m.name}>
                <div class="vamp-coterie-member__portrait">
                  {m.portraitUrl
                    ? <img src={m.portraitUrl} alt={m.name} />
                    : <span class="vamp-coterie-member__placeholder">?</span>
                  }
                </div>
                <div class="vamp-coterie-member__info">
                  <div class="vamp-coterie-member__name">
                    {viewUrl
                      ? <a href={viewUrl} target="_blank" rel="noopener" class="vamp-coterie-member__link">{m.name}</a>
                      : m.name
                    }
                    {' '}<span class="vamp-coterie-member__pronouns">({m.pronouns})</span>
                  </div>
                  <div class="vamp-coterie-member__meta">{m.playbook} | {m.ageBracket} | BP {m.bp}</div>
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Haven" defaultOpen>
        <div class="vamp-rpanel-field">
          <EditableTextField
            value={cot.havenDescription}
            onSave={setHavenDescription}
            placeholder="Describe your Haven..."
            multiline
            autoResize
            className="vamp-haven-desc"
          />
        </div>
        {coterieType && (
          <HavenFeatureSelector
            features={coterieType.havenFeatures}
            positives={cot.havenPositives}
            negatives={cot.havenNegatives}
            isEditing={isEditing}
          />
        )}
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

      <StorytellerSection />

      <div class="vamp-coterie-code">
        <span class="vamp-coterie-code__label">Coterie Code</span>
        <div class="vamp-coterie-code__row">
          <button
            type="button"
            class={`vamp-coterie-code__value ${codeRevealed.value ? 'vamp-coterie-code__value--revealed' : ''}`}
            onClick={() => { codeRevealed.value = !codeRevealed.value; }}
            aria-label={codeRevealed.value ? 'Hide Coterie code' : 'Reveal Coterie code'}
            title={codeRevealed.value ? 'Click to hide' : 'Click to reveal'}
          >{coterieId}</button>
          {codeRevealed.value && (
            <button class="vamp-coterie-code__copy" onClick={copyId}>{copied.value ? 'Copied!' : 'Copy'}</button>
          )}
        </div>
        <div class="vamp-coterie-leave">
          {confirmLeave.value ? (
            <>
              <span class="vamp-coterie-leave__prompt">Leave this Coterie?</span>
              <button class="wiz-card__toggle vamp-coterie-leave__confirm" onClick={handleLeave} disabled={leaving.value}>
                {leaving.value ? 'Leaving…' : 'Yes, leave'}
              </button>
              <button class="wiz-card__toggle" onClick={() => { confirmLeave.value = false; }} disabled={leaving.value}>Cancel</button>
            </>
          ) : (
            <button class="vamp-coterie-leave__btn" onClick={() => { confirmLeave.value = true; }}>Leave Coterie</button>
          )}
        </div>
      </div>
    </div>
  );
}


/* Storyteller status row: consent state + decision buttons + the kick-vote entry point.
   Revocation after consent is deliberately absent — the plan allows it only via leaving
   the Coterie or a unanimous kick (one griefer can't strip the ST mid-session). */
function StorytellerSection() {
  const busy = useSignal(false);
  const confirmVote = useSignal(false);

  const charId = activeCharacterId.value;
  const cot = coterieState.value;
  const stUid = cot.storytellerUid;
  const uid = auth.currentUser?.uid;
  if (!charId) return null;

  const consented = consentValid(activeStConsent.value, stUid);
  const declinedThisSt = !!stUid && activeStDeclined.value === stUid;
  const hasVoted = !!uid && cot.stKickVotes.includes(uid);

  async function decide(approve: boolean) {
    if (!stUid || busy.value) return;
    busy.value = true;
    try {
      if (approve) await setStConsent(charId!, stUid);
      else await setStDeclined(charId!, stUid);
    } catch {
      showToast('Could not save your Storyteller decision.', 'error');
    }
    busy.value = false;
  }

  async function vote(rescind: boolean) {
    if (busy.value) return;
    busy.value = true;
    try { await castStKickVote(rescind); } finally { busy.value = false; }
    confirmVote.value = false;
  }

  return (
    <div class="vamp-st">
      <span class="vamp-st__label">Storyteller</span>
      {!stUid ? (
        <p class="vamp-st__status">No Storyteller has claimed this Coterie.</p>
      ) : stUid === uid ? (
        <p class="vamp-st__status">You are this Coterie&rsquo;s Storyteller.</p>
      ) : (
        <>
          {consented ? (
            <p class="vamp-st__status">Your sheet is open to the Storyteller. Private notes stay yours alone.</p>
          ) : declinedThisSt ? (
            <>
              <p class="vamp-st__status">You declined the current Storyteller, so they cannot see this sheet.</p>
              <button class="vamp-btn vamp-btn--sm" onClick={() => decide(true)} disabled={busy.value}>Approve them after all</button>
            </>
          ) : (
            <>
              <p class="vamp-st__status">A Storyteller has claimed this Coterie and awaits your decision.</p>
              <div class="vamp-st__actions">
                <button class="vamp-btn vamp-btn--sm vamp-st__approve" onClick={() => decide(true)} disabled={busy.value}>Approve</button>
                <button class="vamp-btn vamp-btn--sm vamp-st__decline" onClick={() => decide(false)} disabled={busy.value}>Decline</button>
              </div>
            </>
          )}
          <div class="vamp-st__kick">
            {cot.stKickVotes.length > 0 && (
              <span class="vamp-st__votes">{cot.stKickVotes.length} vote{cot.stKickVotes.length === 1 ? '' : 's'} to remove &mdash; needs every player.</span>
            )}
            {hasVoted ? (
              <button class="vamp-btn vamp-btn--sm" onClick={() => vote(true)} disabled={busy.value}>Rescind your vote</button>
            ) : confirmVote.value ? (
              <>
                <span class="vamp-st__votes">Vote to remove the Storyteller?</span>
                <button class="vamp-btn vamp-btn--sm vamp-st__decline" onClick={() => vote(false)} disabled={busy.value}>Yes, vote</button>
                <button class="vamp-btn vamp-btn--sm" onClick={() => { confirmVote.value = false; }} disabled={busy.value}>Cancel</button>
              </>
            ) : (
              <button class="vamp-st__kick-btn" onClick={() => { confirmVote.value = true; }}>Vote to remove Storyteller</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CollapsibleSection({ title, pill, onPillClick, defaultOpen, children }: {
  title: string;
  pill?: string;
  onPillClick?: () => void;
  defaultOpen?: boolean;
  children: preact.ComponentChildren;
}) {
  return (
    <details class="vamp-rpanel-section" open={defaultOpen}>
      <summary class="vamp-rpanel-section__bar">
        {title}
        {pill && (onPillClick
          ? <button type="button" class="vamp-rpanel-section__pill vamp-rpanel-section__pill--action"
              onClick={e => { e.preventDefault(); e.stopPropagation(); onPillClick(); }}>{pill}</button>
          : <span class="vamp-rpanel-section__pill">{pill}</span>)}
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
          startingDisciplines: [],
          knownPowers: [],
          knownProjectPowers: [],
          xpTriggers: [],
          merits: [],
          flaws: [],
          folkloricBanes: val === 'Baali' ? baaliGrantedBaneEntries() : [],
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
      knownProjectPowers: [],
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

function PlaybookSection({ creating, focused }: { creating: boolean; focused: boolean }) {
  const pb = currentPlaybook.value;
  const char = character.value;
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!creating || !detailsRef.current) return;
    detailsRef.current.open = focused;
  }, [focused, creating]);

  const sectionTitle = creating ? <PlaybookDropdown /> : pb?.name;
  const showContent = creating || !!pb;
  if (!showContent) return null;

  return (
    <details class="vamp-rpanel-section" ref={detailsRef}>
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
              {char.archetypeName === 'Custom' && !viewingOtherSheet.value && (creating || editMode.value) ? (
                <>
                  <EditableTextField
                    className="vamp-archetype__name"
                    value={char.customArchetypeName}
                    placeholder="Custom Archetype"
                    onSave={(v) => updateCharacter({ customArchetypeName: v })}
                    hideLabel
                  />
                  <EditableTextField
                    className="vamp-archetype__tagline"
                    value={char.customArchetypeTagline}
                    placeholder="Your concept, your spread."
                    onSave={(v) => updateCharacter({ customArchetypeTagline: v })}
                    hideLabel
                  />
                </>
              ) : (
                <>
                  <div class="vamp-archetype__name">{char.customArchetypeName || 'Custom Archetype'}</div>
                  <div class="vamp-archetype__tagline">{char.customArchetypeTagline || 'Your concept, your spread.'}</div>
                </>
              )}
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

function AgeBracketSection({ creating, focused }: { creating: boolean; focused: boolean }) {
  const ab = currentAgeBracket.value;
  const data = gameData.value;
  const char = character.value;
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!creating || !detailsRef.current) return;
    detailsRef.current.open = focused;
  }, [focused, creating]);

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
        const bp = bracket.startingBloodPotency;
        updateCharacter({
          ageBracket: val,
          bp,
          xp: Math.min(10, Math.max(1, bp) * 2),
          humanity: h.length > 0 ? Math.max(...h) : 7,
          predatorType: '',
        });
      }}
    >
      <option value="">Choose Age</option>
      {data?.ageBrackets
        .filter(b => {
          const isSemimortalOnly = char.playbook === 'Ghoul' || char.playbook === 'Thin-Blood';
          if (isSemimortalOnly) return b.name === 'Semimortal';
          if (char.playbook) return b.name !== 'Semimortal';
          return true;
        })
        .map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
    </select>
  ) : ab?.name;

  if (!creating && !ab) return null;

  return (
    <details class="vamp-rpanel-section" ref={detailsRef}>
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

function PredatorTypeSection({ creating, focused }: { creating: boolean; focused: boolean }) {
  const pt = currentPredatorType.value;
  const data = gameData.value;
  const char = character.value;
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!creating || !detailsRef.current) return;
    detailsRef.current.open = focused;
  }, [focused, creating]);

  const canSkip = char.ageBracket === 'Fledgling'
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
    <details class="vamp-rpanel-section" ref={detailsRef}>
      <summary class="vamp-rpanel-section__bar">
        {title}
        <span class="vamp-rpanel-section__pill">Predator Type</span>
      </summary>
      <div class="vamp-rpanel-section__content">
        {pt ? (
          <>
            {pt.description && (
              <div class="vamp-rpanel-field__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pt.description) }} />
            )}
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Hunting Stat</span>
              <span class="vamp-rpanel-field__value vamp-rpanel-field__value--accent">{pt.huntingStat}</span>
            </div>
            <div class="vamp-rpanel-field">
              <span class="vamp-rpanel-field__label">Discipline</span>
              <span class="vamp-rpanel-field__value vamp-rpanel-field__value--accent">{pt.discipline}</span>
            </div>
            <div class="vamp-rpanel-tier vamp-rpanel-tier--merit">
              <div class="vamp-rpanel-tier__label">Merit: <em>{pt.merit.name}</em></div>
              <div class="vamp-rpanel-tier__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pt.merit.description) }} />
            </div>
            <div class="vamp-rpanel-tier vamp-rpanel-tier--flaw">
              <div class="vamp-rpanel-tier__label">Flaw: <em>{pt.flaw.name}</em></div>
              <div class="vamp-rpanel-tier__body" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pt.flaw.description) }} />
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
  const step = creationStep.value;

  return (
    <div class="vamp-rpanel-scroll">
      <PlaybookSection creating={creating} focused={creating && step === 'playbook'} />
      <AgeBracketSection creating={creating} focused={creating && step === 'age'} />
      <PredatorTypeSection creating={creating} focused={creating && step === 'predator'} />
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


/* All rendered markdown here is from Coterie's verified JSON parsers (trusted content) */
function AdvancementPanel() {
  const data = gameData.value;
  const char = character.value;
  const pb = currentPlaybook.value;
  const isCreation = creationMode.value && creationStep.value === 'xp';
  const isEdit = editMode.value;
  const cap = statCap.value;

  /* Snapshot starting Disciplines + set initial XP on first visit to XP step.
     Uses startingDisciplines as the persistence guard so remounting the panel
     (switching tabs) doesn't clobber XP. Reset when Playbook changes. */
  useEffect(() => {
    if (!isCreation) return;
    const cur = character.value;
    if (cur.startingDisciplines.length === 0 && cur.unlockedDisciplines.length > 0) {
      /* Granted Banes (Baali) exist before this snapshot, so fold their XP in here;
         user-chosen extras come later and adjust XP imperatively */
      const base = Math.min(10, Math.max(1, cur.bp) * 2 + grantedBaneXP(cur.folkloricBanes));
      updateCharacter({
        startingDisciplines: [...cur.unlockedDisciplines],
        xp: base,
      });
    }
  }, [isCreation, char.unlockedDisciplines.length]);

  /* Display-only formula breakdown (XP itself is managed imperatively by each toggle/purchase) */
  const bpBase = Math.max(1, char.bp) * 2;
  const flawXP = char.flaws.reduce((sum, f) => sum + parseXPValue(f.xpGain), 0);
  const baneXP = char.folkloricBanes.filter(b => !b.fromPlaybookBane)
    .reduce((sum, b) => sum + parseXPValue(b.xpGain), 0) + grantedBaneXP(char.folkloricBanes);
  const variantXP = char.baneChoice === 'both' ? 5 : 0;
  const rawStarting = bpBase + flawXP + baneXP + variantXP;
  const startingXP = Math.min(10, rawStarting);

  /* Merits + Flaws combined cap: 2 + max(1, BP) during creation */
  const meritFlawCap = 2 + Math.max(1, char.bp);
  const meritFlawCount = char.merits.length + char.flaws.length;
  const atMeritFlawCap = isCreation && meritFlawCount >= meritFlawCap;

  /* Folkloric Bane cap: 3 user-chosen (Baali auto-grants don't count) */
  const isBaali = char.playbook === 'Baali';
  const userBaneCount = char.folkloricBanes.filter(b => !b.fromPlaybookBane).length;
  const atBaneCap = isCreation && userBaneCount >= 3;

  const isClan = pb?.category === 'clan';
  const optExtras = data?.optionalExtras;

  /* All handlers read fresh signal values to avoid stale-closure bugs on rapid clicks */

  function toggleMerit(name: string, xpCost: string, chosenXP?: string) {
    const effectiveCost = chosenXP ?? xpCost;
    const cost = parseXPValue(effectiveCost);
    const cur = character.value;
    const existing = cur.merits.find(m => m.name === name);
    if (existing) {
      const refund = parseXPValue(existing.xpCost);
      updateCharacter({
        merits: cur.merits.filter(m => m.name !== name),
        ...(isCreation ? { xp: Math.min(10, cur.xp + refund) } : {}),
      });
    } else {
      if (isCreation && cur.xp < cost) return;
      updateCharacter({
        merits: [...cur.merits, { name, xpCost: effectiveCost }],
        ...(isCreation ? { xp: cur.xp - cost } : {}),
      });
    }
  }

  function toggleFlaw(name: string, xpGain: string, chosenXP?: string) {
    const effectiveGain = chosenXP ?? xpGain;
    const gain = parseXPValue(effectiveGain);
    const cur = character.value;
    const existing = cur.flaws.find(f => f.name === name);
    if (existing) {
      const storedGain = parseXPValue(existing.xpGain);
      if (isCreation && cur.xp < storedGain) return;
      updateCharacter({
        flaws: cur.flaws.filter(f => f.name !== name),
        ...(isCreation ? { xp: Math.max(0, cur.xp - storedGain) } : {}),
      });
    } else {
      updateCharacter({
        flaws: [...cur.flaws, { name, xpGain: effectiveGain }],
        ...(isCreation ? { xp: Math.min(10, cur.xp + gain) } : {}),
      });
    }
  }

  function setMeritSelection(name: string, selection: string) {
    const cur = character.value;
    updateCharacter({ merits: cur.merits.map(m => m.name === name ? { ...m, selection } : m) });
  }

  function setFlawSelection(name: string, selection: string) {
    const cur = character.value;
    updateCharacter({ flaws: cur.flaws.map(f => f.name === name ? { ...f, selection } : f) });
  }

  function toggleFolkloricBane(baneName: string, xpGain: string) {
    const gain = parseXPValue(xpGain);
    const cur = character.value;
    const existing = cur.folkloricBanes.find(b => b.baneName === baneName);
    /* Auto-granted (Baali) Banes are mandatory; no UI path reaches here, but stay safe */
    if (existing?.fromPlaybookBane) return;
    if (existing) {
      if (isCreation && cur.xp < gain) return;
      updateCharacter({
        folkloricBanes: cur.folkloricBanes.filter(b => b.baneName !== baneName),
        ...(isCreation ? { xp: Math.max(0, cur.xp - gain) } : {}),
      });
    } else {
      updateCharacter({
        folkloricBanes: [
          ...cur.folkloricBanes,
          { baneName, xpGain, fromPlaybookBane: false },
        ],
        ...(isCreation ? { xp: Math.min(10, cur.xp + gain) } : {}),
      });
    }
  }

  function setLocalBaneChoice(choice: 'standard' | 'variant' | 'both') {
    const cur = character.value;
    const oldBonus = cur.baneChoice === 'both' ? 5 : 0;
    const newBonus = choice === 'both' ? 5 : 0;
    const delta = newBonus - oldBonus;
    if (isCreation && delta < 0 && cur.xp < Math.abs(delta)) return;
    updateCharacter({
      baneChoice: choice,
      ...(isCreation && delta !== 0 ? { xp: Math.min(10, Math.max(0, cur.xp + delta)) } : {}),
    });
  }

  function purchaseStat(stat: StatName) {
    const cur = character.value;
    if (cur.xp < 8 || cur.stats[stat] >= cap) return;
    updateCharacter({
      stats: { ...cur.stats, [stat]: cur.stats[stat] + 1 },
      xp: cur.xp - 8,
    });
  }

  function purchaseBP() {
    const cur = character.value;
    if (cur.xp < 10 || cur.bp >= 5 || cur.hunger !== 0) return;
    if (isCreation) {
      updateCharacter({ bp: Math.min(5, cur.bp + 1), xp: cur.xp - 10 });
    } else {
      setXP(cur.xp - 10);
      addPendingUpgrade({ type: 'bp', xpCost: 10 });
    }
  }

  function handleUnlockAccess() {
    enterDisciplineBuyMode();
    switchContentTab('disciplines');
  }

  const basicMoves = data?.basicMoves ?? [];

  return (
    <div class="vamp-rpanel-scroll">
      {isCreation && (
        <div class="vamp-advancement-creation">
          <p class="vamp-advancement-creation__title">Starting XP</p>
          <p class="vamp-advancement-creation__formula">
            {(() => {
              const hasExtras = flawXP > 0 || baneXP > 0 || variantXP > 0;
              return <>
                BP {char.bp}{char.bp === 0 ? ' (min 1)' : ''} × 2
                {hasExtras ? <> = {bpBase}</> : null}
                {flawXP > 0 && <> + {flawXP} Flaws</>}
                {baneXP > 0 && <> + {baneXP} Banes</>}
                {variantXP > 0 && <> + {variantXP} Both Banes</>}
                {' '}= <strong>{startingXP} XP</strong>
                {rawStarting > 10 && <span class="vamp-advancement-creation__cap"> (capped at 10)</span>}
              </>;
            })()}
          </p>
          <p class="vamp-advancement-creation__hint">
            Spend your starting XP below. Anything unspent carries over into play.
          </p>
        </div>
      )}

      <div class="vamp-advancement-xp">
        <span class="vamp-advancement-xp__label">Available XP</span>
        <span class="vamp-advancement-xp__value">{char.xp}</span>
      </div>

      {char.pendingUpgrades.length > 0 && (
        <CollapsibleSection title="Pending (New Night)" defaultOpen>
          <div class="vamp-adv-pending">
            {char.pendingUpgrades.map(u => (
              <div key={u.id} class="vamp-adv-pending__item">
                <span>{u.type === 'bp' ? 'Blood Potency +1' : u.type === 'discipline-access' ? `Unlock ${u.slug}` : `Learn ${u.powerName}`}</span>
                <span class="vamp-adv-pending__cost">{u.xpCost} XP</span>
              </div>
            ))}
            <p class="vamp-adv-pending__note">These apply when you click New Night.</p>
          </div>
        </CollapsibleSection>
      )}

      {isClan && (isCreation || isEdit) && optExtras && (
        <CollapsibleSection title="Clan Bane" pill={char.baneChoice === 'both' ? '+5 XP' : char.baneChoice} defaultOpen={isCreation}>
          <div class="vamp-adv-bane-variant">
            {(['standard', 'variant', 'both'] as const).map(opt => {
              const variant = optExtras.clanBaneVariants.find(v => v.clan === char.playbook);
              const label = opt === 'standard' ? 'Standard Bane'
                : opt === 'variant' ? (variant?.baneName ?? 'Variant Bane')
                : 'Both (+5 XP)';
              return (
                <label key={opt} class={`vamp-adv-radio ${char.baneChoice === opt ? 'vamp-adv-radio--active' : ''}`}>
                  <input
                    type="radio"
                    name="bane-variant"
                    checked={char.baneChoice === opt}
                    onChange={() => setLocalBaneChoice(opt)}
                  />
                  {label}
                </label>
              );
            })}
            {char.baneChoice === 'variant' || char.baneChoice === 'both' ? (() => {
              const variant = optExtras.clanBaneVariants.find(v => v.clan === char.playbook);
              if (!variant) return null;
              return (
                <div class="vamp-adv-bane-variant__desc"
                  dangerouslySetInnerHTML={{ __html: renderGameMarkdown(variant.consequences) }}
                />
              );
            })() : null}
          </div>
        </CollapsibleSection>
      )}

      {(isCreation || isEdit) && optExtras && (
        <CollapsibleSection title="Folkloric Banes" pill={`${userBaneCount} chosen`} defaultOpen={isCreation}>
          <div class="vamp-adv-extras-list">
            {isCreation && (
              <p class="vamp-adv-extras-list__cap">
                {userBaneCount}/3 chosen {isBaali && '(auto-granted Banes give half XP and don’t count)'}
              </p>
            )}
            {char.predatorType === 'Cucuy' && (
              <p class="vamp-adv-extras-list__note">Required: at least 1 Folkloric Bane worth 2 XP or more.</p>
            )}
            {optExtras.folkloricBanes.map(bane => {
              const selected = char.folkloricBanes.some(b => b.baneName === bane.baneName);
              const granted = char.folkloricBanes.some(b => b.baneName === bane.baneName && b.fromPlaybookBane);
              const disabled = !selected && atBaneCap;
              return (
                <FolkloricBaneRow
                  key={bane.baneName}
                  bane={bane}
                  selected={selected}
                  granted={granted}
                  disabled={disabled}
                  onToggle={() => toggleFolkloricBane(bane.baneName, bane.xpGain)}
                />
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {(isCreation || isEdit) && optExtras && (
        <CollapsibleSection title="Merits" pill={`${char.merits.length} chosen`} defaultOpen={isCreation}>
          <div class="vamp-adv-extras-list">
            {isCreation && (
              <p class="vamp-adv-extras-list__cap">
                {meritFlawCount}/{meritFlawCap} Merits + Flaws combined
              </p>
            )}
            {groupByCategory(optExtras.merits).map(([cat, items]) => {
              const visible = sortByXPThenName(
                items.filter(m =>
                  char.merits.some(x => x.name === m.name) || checkMeritEligibility(m, char),
                ),
                m => m.xpCost,
              );
              if (visible.length === 0) return null;
              return (
                <div key={cat} class="vamp-adv-category-group">
                  <div class="vamp-adv-category-group__heading">{cat}</div>
                  {visible.map(merit => {
                    const sel = char.merits.find(m => m.name === merit.name);
                    const selected = !!sel;
                    const eligible = checkMeritEligibility(merit, char);
                    const disabled = !selected && (!eligible || atMeritFlawCap || (isCreation && char.xp < parseXPValue(merit.xpCost)));
                    const opts = getSubSelectionOptions(merit.name, char);
                    return (
                      <MeritRow
                        key={merit.name}
                        merit={merit}
                        selected={selected}
                        disabled={disabled}
                        onToggle={(chosen) => toggleMerit(merit.name, merit.xpCost, chosen)}
                        subOptions={opts}
                        selection={sel?.selection}
                        onSelectionChange={(v) => setMeritSelection(merit.name, v)}
                        storedXP={sel?.xpCost}
                        xpAvailable={isCreation ? char.xp : undefined}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {(isCreation || isEdit) && optExtras && (
        <CollapsibleSection title="Flaws" pill={`${char.flaws.length} chosen`} defaultOpen={isCreation}>
          <div class="vamp-adv-extras-list">
            {isCreation && (
              <p class="vamp-adv-extras-list__cap">
                {meritFlawCount}/{meritFlawCap} Merits + Flaws combined
              </p>
            )}
            {groupByCategory(optExtras.flaws).map(([cat, items]) => {
              const visible = sortByXPThenName(
                items.filter(f =>
                  char.flaws.some(x => x.name === f.name) || checkFlawEligibility(f, char),
                ),
                f => f.xpGain,
              );
              if (visible.length === 0) return null;
              return (
                <div key={cat} class="vamp-adv-category-group">
                  <div class="vamp-adv-category-group__heading">{cat}</div>
                  {visible.map(flaw => {
                    const sel = char.flaws.find(f => f.name === flaw.name);
                    const selected = !!sel;
                    const eligible = checkFlawEligibility(flaw, char);
                    const disabled = !selected && (!eligible || atMeritFlawCap);
                    const opts = getSubSelectionOptions(flaw.name, char);
                    return (
                      <FlawRow
                        key={flaw.name}
                        flaw={flaw}
                        selected={selected}
                        disabled={disabled}
                        onToggle={(chosen) => toggleFlaw(flaw.name, flaw.xpGain, chosen)}
                        subOptions={opts}
                        selection={sel?.selection}
                        onSelectionChange={(v) => setFlawSelection(flaw.name, v)}
                        storedXP={sel?.xpGain}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Discipline Access" pill="3 or 5 XP">
        <p class="vamp-adv-extras-list__hint">
          Unlock new Disciplines on the Disciplines tab.
        </p>
        <button class="vamp-advancement-acquire" onClick={handleUnlockAccess}>
          Unlock Access
        </button>
      </CollapsibleSection>

      <CollapsibleSection title="Stat Increases" pill="8 XP per +1">
        <div class="vamp-adv-stats">
          {ALL_STATS.map(stat => {
            const val = char.stats[stat];
            const atCap = val >= cap;
            return (
              <button
                key={stat}
                class={`vamp-adv-stat-btn ${atCap ? 'vamp-adv-stat-btn--capped' : ''}`}
                disabled={atCap || char.xp < 8}
                onClick={() => purchaseStat(stat)}
              >
                <span class="vamp-adv-stat-btn__name">{stat}</span>
                <span class="vamp-adv-stat-btn__val">
                  {val >= 0 ? '+' : ''}{val} {atCap ? '(max)' : `→ +${val + 1}`}
                </span>
              </button>
            );
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Advanced Moves" pill="5 XP per Move">
        <div class="vamp-adv-moves">
          {basicMoves.map(move => {
            const unlocked = char.advancedMoves.includes(move.name);
            return (
              <button
                key={move.name}
                class={`vamp-adv-move-btn ${unlocked ? 'vamp-adv-move-btn--unlocked' : ''}`}
                disabled={unlocked || char.xp < 5}
                onClick={() => buyAdvancedMove(move.name)}
              >
                {unlocked && <span class="vamp-adv-move-btn__check">{'✓'}</span>}
                {move.name}
              </button>
            );
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Blood Potency" pill="10 XP">
        <div class="vamp-adv-bp">
          <button
            class="vamp-advancement-acquire"
            disabled={char.xp < 10 || char.bp >= 5 || char.hunger !== 0}
            onClick={purchaseBP}
          >
            Increase to BP {char.bp + 1}
          </button>
          {char.bp >= 5 && <p class="vamp-adv-bp__note">Blood Potency is at maximum.</p>}
          {char.hunger !== 0 && char.bp < 5 && (
            <p class="vamp-adv-bp__note">Requires 0 Hunger.</p>
          )}
          {!isCreation && char.bp < 5 && char.hunger === 0 && char.xp >= 10 && (
            <p class="vamp-adv-bp__note">Applies on New Night.</p>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function FolkloricBaneRow({ bane, selected, granted, disabled, onToggle }: {
  bane: { baneName: string; consequences: string; xpGain: string };
  selected: boolean;
  granted?: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const expanded = useSignal(false);
  return (
    <div class={`vamp-adv-extra-row ${selected ? 'vamp-adv-extra-row--selected' : ''}`}>
      <div class="vamp-adv-extra-row__header" onClick={() => { expanded.value = !expanded.value; }}>
        <span class={`vamp-disc__bat vamp-disc__bat--sm ${expanded.value ? 'vamp-disc__bat--open' : ''}`} />
        <span class="vamp-adv-extra-row__name">{bane.baneName}</span>
        <span class="vamp-adv-extra-row__cost vamp-adv-extra-row__cost--gain">{bane.xpGain}</span>
        {granted ? (
          <span class="vamp-disc__badge vamp-disc__badge--granted">Granted</span>
        ) : (
          <button
            class={`vamp-btn vamp-btn--sm ${selected ? 'vamp-btn--unselect' : 'vamp-btn--select'}`}
            disabled={disabled && !selected}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            {selected ? 'Drop' : 'Take'}
          </button>
        )}
      </div>
      {expanded.value && (
        <div class="vamp-adv-extra-row__body"
          dangerouslySetInnerHTML={{ __html: renderGameMarkdown(bane.consequences) }}
        />
      )}
    </div>
  );
}

function SubSelectionDropdown({ options, selection, onChange }: {
  options: string[];
  selection?: string;
  onChange: (val: string) => void;
}) {
  return (
    <div class="vamp-adv-extra-row__sub-select">
      <select
        class="creation-dropdown creation-dropdown--sm"
        value={selection || ''}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
      >
        <option value="" disabled>Choose...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function MeritRow({ merit, selected, disabled, onToggle, subOptions, selection, onSelectionChange, storedXP, xpAvailable }: {
  merit: Merit;
  selected: boolean;
  disabled: boolean;
  onToggle: (chosenXP?: string) => void;
  subOptions?: string[] | null;
  selection?: string;
  onSelectionChange?: (val: string) => void;
  storedXP?: string;
  xpAvailable?: number;
}) {
  const expanded = useSignal(false);
  const range = xpRange(merit.xpCost);
  const chosenXP = useSignal(range ? range[0] : 0);

  const displayCost = selected && storedXP ? parseXPValue(storedXP) : null;
  const cantAfford = !selected && !!range && xpAvailable != null && chosenXP.value > xpAvailable;

  return (
    <div class={`vamp-adv-extra-row ${selected ? 'vamp-adv-extra-row--selected' : ''}`}>
      <div class="vamp-adv-extra-row__header" onClick={() => { expanded.value = !expanded.value; }}>
        <span class={`vamp-disc__bat vamp-disc__bat--sm ${expanded.value ? 'vamp-disc__bat--open' : ''}`} />
        <span class="vamp-adv-extra-row__name">
          {merit.name}
          {selected && selection && <span class="vamp-adv-extra-row__selection"> ({selection})</span>}
        </span>
        {range && !selected ? (
          <span class="vamp-adv-extra-row__cost">
            <select
              class="creation-dropdown creation-dropdown--xp"
              value={chosenXP.value}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { chosenXP.value = parseInt((e.target as HTMLSelectElement).value, 10); }}
            >
              {Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i).map(n => (
                <option key={n} value={n}>{n} XP</option>
              ))}
            </select>
          </span>
        ) : (
          <span class="vamp-adv-extra-row__cost">{displayCost ?? merit.xpCost} XP</span>
        )}
        <button
          class={`vamp-btn vamp-btn--sm ${selected ? 'vamp-btn--unselect' : 'vamp-btn--select'}`}
          disabled={(disabled || cantAfford) && !selected}
          onClick={(e) => { e.stopPropagation(); onToggle(range ? String(chosenXP.value) : undefined); }}
        >
          {selected ? 'Drop' : 'Take'}
        </button>
      </div>
      {selected && subOptions && subOptions.length > 0 && onSelectionChange && (
        <SubSelectionDropdown options={subOptions} selection={selection} onChange={onSelectionChange} />
      )}
      {expanded.value && (
        <div class="vamp-adv-extra-row__body">
          {merit.limit !== '—' && (
            <div class="vamp-adv-extra-row__meta">
              <span dangerouslySetInnerHTML={{ __html: renderGameMarkdown(merit.limit) }} />
            </div>
          )}
          <div dangerouslySetInnerHTML={{ __html: renderGameMarkdown(merit.description) }} />
        </div>
      )}
    </div>
  );
}

function FlawRow({ flaw, selected, disabled, onToggle, subOptions, selection, onSelectionChange, storedXP }: {
  flaw: Flaw;
  selected: boolean;
  disabled: boolean;
  onToggle: (chosenXP?: string) => void;
  subOptions?: string[] | null;
  selection?: string;
  onSelectionChange?: (val: string) => void;
  storedXP?: string;
}) {
  const expanded = useSignal(false);
  const range = xpRange(flaw.xpGain);
  const chosenXP = useSignal(range ? range[0] : 0);

  const displayGain = selected && storedXP ? parseXPValue(storedXP) : null;

  return (
    <div class={`vamp-adv-extra-row ${selected ? 'vamp-adv-extra-row--selected' : ''}`}>
      <div class="vamp-adv-extra-row__header" onClick={() => { expanded.value = !expanded.value; }}>
        <span class={`vamp-disc__bat vamp-disc__bat--sm ${expanded.value ? 'vamp-disc__bat--open' : ''}`} />
        <span class="vamp-adv-extra-row__name">
          {flaw.name}
          {selected && selection && <span class="vamp-adv-extra-row__selection"> ({selection})</span>}
        </span>
        {range && !selected ? (
          <span class="vamp-adv-extra-row__cost vamp-adv-extra-row__cost--gain">
            <select
              class="creation-dropdown creation-dropdown--xp"
              value={chosenXP.value}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { chosenXP.value = parseInt((e.target as HTMLSelectElement).value, 10); }}
            >
              {Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i).map(n => (
                <option key={n} value={n}>+{n} XP</option>
              ))}
            </select>
          </span>
        ) : (
          <span class="vamp-adv-extra-row__cost vamp-adv-extra-row__cost--gain">
            +{displayGain != null ? displayGain : flaw.xpGain} XP
          </span>
        )}
        <button
          class={`vamp-btn vamp-btn--sm ${selected ? 'vamp-btn--unselect' : 'vamp-btn--select'}`}
          disabled={disabled && !selected}
          onClick={(e) => { e.stopPropagation(); onToggle(range ? String(chosenXP.value) : undefined); }}
        >
          {selected ? 'Drop' : 'Take'}
        </button>
      </div>
      {selected && subOptions && subOptions.length > 0 && onSelectionChange && (
        <SubSelectionDropdown options={subOptions} selection={selection} onChange={onSelectionChange} />
      )}
      {expanded.value && (
        <div class="vamp-adv-extra-row__body">
          {flaw.limit !== '—' && (
            <div class="vamp-adv-extra-row__meta">
              <span dangerouslySetInnerHTML={{ __html: renderGameMarkdown(flaw.limit) }} />
            </div>
          )}
          <div dangerouslySetInnerHTML={{ __html: renderGameMarkdown(flaw.description) }} />
        </div>
      )}
    </div>
  );
}

function RulesPanel() {
  const rules = useSignal(getCachedRules());

  useEffect(() => {
    if (rules.value) return;
    let live = true;
    /* If prefetch failed or hasn't run, retry */
    let p = getRulesPending();
    if (!p) { prefetchRules(); p = getRulesPending(); }
    if (p) p.then(r => { if (live) rules.value = r; });
    return () => { live = false; };
  }, []);

  /* Fired by the Coterie "More Info" pill: once the deep-linked section is rendered open,
     double-pulse its second paragraph. Nonce guard so a manual section toggle never re-pulses. */
  useSignalEffect(() => {
    const nonce = rulesPulse.value;
    const open = rulesOpenSection.value;
    const ready = rules.value;
    if (!nonce || nonce === lastRulesPulse || !ready || open == null) return;
    lastRulesPulse = nonce;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const rafId = requestAnimationFrame(() => {
      const p = document.querySelector('.vamp-rules-body p:nth-of-type(2)') as HTMLElement | null;
      if (!p) return;
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      p.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      p.classList.add('vamp-rules-pulse');
      timeoutId = setTimeout(() => p.classList.remove('vamp-rules-pulse'), 2600);
    });
    return () => { cancelAnimationFrame(rafId); clearTimeout(timeoutId); };
  });

  if (!rules.value) return <div class="vamp-rpanel-scroll" />;
  const { title, intro, sections } = rules.value;

  return (
    <div class="vamp-rpanel-scroll">
      {title && <div class="vamp-rules-title" dangerouslySetInnerHTML={{ __html: title }} />}
      <div class="vamp-rules-intro" dangerouslySetInnerHTML={{ __html: intro }} />
      {sections.map(s => (
        <div key={s.title} class={`vamp-move-section ${rulesOpenSection.value === s.title ? 'vamp-move-section--open' : ''}`}>
          <div class="vamp-move-section__bar" onClick={() => { rulesOpenSection.value = rulesOpenSection.value === s.title ? null : s.title; }}>
            <span class="vamp-move-section__name">{s.title}</span>
          </div>
          {rulesOpenSection.value === s.title && (
            <div class="vamp-move-section__body vamp-rules-body"
              dangerouslySetInnerHTML={{ __html: s.body }}
            />
          )}
        </div>
      ))}
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
