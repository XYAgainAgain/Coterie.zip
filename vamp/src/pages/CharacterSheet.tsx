import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { SectionBox } from '../components/SectionBox';
import { RightColumn } from '../components/RightColumn';
import { RightPanelContent } from '../components/RightPanelTabs';
import { DisciplinesTab } from '../components/DisciplinesTab';
import { ClockDisplay } from '../components/ClockDisplay';
import { NewClockWidget } from '../components/NewClockWidget';
import { NotebookTab } from '../components/NotebookTab';
import { ModifierBar } from '../components/ModifierBar';
import { SceneTools } from '../components/SceneTools';
import { SpotlightOverlay } from '../components/creation/SpotlightOverlay';
import { GuideCard } from '../components/creation/GuideCard';
import { PortraitEditor } from '../components/PortraitEditor';
import { rightColumnWidth, rightColumnMinimized, rightColumnMaxWidth, MIN_WIDTH as MIN_RIGHT_WIDTH } from '../components/RightColumn';
import {
  character, updateCharacter, fillClockSegment, unfillClockSegment, removeClock,
  setHunger, setBP, setXP, fireXPTrigger, setHumanity, setHarm,
  addDebt, removeDebt, updateDebt, cycleDebtState, adjustStat,
} from '../state/character';
import { editMode, viewingOtherSheet } from '../state/ui';
import { masqueradeClock, fillMasquerade, unfillMasquerade } from '../state/coterie';
import {
  currentPlaybook, currentPredatorType,
  moveStatMap, otherMoves, maxHP, accessibleDisciplineData,
  getSnippet, gameData, statCap, startingDisciplineSlugs,
} from '../state/derived';
import { switchTab, openMove, activeContentTab } from '../state/panel';
import { renderGameMarkdown, resolveSnippetTokens, type SnippetContext } from '../data/transforms';
import { activeCharacterId, loadCharacter, flushSave } from '../state/persistence';
import { creationMode, creationStep, stepComplete, STEP_ZONE } from '../state/creation';
import { type TourZone } from '../state/tour';
import {
  guideActive, currentGuideStep, isCreationPhase, isTourPhase,
  startGuide,
} from '../state/guide';
import type { StatName } from '../data/types';
import type { Touchstone, Bio, Clock } from '../state/character';

// All rendered markdown comes from our own verified JSON parsers (trusted content)

if (import.meta.env.DEV) {
  (window as any).__startGuide = startGuide;
  import('../state/toasts').then(m => { (window as any).__toast = m.forceToast; });
}

const STAT_ORDER: StatName[] = ['Blood', 'Shadow', 'Resolve', 'Demeanor', 'Wits'];

type PipState = 'empty' | 'slashed' | 'filled' | 'confirm';
const PIP_CYCLE: PipState[] = ['empty', 'slashed', 'filled', 'confirm'];

function DualPhaseBox({ state, onAdvance, onReverse }: {
  state: PipState;
  onAdvance: () => void;
  onReverse: (e: Event) => void;
}) {
  return (
    <div
      class={`vamp-pip vamp-pip--${state}`}
      onClick={onAdvance}
      onContextMenu={onReverse}
    >
      {state === 'confirm' && <span class="vamp-pip__confirm">?</span>}
    </div>
  );
}

function useDualPhase(initial: PipState[]) {
  const boxes = useSignal<PipState[]>(initial);

  function advance(i: number): PipState[] {
    const next = [...boxes.value];
    const idx = PIP_CYCLE.indexOf(next[i]);
    next[i] = PIP_CYCLE[(idx + 1) % PIP_CYCLE.length];
    boxes.value = next;
    return next;
  }

  function reverse(i: number, e: Event): PipState[] {
    e.preventDefault();
    const next = [...boxes.value];
    const idx = PIP_CYCLE.indexOf(next[i]);
    next[i] = PIP_CYCLE[(idx - 1 + PIP_CYCLE.length) % PIP_CYCLE.length];
    boxes.value = next;
    return next;
  }

  return { boxes, advance, reverse };
}

function DualPhasePips({ boxes, advance, reverse }: {
  boxes: PipState[];
  advance: (i: number) => void;
  reverse: (i: number, e: Event) => void;
}) {
  return (
    <>
      {boxes.map((s, i) => (
        <DualPhaseBox
          key={i}
          state={s}
          onAdvance={() => advance(i)}
          onReverse={(e) => reverse(i, e)}
        />
      ))}
    </>
  );
}

function ClickPipRow({ value, count, onChange, muted, droplet }: {
  value: number;
  count: number;
  onChange?: (n: number) => void;
  muted?: boolean;
  droplet?: boolean;
}) {
  const shape = droplet ? 'vamp-pip--droplet' : 'vamp-pip--round';
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          class={`vamp-pip ${shape} vamp-pip--small ${i < value ? 'vamp-pip--filled' : ''} ${muted ? 'vamp-pip--muted' : ''}`}
          onClick={() => onChange?.(i < value ? i : i + 1)}
        />
      ))}
    </>
  );
}

function HungerTracker() {
  const hunger = character.value.hunger;

  const level = (() => {
    if (hunger === 0) return { name: 'Sated', text: 'Just fed well. No penalties.' };
    if (hunger <= 2) return { name: 'Manageable', text: 'Cravings present but controllable. No penalties.' };
    if (hunger === 3) return { name: 'Distracted', text: 'Blood is on your mind constantly. -1 Ongoing except Hunt, Feed, Dirty Your Claws.' };
    if (hunger === 4) return { name: 'Ravenous', text: 'You need blood soon. -2 Ongoing except Hunt, Feed, Dirty Your Claws.' };
    return { name: 'Frenzy', text: 'The Beast is driving. You must Feed until you reach 0 Hunger.' };
  })();

  return (
    <div>
      <div class="vamp-pip-row">
        <ClickPipRow value={hunger} count={5} onChange={setHunger} droplet />
        <span class="vamp-tracker-label">{hunger}/5</span>
      </div>
      <div class="vamp-tracker-note">
        <strong class={hunger >= 5 ? 'vamp-frenzy-glow' : ''}>{level.name}:</strong>{' '}{level.text}
      </div>
    </div>
  );
}

function BPTracker() {
  const bp = character.value.bp;
  const hp = maxHP.value;
  const isEdit = editMode.value;
  const pendingBP = character.value.pendingUpgrades.filter(u => u.type === 'bp').length;

  const bpText = bp === 0
    ? `${hp} HP, no Blood Surges, no Powers, no feeding restrictions`
    : `${hp} HP, Blood Surge ${bp}/night, level ${bp} Powers`;

  return (
    <div>
      <div class="vamp-pip-row">
        <ClickPipRow value={bp} count={5} onChange={isEdit ? setBP : undefined} droplet />
        <span class="vamp-tracker-label">BP {bp}</span>
        {isEdit && (
          <span class="vamp-tracker-adj">
            <button class="vamp-adj-btn" disabled={bp <= 0} onClick={() => setBP(bp - 1)}>-</button>
            <button class="vamp-adj-btn" disabled={bp >= 5} onClick={() => setBP(bp + 1)}>+</button>
          </span>
        )}
        {pendingBP > 0 && (
          <span class="vamp-tracker-pending">+{pendingBP} pending</span>
        )}
      </div>
      <div class="vamp-tracker-note">{bpText}</div>
    </div>
  );
}

function HumanityTracker() {
  const char = character.value;
  const filledCount = Math.max(0, char.humanity - char.stains);
  const initial: PipState[] = Array.from({ length: 10 }, (_, i) => {
    if (i < filledCount) return 'filled';
    if (i < char.humanity) return 'slashed';
    return 'empty';
  });

  const { boxes, advance: rawAdvance, reverse: rawReverse } = useDualPhase(initial);

  function countFromArray(arr: PipState[]) {
    const f = arr.filter(s => s === 'filled').length;
    const sl = arr.filter(s => s === 'slashed').length;
    return { f, sl };
  }

  function advance(i: number) {
    const next = rawAdvance(i);
    const { f, sl } = countFromArray(next);
    setHumanity(f + sl, sl);
  }

  function reverse(i: number, e: Event) {
    const next = rawReverse(i, e);
    const { f, sl } = countFromArray(next);
    setHumanity(f + sl, sl);
  }

  const stainCount = boxes.value.filter(s => s === 'slashed').length;
  const stainLabel = stainCount > 0
    ? ` (${stainCount} Stain${stainCount > 1 ? 's' : ''})`
    : '';

  return (
    <div>
      <div class="vamp-pip-row">
        <DualPhasePips boxes={boxes.value} advance={advance} reverse={reverse} />
        <span class="vamp-tracker-label">{boxes.value.filter(s => s === 'filled').length}{stainLabel}</span>
      </div>
      <div class="vamp-tracker-note">
        Touchscreens, digest food ~1hr. Blush of Life with Advantage.
      </div>
    </div>
  );
}

function HarmTracker({ hp }: { hp: number }) {
  const char = character.value;
  const initial: PipState[] = Array.from({ length: hp }, (_, i) => {
    if (i < char.harm.aggravated) return 'filled';
    if (i < char.harm.aggravated + char.harm.superficial) return 'slashed';
    return 'empty';
  });

  const { boxes, advance: rawAdvance, reverse: rawReverse } = useDualPhase(initial);

  function advance(i: number) {
    const next = rawAdvance(i);
    setHarm(
      next.filter(s => s === 'slashed').length,
      next.filter(s => s === 'filled').length,
    );
  }

  function reverse(i: number, e: Event) {
    const next = rawReverse(i, e);
    setHarm(
      next.filter(s => s === 'slashed').length,
      next.filter(s => s === 'filled').length,
    );
  }

  const sup = boxes.value.filter(s => s === 'slashed').length;
  const agg = boxes.value.filter(s => s === 'filled').length;
  const threshold = Math.ceil(hp / 2);

  return (
    <div>
      <div class="vamp-pip-row">
        <DualPhasePips boxes={boxes.value} advance={advance} reverse={reverse} />
      </div>
      <div class="vamp-tracker-note">
        {sup} Superficial &amp; {agg} Aggravated. | At 0 HP: ≥{threshold} Agg. = Final Death | &lt;{threshold} = Torpor
      </div>
    </div>
  );
}

function XPTracker() {
  const char = character.value;
  const playbook = currentPlaybook.value;
  const triggers = playbook?.xpTriggers ?? [];

  return (
    <div>
      <div class="vamp-pip-row">
        <ClickPipRow value={char.xp} count={10} onChange={setXP} />
        <span class="vamp-tracker-label">{char.xp}/10</span>
      </div>
      <div class="vamp-xp-triggers">
        <div class="vamp-xp-triggers__heading">Once each per session, gain +1 XP when you...</div>
        {triggers.map((trigger, i) => (
          <label class="vamp-xp-trigger" key={i}>
            <input
              type="checkbox"
              checked={char.xpTriggers[i] ?? false}
              onChange={() => fireXPTrigger(i)}
            />
            {/* Rendered markdown from our own verified JSON parsers (trusted content) */}
            {' '}<span dangerouslySetInnerHTML={{ __html: renderGameMarkdown(trigger) }} />
          </label>
        ))}
      </div>
    </div>
  );
}

function DebtEntry({ debtId, guarded }: { debtId: string; guarded?: boolean }) {
  const d = character.value.debts.find(x => x.id === debtId);
  if (!d) return null;

  const isEdit = editMode.value;
  const confirming = useSignal(false);
  const editingField = useSignal<'who' | 'text' | null>(null);

  useEffect(() => {
    if (!editMode.value) editingField.value = null;
  }, [editMode.value]);

  function handleAdvance() {
    if (guarded) {
      if (confirming.value) {
        confirming.value = false;
        cycleDebtState(debtId, false);
      } else {
        confirming.value = true;
      }
    } else {
      cycleDebtState(debtId, false);
    }
  }

  function handleReverse(e: Event) {
    e.preventDefault();
    if (guarded && !confirming.value) { confirming.value = true; return; }
    confirming.value = false;
    cycleDebtState(debtId, true);
  }

  function handleFieldKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === 'Escape') editingField.value = null;
  }

  return (
    <div class="vamp-debt">
      <div
        class={`vamp-pip vamp-pip--${confirming.value ? 'confirm' : d.state} ${guarded ? 'vamp-pip--muted' : ''}`}
        onClick={handleAdvance}
        onContextMenu={handleReverse}
      >
        {confirming.value && <span class="vamp-pip__confirm">?</span>}
      </div>
      <span class="vamp-debt__body">
        {editingField.value === 'who' ? (
          <input
            class="vamp-debt__edit-input vamp-debt__edit-input--who"
            value={d.who}
            autoFocus
            onInput={(e) => updateDebt(debtId, { who: (e.target as HTMLInputElement).value })}
            onBlur={() => { editingField.value = null; }}
            onKeyDown={handleFieldKey}
          />
        ) : (
          <span
            class={`vamp-debt__who ${d.state === 'filled' ? 'vamp-debt__who--cashed' : ''}`}
            onDblClick={() => { if (isEdit) editingField.value = 'who'; }}
          >{d.who || '(name)'}</span>
        )}
        {editingField.value === 'text' ? (
          <input
            class="vamp-debt__edit-input"
            value={d.text}
            autoFocus
            onInput={(e) => updateDebt(debtId, { text: (e.target as HTMLInputElement).value })}
            onBlur={() => { editingField.value = null; }}
            onKeyDown={handleFieldKey}
          />
        ) : (
          <span
            class={`vamp-debt__text ${d.state === 'filled' ? 'vamp-debt__text--cashed' : ''}`}
            onDblClick={() => { if (isEdit) editingField.value = 'text'; }}
          >{d.text || '(description)'}</span>
        )}
      </span>
      {isEdit && (
        <button
          class="vamp-debt__remove"
          onClick={() => removeDebt(debtId)}
          aria-label="Remove debt"
        >&times;</button>
      )}
    </div>
  );
}

function NewDebtForm({ direction, onDone }: { direction: 'owed' | 'owe'; onDone: () => void }) {
  const who = useSignal('');
  const text = useSignal('');
  const done = useSignal(false);

  function save() {
    if (done.value) return;
    done.value = true;
    if (who.value.trim()) {
      addDebt(direction, who.value.trim(), text.value.trim());
    }
    onDone();
  }

  return (
    <div class="vamp-debt vamp-debt--new">
      <div class="vamp-pip vamp-pip--empty" />
      <span class="vamp-debt__body">
        <input
          class="vamp-debt__edit-input vamp-debt__edit-input--who"
          placeholder="Who?"
          value={who.value}
          autoFocus
          onInput={(e) => { who.value = (e.target as HTMLInputElement).value; }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') onDone();
          }}
        />
        <input
          class="vamp-debt__edit-input"
          placeholder="What for?"
          value={text.value}
          onInput={(e) => { text.value = (e.target as HTMLInputElement).value; }}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') onDone();
          }}
        />
      </span>
    </div>
  );
}

function DebtColumn({ direction, guarded }: { direction: 'owed' | 'owe'; guarded?: boolean }) {
  const allDebts = character.value.debts;
  const isEdit = editMode.value;
  const adding = useSignal(false);
  const filtered = allDebts.filter(d => d.direction === direction);

  useEffect(() => {
    if (!editMode.value) adding.value = false;
  }, [editMode.value]);

  return (
    <div class="vamp-debt-list">
      {filtered.length === 0 && !adding.value && (
        <div class="vamp-debt-list__empty">None</div>
      )}
      {filtered.map(d => (
        <DebtEntry key={d.id} debtId={d.id} guarded={guarded} />
      ))}
      {adding.value && (
        <NewDebtForm direction={direction} onDone={() => { adding.value = false; }} />
      )}
      {isEdit && !adding.value && (
        <button
          class="vamp-debt-list__add"
          onClick={() => { adding.value = true; }}
        >+ Add</button>
      )}
    </div>
  );
}

function DebtPanel() {
  return (
    <div class="vamp-debts-split">
      <div class="vamp-debts-split__col">
        <div class="vamp-debts-split__heading">Owed to you</div>
        <DebtColumn direction="owed" />
      </div>
      <div class="vamp-debts-split__divider" />
      <div class="vamp-debts-split__col">
        <div class="vamp-debts-split__heading">You owe</div>
        <DebtColumn direction="owe" guarded />
      </div>
    </div>
  );
}

const ALL_TABS = ['Vitals', 'Disciplines', 'Possessions', 'Clocks & Debts', 'Notebook'] as const;

function ContentTabs() {
  const active = activeContentTab;
  const isViewing = viewingOtherSheet.value;
  const tabs = isViewing
    ? ALL_TABS.filter(t => t !== 'Notebook')
    : ALL_TABS;
  if (active.value >= tabs.length) active.value = 0;

  return (
    <div class="vamp-tabs">
      <nav
        class="vamp-tabs__bar"
        role="tablist"
        style={`--tab-count: ${tabs.length}; --tab-active-idx: ${active.value}`}
      >
        {tabs.map((tab, i) => (
          <button
            key={tab}
            role="tab"
            aria-selected={active.value === i}
            class={`vamp-tabs__tab ${active.value === i ? 'vamp-tabs__tab--active' : ''}`}
            onClick={() => { active.value = i; }}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div class="vamp-tabs__panel" role="tabpanel">
        <div style={{ display: active.value === 0 ? undefined : 'none' }}><VitalsTab /></div>
        <div style={{ display: active.value === 1 ? undefined : 'none' }}><DisciplinesTab /></div>
        <div style={{ display: active.value === 2 ? undefined : 'none' }}>
          <div class="vamp-placeholder">
            Possessions and inventory
            <br /><span class="vamp-placeholder__note">Tagged items, equipment, resources</span>
          </div>
        </div>
        <div style={{ display: active.value === 3 ? undefined : 'none' }}><ClocksDebtsTab /></div>
        {!isViewing && <div style={{ display: active.value === 4 ? undefined : 'none' }}><NotebookTab /></div>}
      </div>
    </div>
  );
}

function ClocksDebtsTab() {
  const mqc = masqueradeClock.value;
  const clocks = character.value.clocks;
  const isTourClocks = guideActive.value && isTourPhase.value
    && currentGuideStep.value.id === 'tour-clocks-debts';

  const demoFilled = useSignal(0);
  const demoComplete = useSignal(false);
  const demoPulse = useSignal(false);

  useEffect(() => {
    if (isTourClocks) {
      demoFilled.value = 0;
      demoComplete.value = false;
      demoPulse.value = false;
    }
  }, [isTourClocks]);

  useEffect(() => {
    if (!isTourClocks || demoComplete.value) return;
    if (demoFilled.value >= 8) {
      demoPulse.value = true;
      return;
    }
    const timer = setTimeout(() => {
      demoFilled.value = demoFilled.value + 1;
    }, 1_000);
    return () => clearTimeout(timer);
  }, [isTourClocks, demoFilled.value, demoComplete.value]);

  const demoClock: Clock = {
    id: 'mqc-demo',
    name: 'The Masquerade',
    segments: 8,
    filled: demoFilled.value,
  };

  function handleDemoClick() {
    if (!demoPulse.value) return;
    demoFilled.value = 0;
    demoPulse.value = false;
    demoComplete.value = true;
  }

  return (
    <>
      <SectionBox title="Debts">
        <DebtPanel />
      </SectionBox>

      <SectionBox title="Clocks">
        <div class="vamp-clocks">
          {isTourClocks && !demoComplete.value ? (
            <div
              class={`vamp-mqc-demo ${demoPulse.value ? 'vamp-mqc-demo--pulse' : ''}`}
              onDblClick={handleDemoClick}
            >
              <ClockDisplay
                clock={demoClock}
                gradient
                onFill={() => {}}
                onUnfill={() => {}}
              />
              {demoPulse.value && (
                <div class="vamp-mqc-demo__hint">Double-click to clear!</div>
              )}
            </div>
          ) : (
            <ClockDisplay
              clock={mqc}
              gradient
              onFill={fillMasquerade}
              onUnfill={unfillMasquerade}
            />
          )}
          {clocks.map(c => (
            <ClockDisplay
              key={c.id}
              clock={c}
              onFill={() => fillClockSegment(c.id)}
              onUnfill={() => unfillClockSegment(c.id)}
              onRemove={() => removeClock(c.id)}
            />
          ))}
          <NewClockWidget />
        </div>
      </SectionBox>
    </>
  );
}

function useSnippetContext(): SnippetContext {
  const char = character.value;
  const hp = maxHP.value;
  return {
    blood: char.stats.Blood,
    shadow: char.stats.Shadow,
    resolve: char.stats.Resolve,
    wits: char.stats.Wits,
    demeanor: char.stats.Demeanor,
    bp: char.bp,
    humanity: char.humanity,
    maxHp: hp,
    patronBp: char.ghoulPatron?.bp ?? 0,
  };
}

function SnippetBlock({ type, name, fullText, pill, nameClass, label }: {
  type: string;
  name: string;
  fullText: string;
  pill?: string;
  nameClass?: string;
  label?: { text: string; className?: string };
}) {
  const expanded = useSignal(false);
  const ctx = useSnippetContext();
  const rawSnippet = getSnippet(type, name);
  const snippet = rawSnippet ? resolveSnippetTokens(rawSnippet, ctx) : null;
  const isEditing = editMode.value || creationMode.value;
  const hasSnippet = !isEditing && snippet && snippet !== fullText;

  // All rendered content comes from our own verified JSON parsers (trusted)
  return (
    <div
      class={`vamp-perk ${hasSnippet ? 'vamp-perk--expandable' : ''} ${expanded.value ? 'vamp-perk--expanded' : ''}`}
      onClick={hasSnippet ? () => { expanded.value = !expanded.value; } : undefined}
    >
      <div class="vamp-perk__header">
        {label && <span class={`vamp-perk__label ${label.className ?? ''}`}>{label.text}</span>}
        <span class={`vamp-perk__name ${nameClass ?? ''}`}>{name}</span>
        {pill && <span class="vamp-perk__pill">{pill}</span>}
        {hasSnippet && !expanded.value && <span class="vamp-snippet-label">Summary</span>}
        {hasSnippet && <span class="vamp-perk__chevron" />}
      </div>
      {hasSnippet && !expanded.value && (
        <div class="vamp-perk__text vamp-perk__text--snippet" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(snippet) }} />
      )}
      {(!hasSnippet || expanded.value) && (
        <div class="vamp-perk__text" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(fullText) }} />
      )}
    </div>
  );
}

function MeritFlawEntry({ name, pill, text }: { name?: string; pill?: string; text?: string }) {
  if (!text) return null;
  return (
    <div class="vamp-mf-entry">
      {name && <div class="vamp-mf-entry__name">{name}</div>}
      {pill && <div class="vamp-mf-entry__pill">{pill}</div>}
      <div dangerouslySetInnerHTML={{ __html: renderGameMarkdown(text) }} />
    </div>
  );
}

function VitalsTab() {
  const playbook = currentPlaybook.value;
  const pt = currentPredatorType.value;
  const char = character.value;
  const disciplines = accessibleDisciplineData.value;

  const playbookPerks = playbook?.perks ?? [];
  const startingSlugs = startingDisciplineSlugs.value;
  const ptDiscipline = pt?.discipline ?? '';
  const disciplinePerks = disciplines
    .filter(d => d.perk)
    .map(d => ({ name: d.perk!.name, body: d.perk!.body, source: d.name, slug: d.slug }))
    .sort((a, b) => {
      const aPlaybook = startingSlugs.has(a.slug) ? 0 : 1;
      const bPlaybook = startingSlugs.has(b.slug) ? 0 : 1;
      if (aPlaybook !== bPlaybook) return aPlaybook - bPlaybook;
      const aPT = a.source === ptDiscipline ? 0 : 1;
      const bPT = b.source === ptDiscipline ? 0 : 1;
      return aPT - bPT;
    });

  return (
    <div class="vamp-vitals-stack">
      <div class="vamp-bane-compulsion">
        <div class="vamp-bane-compulsion__col">
          <SnippetBlock
            type="banes"
            name={playbook?.baneName ?? 'Unknown'}
            fullText={playbook?.baneDescription ?? ''}
            nameClass="vamp-bane__name"
            label={{ text: 'Bane:', className: 'vamp-perk__label--bane' }}
          />
        </div>
        <div class="vamp-merits-flaws__divider" />
        <div class="vamp-bane-compulsion__col">
          <SnippetBlock
            type="compulsions"
            name={playbook?.compulsionName ?? 'None'}
            fullText={playbook?.compulsionDescription ?? ''}
            nameClass="vamp-bane__name--compulsion"
            label={{ text: 'Compulsion:', className: 'vamp-perk__label--compulsion' }}
          />
        </div>
      </div>

      <SectionBox title="Convictions & Touchstones">
        {editMode.value || (guideActive.value && isCreationPhase.value && creationStep.value === 'convictions') ? (
          <ConvictionsCreationPanel />
        ) : (
          <div class="vamp-paired vamp-paired--grid">
            {char.convictions.map((conviction, i) => (
              <div class="vamp-paired__item" key={i}>
                <div class="vamp-paired__conviction">{conviction || '—'}</div>
                {char.touchstones[i] && char.touchstones[i].name && (
                  <div class="vamp-paired__touchstone">
                    {char.touchstones[i].name}
                    {char.touchstones[i].pronouns[0] && ` (${char.touchstones[i].pronouns.filter(Boolean).join('/')})`}
                    {char.touchstones[i].ageBracket && `, ${char.touchstones[i].ageBracket}`}
                    {char.touchstones[i].description && ` — ${char.touchstones[i].description}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionBox>

      {(() => {
        const allPerks = [
          ...playbookPerks.map(p => ({ key: p.name, type: 'perks' as const, name: p.name, pill: playbook?.name ?? '', fullText: p.description })),
          ...disciplinePerks.map(p => ({ key: p.name, type: 'perks' as const, name: p.name, pill: p.source, fullText: p.body })),
        ];
        const left = allPerks.filter((_, i) => i % 2 === 0);
        const right = allPerks.filter((_, i) => i % 2 === 1);
        return (
          <SectionBox title="Perks" collapsible collapsedLabel={`Perks (${allPerks.length})`}>
            <div class="vamp-perks-split">
              <div class="vamp-perks-split__col">
                {left.map(p => <SnippetBlock key={p.key} type={p.type} name={p.name} pill={p.pill} fullText={p.fullText} />)}
              </div>
              <div class="vamp-merits-flaws__divider" />
              <div class="vamp-perks-split__col">
                {right.map(p => <SnippetBlock key={p.key} type={p.type} name={p.name} pill={p.pill} fullText={p.fullText} />)}
              </div>
            </div>
          </SectionBox>
        );
      })()}

      <SectionBox
        title="Merits & Flaws"
        collapsible
        collapsedLabel={`Merits & Flaws (${(pt?.merit ? 1 : 0) + char.merits.length} & ${(pt?.flaw ? 1 : 0) + char.flaws.length})`}
      >
        <div class="vamp-merits-flaws">
          <div class="vamp-merits-flaws__col">
            <div class="vamp-merits-flaws__heading vamp-merits-flaws__heading--merit">Merits</div>
            {pt?.merit && (
              <MeritFlawEntry key="pt-merit" name={pt.merit.name} pill="Predator Type" text={pt.merit.description} />
            )}
            {char.merits.map(m => {
              const full = gameData.value?.optionalExtras?.merits.find(x => x.name === m.name);
              return (
                <MeritFlawEntry
                  key={m.name}
                  name={m.name}
                  pill={full?.category}
                  text={full?.description}
                />
              );
            })}
            {!pt?.merit && char.merits.length === 0 && (
              <div class="vamp-mf-empty">None</div>
            )}
          </div>
          <div class="vamp-merits-flaws__divider" />
          <div class="vamp-merits-flaws__col">
            <div class="vamp-merits-flaws__heading vamp-merits-flaws__heading--flaw">Flaws</div>
            {pt?.flaw && (
              <MeritFlawEntry key="pt-flaw" name={pt.flaw.name} pill="Predator Type" text={pt.flaw.description} />
            )}
            {char.flaws.map(f => {
              const full = gameData.value?.optionalExtras?.flaws.find(x => x.name === f.name);
              return (
                <MeritFlawEntry
                  key={f.name}
                  name={f.name}
                  pill={full?.category}
                  text={full?.description}
                />
              );
            })}
            {!pt?.flaw && char.flaws.length === 0 && (
              <div class="vamp-mf-empty">None</div>
            )}
          </div>
        </div>
      </SectionBox>
    </div>
  );
}


const HUMAN_AGE_BRACKETS = [
  'Baby', 'Child', 'Youth', 'Teen', 'Young Adult', 'Mature Adult', 'Senior',
  "Don't Ask", "Don't Know",
];

const MAX_CONVICTIONS = 4;

function ConvictionForm({ index }: { index: number }) {
  const char = character.value;
  const conviction = char.convictions[index] ?? '';
  const raw = char.touchstones[index];
  const touchstone = {
    name: raw?.name ?? '',
    pronouns: raw?.pronouns ?? ['', ''],
    ageBracket: raw?.ageBracket ?? '',
    description: raw?.description ?? '',
  };

  const hasAlwaysNever = /\b(always|never)\b/i.test(conviction);
  const showWarning = conviction.trim().length > 0 && !hasAlwaysNever;
  const descWordCount = touchstone.description.trim().split(/\s+/).filter(Boolean).length;
  const descTooShort = touchstone.description.trim().length > 0 && descWordCount < 3;

  function updateConviction(text: string) {
    const convictions = [...char.convictions];
    while (convictions.length <= index) convictions.push('');
    convictions[index] = text;
    updateCharacter({ convictions });
  }

  function updateTouchstone(patch: Partial<Touchstone>) {
    const touchstones = [...char.touchstones];
    while (touchstones.length <= index) touchstones.push({ name: '', pronouns: ['', ''], ageBracket: '', description: '' });
    touchstones[index] = { ...touchstones[index], ...patch };
    updateCharacter({ touchstones });
  }

  const isEmpty = conviction.trim() === '' && touchstone.name.trim() === '';

  return (
    <div class={`vamp-conviction-form ${isEmpty ? 'vamp-conviction-form--empty' : ''}`}>
      <div class="vamp-conviction-form__heading">Conviction {index + 1}</div>

      <input
        class={`vamp-input vamp-conviction-form__conviction ${showWarning ? 'vamp-conviction-form__conviction--warn' : ''}`}
        type="text"
        placeholder={`Write an "Always" or "Never" statement...`}
        value={conviction}
        onInput={(e) => updateConviction((e.target as HTMLInputElement).value)}
      />
      {showWarning && (
        <div class="vamp-conviction-form__warning">
          Convictions usually begin with "Always" or "Never."
        </div>
      )}

      {conviction.trim() && (
        <div class="vamp-conviction-form__preview">"{conviction}"</div>
      )}

      <div class="vamp-conviction-form__sub-heading">Linked Touchstone</div>

      <input
        class="vamp-input"
        type="text"
        placeholder="NPC name"
        value={touchstone.name}
        onInput={(e) => updateTouchstone({ name: (e.target as HTMLInputElement).value })}
      />

      <div class="vamp-conviction-form__row">
        <input
          class="vamp-input vamp-conviction-form__pronoun"
          type="text"
          placeholder="they"
          value={touchstone.pronouns[0]}
          onInput={(e) => updateTouchstone({ pronouns: [(e.target as HTMLInputElement).value, touchstone.pronouns[1]] })}
        />
        <span class="vamp-conviction-form__slash">/</span>
        <input
          class="vamp-input vamp-conviction-form__pronoun"
          type="text"
          placeholder="them"
          value={touchstone.pronouns[1]}
          onInput={(e) => updateTouchstone({ pronouns: [touchstone.pronouns[0], (e.target as HTMLInputElement).value] })}
        />
        <select
          class="creation-dropdown"
          value={touchstone.ageBracket}
          onChange={(e) => updateTouchstone({ ageBracket: (e.target as HTMLSelectElement).value })}
        >
          <option value="">Age?</option>
          {HUMAN_AGE_BRACKETS.map(ab => <option key={ab} value={ab}>{ab}</option>)}
        </select>
      </div>

      <input
        class={`vamp-input ${descTooShort ? 'vamp-conviction-form__conviction--warn' : ''}`}
        type="text"
        placeholder="Who are they to you? (at least a few words)"
        value={touchstone.description}
        onInput={(e) => updateTouchstone({ description: (e.target as HTMLInputElement).value })}
      />
    </div>
  );
}

function ConvictionsCreationPanel() {
  const char = character.value;
  const filledCount = char.convictions.filter(c => c.trim() !== '').length;
  const showCount = Math.min(MAX_CONVICTIONS, Math.max(2, filledCount + 1));

  return (
    <div class="vamp-convictions-creation">
      <div class="vamp-convictions-creation__guide">
        Write a moral code your character lives by, then link each to a mortal who embodies it.
      </div>
      <div class="vamp-paired vamp-paired--grid">
        {Array.from({ length: showCount }, (_, i) => (
          <ConvictionForm key={i} index={i} />
        ))}
      </div>
      {showCount < MAX_CONVICTIONS && (
        <div class="vamp-convictions-creation__hint">
          Fill in the above to add another (up to {MAX_CONVICTIONS}).
        </div>
      )}
    </div>
  );
}

/* Closes editing only when focus leaves the field entirely, not when tabbing between sibling inputs */
function handleBioBlur(e: FocusEvent, editing: { value: boolean }) {
  const related = (e as FocusEvent).relatedTarget as HTMLElement | null;
  const container = (e.currentTarget as HTMLElement).closest('.vamp-bio__field');
  if (container?.contains(related)) return;
  editing.value = false;
}

function handleBioKey(e: KeyboardEvent, editing: { value: boolean }, restore?: () => void) {
  if (e.key === 'Enter') editing.value = false;
  if (e.key === 'Escape') {
    if (restore) restore();
    editing.value = false;
  }
}

function BioDualField({ label, bio, variant }: {
  label: string;
  bio: Bio;
  variant: 'ages' | 'pronouns';
}) {
  const editing = useSignal(false);
  const isEdit = editMode.value;
  const isCreatingName = guideActive.value && isCreationPhase.value && creationStep.value === 'name';
  const isAges = variant === 'ages';
  const v1 = isAges ? bio.vampiricAge : bio.pronouns[0];
  const v2 = isAges ? bio.apparentAge : bio.pronouns[1];
  const display = v1 || v2
    ? (isAges ? `${v1} (${v2})` : `${v1}/${v2}`)
    : '';

  const snapshot = useSignal({ v1, v2 });
  if (!editing.value) snapshot.value = { v1, v2 };

  function save(idx: 0 | 1, val: string) {
    if (isAges) {
      updateCharacter({ bio: { ...bio, [idx === 0 ? 'vampiricAge' : 'apparentAge']: val } });
    } else {
      const next: [string, string] = [...bio.pronouns];
      next[idx] = val;
      updateCharacter({ bio: { ...bio, pronouns: next } });
    }
  }

  function restore() {
    const current = character.value.bio;
    if (isAges) {
      updateCharacter({ bio: { ...current, vampiricAge: snapshot.value.v1, apparentAge: snapshot.value.v2 } });
    } else {
      updateCharacter({ bio: { ...current, pronouns: [snapshot.value.v1, snapshot.value.v2] } });
    }
  }

  if (editing.value) {
    return (
      <div class="vamp-bio__field vamp-bio__field--dual">
        <span class="vamp-bio__label">{label}</span>
        <div class="vamp-bio__dual-row">
          <input class="vamp-bio__input vamp-bio__input--half" value={v1}
            placeholder={isAges ? 'actual' : 'any'} autoFocus
            onInput={(e) => save(0, (e.target as HTMLInputElement).value)}
            onBlur={(e) => handleBioBlur(e, editing)}
            onKeyDown={(e) => handleBioKey(e as unknown as KeyboardEvent, editing, restore)}
          />
          <span class="vamp-bio__sep">{isAges ? '(' : '/'}</span>
          <input class="vamp-bio__input vamp-bio__input--half" value={v2}
            placeholder={isAges ? 'looks' : 'all'}
            onInput={(e) => save(1, (e.target as HTMLInputElement).value)}
            onBlur={(e) => handleBioBlur(e, editing)}
            onKeyDown={(e) => handleBioKey(e as unknown as KeyboardEvent, editing, restore)}
          />
          {isAges && <span class="vamp-bio__sep">)</span>}
        </div>
      </div>
    );
  }

  return (
    <div class="vamp-bio__field" onDblClick={() => { if (isEdit || isCreatingName) editing.value = true; }}>
      <span class="vamp-bio__label">{label}</span>
      <span class="vamp-bio__value">{display || '—'}</span>
    </div>
  );
}

function BioField({ label, field, bio }: {
  label: string;
  field: keyof Bio;
  bio: Bio;
}) {
  const editing = useSignal(false);
  const isEdit = editMode.value;
  const isCreatingName = guideActive.value && isCreationPhase.value && creationStep.value === 'name';
  const value = bio[field] as string;
  const snapshot = useSignal(value);
  if (!editing.value) snapshot.value = value;

  if (editing.value) {
    return (
      <div class="vamp-bio__field">
        <span class="vamp-bio__label">{label}</span>
        <input class="vamp-bio__input" value={value}
          autoFocus
          onInput={(e) => updateCharacter({ bio: { ...bio, [field]: (e.target as HTMLInputElement).value } })}
          onBlur={() => { editing.value = false; }}
          onKeyDown={(e) => {
            const key = (e as unknown as KeyboardEvent).key;
            if (key === 'Enter') editing.value = false;
            if (key === 'Escape') {
              updateCharacter({ bio: { ...character.value.bio, [field]: snapshot.value } });
              editing.value = false;
            }
          }}
        />
      </div>
    );
  }

  return (
    <div class="vamp-bio__field" onDblClick={() => { if (isEdit || isCreatingName) editing.value = true; }}>
      <span class="vamp-bio__label">{label}</span>
      <span class="vamp-bio__value">{value || '—'}</span>
    </div>
  );
}


function NameField({ name, isCreating }: { name: string; isCreating: boolean }) {
  const editing = useSignal(false);
  const isEdit = editMode.value;

  if (isCreating || editing.value) {
    return (
      <input
        class="vamp-identity__name-input"
        type="text"
        placeholder="Inscribe a name..."
        value={name}
        onInput={(e) => updateCharacter({ name: (e.target as HTMLInputElement).value })}
        onBlur={() => { editing.value = false; }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') editing.value = false;
        }}
        autoFocus={!isCreating}
      />
    );
  }

  return (
    <div
      class="vamp-identity__name"
      onDblClick={() => { if (isEdit) editing.value = true; }}
    >{name || 'Unnamed'}</div>
  );
}

export function CharacterSheet({ slug }: { slug?: string }) {
  const loading = useSignal(false);
  const loadError = useSignal<string | null>(null);
  const isViewing = viewingOtherSheet.value;

  useEffect(() => {
    if (isViewing) return;
    if (!slug || slug === 'new') return;

    if (activeCharacterId.value === slug) {
      if (!character.value.creationComplete) startGuide();
      return;
    }

    loading.value = true;
    loadError.value = null;
    loadCharacter(slug)
      .then(() => {
        if (!character.value.creationComplete) {
          startGuide();
        }
      })
      .catch(err => { loadError.value = err instanceof Error ? err.message : String(err); })
      .finally(() => { loading.value = false; });
    return () => { flushSave(); };
  }, [slug, isViewing]);

  if (loading.value) {
    return <div class="vamp-loading">Materializing...</div>;
  }
  if (loadError.value) {
    return <div class="vamp-loading vamp-loading--error">Failed to load character: {loadError.value}</div>;
  }

  const char = character.value;
  document.title = char.name ? `Vamp: ${char.name}` : 'Vamp: Coterie Character Sheet';
  const hp = maxHP.value;
  const statMap = moveStatMap.value;
  const others = otherMoves.value;

  const guideOn = isViewing ? false : guideActive.value;
  const isCreating = guideOn && isCreationPhase.value;
  const isTour = guideOn && isTourPhase.value;
  const guideStep = guideOn ? currentGuideStep.value : null;
  const step = creationStep.value;
  const zone = isCreating ? STEP_ZONE[step] : null;
  const guideZone: TourZone | null = guideStep?.zone as TourZone | null ?? null;
  const statsDualHighlight = isCreating && step === 'playbook' && stepComplete.value.playbook;

  useEffect(() => {
    if (!guideOn || !guideStep) return;
    if (guideStep.rightTab) {
      switchTab(guideStep.rightTab);
      if (rightColumnMinimized.value) {
        rightColumnMinimized.value = false;
        requestAnimationFrame(() => {
          rightColumnWidth.value = rightColumnMaxWidth();
        });
      } else {
        rightColumnWidth.value = rightColumnMaxWidth();
      }
    } else {
      rightColumnWidth.value = MIN_RIGHT_WIDTH;
    }
    if (guideStep.contentTab !== null) {
      activeContentTab.value = guideStep.contentTab;
    }
    let forcedEditOn = false;
    if (guideStep.id === 'tour-clocks-debts' && !editMode.value) {
      editMode.value = true;
      forcedEditOn = true;
    }
    return () => {
      if (forcedEditOn) editMode.value = false;
    };
  }, [guideOn, guideStep?.id]);

  const sidebarGuideSpotlight = isTour && guideStep?.id === 'tour-basic-moves';
  const sidebarSpotlight = zone === 'sidebar' || zone === 'beside-sidebar' || statsDualHighlight || sidebarGuideSpotlight;

  const sheetClass = [
    'vamp-sheet',
    guideOn && 'vamp-sheet--guided',
  ].filter(Boolean).join(' ');

  return (
    <div class={sheetClass}>
      {guideOn && <SpotlightOverlay />}
      {guideOn && <GuideCard />}

      <aside class={`vamp-sheet__sidebar ${sidebarSpotlight ? 'guide-spotlight' : ''}`}>
        <div class="vamp-identity">
          <NameField name={char.name} isCreating={isCreating && step === 'name'} />
          <PortraitEditor portraits={char.portraits} name={char.name} />
          <div class="vamp-identity__meta">
            <span class="vamp-identity__link" onClick={() => switchTab('character')}>{char.playbook || 'No Playbook'}</span>
          </div>
          <div class="vamp-identity__meta">
            <span class="vamp-identity__link" onClick={() => switchTab('character')}>{char.ageBracket || '?'}</span>
            {char.predatorType && (
              <>
                <span class="vamp-identity__sep">|</span>
                <span class="vamp-identity__link" onClick={() => switchTab('character')}>{char.predatorType}</span>
              </>
            )}
          </div>

          <div class="vamp-bio">
            <BioDualField label="Ages" bio={char.bio} variant="ages" />
            <BioDualField label="Pronouns" bio={char.bio} variant="pronouns" />
            <BioField label="Height" field="height" bio={char.bio} />
            <BioField label="Weight" field="weight" bio={char.bio} />
            <BioField label="Style" field="style" bio={char.bio} />
            <BioField label="Occupation" field="occupation" bio={char.bio} />
          </div>
        </div>

        <div class="vamp-stat-list">
          {STAT_ORDER.map(statName => {
            const value = char.stats[statName];
            const entry = statMap.find(e => e.statName === statName);
            const moves = entry?.moves ?? [];

            const isEdit = editMode.value && !isCreating;
            const cap = statCap.value;
            return (
              <div class="vamp-stat" key={statName}>
                <div class="vamp-stat__header">
                  {isEdit && (
                    <button
                      class="vamp-stat__adj vamp-stat__adj--minus"
                      disabled={value <= -1}
                      onClick={() => adjustStat(statName, -1, cap)}
                    />
                  )}
                  <div class="vamp-stat__circle">
                    {isNaN(value) ? '+0' : value >= 0 ? `+${value}` : value}
                  </div>
                  {isEdit && (
                    <button
                      class="vamp-stat__adj vamp-stat__adj--plus"
                      disabled={value >= cap}
                      onClick={() => adjustStat(statName, 1, cap)}
                    />
                  )}
                  <div class="vamp-stat__name">{statName}</div>
                </div>
                {moves.length > 0 && (
                  <ul class="vamp-stat__moves">
                    {moves.map(m => {
                      const adv = char.advancedMoves.includes(m.name);
                      return (
                        <li
                          key={m.name}
                          class={`vamp-stat__move ${adv ? 'vamp-stat__move--advanced' : ''}`}
                          onClick={() => openMove(m.name)}
                        >
                          <strong>{m.name}</strong>
                          {m.altStat && <span class="vamp-stat__alt"> ({m.altStat})</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {others.length > 0 && (
          <div class="vamp-sidebar__universal">
            <div class="vamp-stat__name">Other Basic Moves</div>
            <ul class="vamp-stat__moves vamp-stat__moves--universal">
              {others.map(m => {
                const adv = char.advancedMoves.includes(m);
                return (
                  <li
                    key={m}
                    class={`vamp-stat__move ${adv ? 'vamp-stat__move--advanced' : ''}`}
                    onClick={() => openMove(m)}
                  >
                    <strong>{m}</strong>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {statsDualHighlight && (
          <div class="vamp-sidebar__creation-hint">
            <p>This is your <strong>stat panel</strong>. Your five stats and their linked <strong>Basic Moves</strong> live here.</p>
            <p>When you roll dice, you'll click these to add your stat bonus. Try picking a different Archetype on the right and watch the numbers change!</p>
          </div>
        )}
      </aside>

      <div class="vamp-sheet__right">

        <div class={`vamp-vitals ${guideStep?.id === 'tour-vitals' ? 'guide-spotlight' : ''}`}>
          <div class="vamp-vitals__grid">

            <SectionBox title="Blood Potency">
              <BPTracker />
            </SectionBox>

            <SectionBox title="Humanity">
              <HumanityTracker key={`${char.humanity}-${char.stains}`} />
            </SectionBox>

            <SectionBox title="XP">
              <XPTracker />
            </SectionBox>

            <SectionBox title="Hunger">
              <HungerTracker />
            </SectionBox>

            <SectionBox title="Harm">
              <HarmTracker key={hp} hp={hp} />
            </SectionBox>

          </div>
        </div>

        <div class="vamp-sheet__content">
          <div class="vamp-toolbar-row">
            <div class={`vamp-modifier-float ${guideZone === 'toolbar-left' || guideStep?.id === 'tour-modifiers' ? 'guide-spotlight' : ''}`}>
              <SectionBox title="Move Modifiers">
                <ModifierBar />
              </SectionBox>
            </div>
            <div class={`vamp-scene-float ${guideZone === 'toolbar-right' || guideStep?.id === 'tour-scene-tools' ? 'guide-spotlight' : ''}`}>
              <SectionBox title="Scene Tools">
                <SceneTools />
              </SectionBox>
            </div>
          </div>
          <div class={`vamp-content-area ${
            guideZone === 'content'
            || guideStep?.creationStep === 'disciplines'
            || guideStep?.creationStep === 'convictions'
            || guideStep?.id === 'tour-vitals'
              ? 'guide-spotlight' : ''
          }`}>
            <ContentTabs />
          </div>
        </div>
      </div>

      <RightColumn class={guideZone === 'right' || guideZone === 'beside-right' || guideZone === 'beside-right-center' || zone === 'right' || zone === 'beside-right' || zone === 'beside-right-center' ? 'guide-spotlight' : undefined}>
        <RightPanelContent />
      </RightColumn>
    </div>
  );
}
