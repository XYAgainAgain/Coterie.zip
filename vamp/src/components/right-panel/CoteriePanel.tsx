/* All rendered markdown is from Coterie's verified JSON parsers (trusted content, duh) */

import { useSignal } from '@preact/signals';
import { rulesOpenSection, rulesPulse, switchTab } from '../../state/panel';
import { gameData } from '../../state/derived';
import { coterieState, adjustCoterieStat, setHavenDescription, setHavenPicks } from '../../state/coterie';
import { editMode } from '../../state/ui';
import { activeCoterie, createCoterie, joinCoterie, leaveCoterie, activeCharacterId, setStConsent, setStDeclined, castStKickVote } from '../../state/persistence';
import { activeStConsent, activeStDeclined, consentValid } from '../../state/storyteller';
import { auth } from '../../firebase';
import { EditableTextField } from '../EditableTextField';
import { showToast } from '../../state/toasts';
import { renderGameMarkdown } from '../../data/transforms';
import { COTERIE_STAT_NAMES } from '../../data/types';
import type { CoterieStatName, HavenFeatures } from '../../data/types';
import { CollapsibleSection } from './shared';

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
   kept as named consts so they can be made unlockable later, not buried literals. */
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

export function CoteriePanel() {
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
