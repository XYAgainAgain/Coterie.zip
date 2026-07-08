import { signal, useSignal } from '@preact/signals';
import { coterieState, masqueradeClock } from '../../state/coterie';
import { gameData } from '../../state/derived';
import { STAT_NAMES, COTERIE_STAT_NAMES } from '../../data/types';
import { ClockDisplay } from '../ClockDisplay';
import { stFillMasquerade, stUnfillMasquerade } from '../../state/stMasquerade';
import { disciplineName, partitionByConsent, type StRosterEntry } from '../../state/stRosterLogic';
import { renderGameMarkdown } from '../../data/transforms';
import { HavenFeatureSelector, CoterieMovesList } from '../right-panel/CoteriePanel';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/* Full stat names overflow the rail; three-letter forms are Sam's canonical abbreviations. */
const STAT_ABBR: Record<string, string> = { Blood: 'BLD', Shadow: 'SHA', Resolve: 'RES', Demeanor: 'DEM', Wits: 'WIT' };

/* Per-device collapse state for the briefing sections + MQC, keyed by section id.
   Undefined = never touched, so each section falls back to its own default. */
const RAIL_SECTIONS_KEY = 'vamp-st-rail-sections';

function loadRailSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(RAIL_SECTIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

const railSections = signal<Record<string, boolean>>(loadRailSections());

function railSectionOpen(id: string, fallback: boolean): boolean {
  const v = railSections.value[id];
  return v === undefined ? fallback : v;
}

function toggleRailSection(id: string, fallback: boolean) {
  const next = { ...railSections.value, [id]: !railSectionOpen(id, fallback) };
  railSections.value = next;
  try { localStorage.setItem(RAIL_SECTIONS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
}

function Chevron({ open, className }: { open: boolean; className: string }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" class={`${className} ${open ? 'is-open' : ''}`}>
      <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function HungerPips({ value }: { value: number }) {
  return (
    <span class="vamp-st-pips" aria-label={`Hunger ${value} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span class={`vamp-st-pip ${i < value ? 'vamp-st-pip--on' : ''}`} key={i} />
      ))}
    </span>
  );
}

/* Controlled collapsible carrying one slab of the Coterie briefing; default collapsed so
   the ST opens detailed reading deliberately. Height animates via grid 0fr→1fr. */
function RailSection({ id, title, defaultOpen, children }: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: preact.ComponentChildren;
}) {
  const open = railSectionOpen(id, defaultOpen ?? false);
  return (
    <section class="vamp-st-sec">
      <button
        class="vamp-st-sec__bar"
        aria-expanded={open}
        onClick={() => toggleRailSection(id, defaultOpen ?? false)}
      >
        <span class="vamp-st-sec__title">{title}</span>
        <Chevron open={open} className="vamp-st-sec__chev" />
      </button>
      <div class={`vamp-st-sec__wrap ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div class="vamp-st-sec__body">{children}</div>
      </div>
    </section>
  );
}

/* Read-only mirror of the player's Coterie tab: Type description, Haven, and Coterie Moves.
   Interactive controls (member management, consent, code) are deliberately omitted. */
function CoterieBriefing() {
  const cot = coterieState.value;
  const data = gameData.value;
  const coterieType = data?.coterieTypes.find(t => t.name === cot.typeName) ?? null;
  const coterieMoves = data?.coterieMoves ?? [];
  const haven = cot.havenDescription.trim();

  return (
    <div class="vamp-st-briefing">
      {coterieType && (
        <RailSection id="type" title="About">
          {/* Trusted parser JSON, same source the player panel renders. */}
          <div class="vamp-rpanel-field__body"
            dangerouslySetInnerHTML={{ __html: renderGameMarkdown(coterieType.description) }}
          />
        </RailSection>
      )}

      <RailSection id="haven" title="Haven">
        {haven
          ? <p class="vamp-st-briefing__haven">{haven}</p>
          : <p class="vamp-st-briefing__empty">No Haven described.</p>}
        {coterieType && (
          <HavenFeatureSelector
            features={coterieType.havenFeatures}
            positives={cot.havenPositives}
            negatives={cot.havenNegatives}
            isEditing={false}
          />
        )}
      </RailSection>

      <RailSection id="moves" title="Coterie Moves">
        {coterieMoves.length
          ? <CoterieMovesList moves={coterieMoves} />
          : <p class="vamp-st-briefing__empty">No Coterie Moves loaded.</p>}
      </RailSection>
    </div>
  );
}

function LockedCard({ entry }: { entry: StRosterEntry }) {
  return (
    <div class="vamp-st-card vamp-st-card--locked">
      <div class="vamp-st-card__head">
        {entry.portraitUrl
          ? <img class="vamp-st-card__portrait" src={entry.portraitUrl} alt="" loading="lazy" />
          : <span class="vamp-st-card__portrait vamp-st-card__portrait--blank" aria-hidden="true" />}
        <div class="vamp-st-card__id">
          <span class="vamp-st-card__name">{entry.name}</span>
          <span class="vamp-st-card__await">Awaiting consent from {entry.name}</span>
        </div>
      </div>
    </div>
  );
}

function RosterCard({ code, entry }: { code: string; entry: StRosterEntry }) {
  const expanded = useSignal(false);
  const v = entry.vitals!;
  const disciplines = gameData.value?.disciplines;
  /* Escalation to the full sheet is a new tab, per §12.3; only consented cards link out. */
  const openSheet = () => window.open(`/vamp/${code}/${entry.slug}`, '_blank', 'noopener');

  return (
    <div class="vamp-st-card">
      <div class="vamp-st-card__head">
        <button class="vamp-st-card__portrait-btn" onClick={openSheet} title={`Open ${entry.name}'s sheet in a new tab`}>
          {entry.portraitUrl
            ? <img class="vamp-st-card__portrait" src={entry.portraitUrl} alt="" loading="lazy" />
            : <span class="vamp-st-card__portrait vamp-st-card__portrait--blank" aria-hidden="true" />}
        </button>
        <div class="vamp-st-card__id">
          <button class="vamp-st-card__name vamp-st-card__name-btn" onClick={openSheet}>{entry.name}</button>
          <span class="vamp-st-card__sub">{[entry.playbook, entry.ageBracket].filter(Boolean).join(' · ')}</span>
        </div>
        <button
          class="vamp-st-card__chevron"
          aria-expanded={expanded.value}
          aria-label={expanded.value ? 'Collapse details' : 'Expand details'}
          onClick={() => { expanded.value = !expanded.value; }}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" class={expanded.value ? 'is-open' : ''}>
            <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <div class="vamp-st-card__vitals">
        <span class="vamp-st-vital">
          <span class="vamp-st-vital__label">Hunger</span>
          <HungerPips value={v.hunger} />
        </span>
        <span class="vamp-st-vital">
          <span class="vamp-st-vital__label">Harm</span>
          <span class="vamp-st-vital__val">
            {v.harm.superficial}<abbr title="Superficial">s</abbr> {v.harm.aggravated}<abbr title="Aggravated">a</abbr> / {v.maxHP}
          </span>
        </span>
        <span class="vamp-st-vital">
          <span class="vamp-st-vital__label">Humanity</span>
          <span class="vamp-st-vital__val">{v.humanity}/10</span>
        </span>
      </div>

      {/* Always mounted so height can animate (grid 0fr→1fr); inner is clipped when closed. */}
      <div class={`vamp-st-card__expand-wrap ${expanded.value ? 'is-open' : ''}`} aria-hidden={!expanded.value}>
        <div class="vamp-st-card__expand">
          <div class="vamp-st-card__stats">
            {STAT_NAMES.map(s => (
              <span class="vamp-st-stat" key={s}>
                <span class="vamp-st-stat__name">{STAT_ABBR[s] ?? s}</span>
                <span class="vamp-st-stat__num">{signed(v.stats[s] ?? 0)}</span>
              </span>
            ))}
          </div>
          <div class="vamp-st-card__divider" role="presentation" />
          <div class="vamp-st-card__row">
            <span class="vamp-st-card__row-label">Disciplines</span>
            <span class="vamp-st-card__row-val">
              {v.disciplines.length ? v.disciplines.map(d => disciplineName(d, disciplines)).join(', ') : '—'}
            </span>
          </div>
          <div class="vamp-st-card__row">
            <span class="vamp-st-card__row-label">Convictions</span>
            {v.convictions.length
              ? <ul class="vamp-st-card__convictions">{v.convictions.map((c, i) => {
                  const ts = v.touchstones[i]?.name?.trim();
                  return (
                    <li key={i}>
                      {c}
                      {ts && <span class="vamp-st-card__touchstone" title="Touchstone">{ts}</span>}
                    </li>
                  );
                })}</ul>
              : <span class="vamp-st-card__row-val">—</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Rail-bottom Masquerade Clock: collapsed = a slim name + count bar; expanded = the full
   clock (left-click fills, right-click unfills). Same per-device persistence as the sections. */
function MasqueradeDial() {
  const open = railSectionOpen('mqc', true);
  const mc = masqueradeClock.value;
  return (
    <div class="vamp-st-dials">
      <button class="vamp-st-mqc__bar" aria-expanded={open} onClick={() => toggleRailSection('mqc', true)}>
        <Chevron open={open} className="vamp-st-mqc__chev" />
        <span class="vamp-st-mqc__name">The Masquerade</span>
        <span class="vamp-st-mqc__count">{mc.filled}/{mc.segments}</span>
      </button>
      <div class={`vamp-st-mqc__wrap ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div class="vamp-st-mqc__inner">
          <div class="vamp-st-dials__clock">
            <ClockDisplay
              clock={mc}
              gradient
              onFill={() => void stFillMasquerade()}
              onUnfill={() => void stUnfillMasquerade()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function StRosterRail({ code, roster }: { code: string; roster: StRosterEntry[] }) {
  const { consented, locked } = partitionByConsent(roster);
  const ordered = [...consented, ...locked];
  const stats = coterieState.value.stats;

  return (
    <aside class="vamp-st-rail">
      {/* Pinned chronicle header: role + join code, Coterie name, compact Coterie stats. */}
      <div class="vamp-st-rail__top">
        <div class="vamp-st-rail__idrow">
          <span class="vamp-st-rail__eyebrow">Storyteller</span>
          <span class="vamp-st-rail__code" title="Coterie join code">{code}</span>
        </div>
        <h1 class="vamp-st-rail__title">{coterieState.value.typeName || 'Your Chronicle'}</h1>
        <div class="vamp-st-rail__stats">
          {COTERIE_STAT_NAMES.map(s => (
            <span class="vamp-st-rail__stat" key={s}>
              <span class="vamp-st-rail__stat-name">{s}</span>
              <span class="vamp-st-rail__stat-num">{signed(stats[s] ?? 0)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Briefing sections + roster share one vertical scroll; the rail never scrolls sideways. */}
      <div class="vamp-st-rail__scroll">
        <CoterieBriefing />

        <div class="vamp-st-roster">
          {ordered.length === 0
            ? <p class="vamp-st-roster__empty">No members have joined this Coterie yet.</p>
            : ordered.map(e => (
                e.consented && e.vitals
                  ? <RosterCard code={code} entry={e} key={e.characterId} />
                  : <LockedCard entry={e} key={e.characterId} />
              ))}
        </div>
      </div>

      <MasqueradeDial />
    </aside>
  );
}
