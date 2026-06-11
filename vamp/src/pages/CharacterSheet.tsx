import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { debounce } from '../utils/debounce';
import { preloadPortraits } from '../utils/preloadPortraits';
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
  setHunger, setBP, setXP, fireXPTrigger, setHumanity, setHarm, applyStain,
  addDebt, removeDebt, updateDebt, cycleDebtState, adjustStat, bloodSurgeActive,
} from '../state/character';
import {
  performRoll, performHungerCheck, performRemorseCheck, performQuickHeal, performBloodSurge,
} from '../dice/rollMove';
import { editMode, viewingOtherSheet, portraitMinimized } from '../state/ui';
import { masqueradeClock, fillMasquerade, unfillMasquerade } from '../state/coterie';
import {
  currentPlaybook, currentPredatorType,
  moveStatMap, otherMoves, maxHP, accessibleDisciplineData,
  getSnippet, gameData, statCap, startingDisciplineSlugs,
  bloodSurgesRemaining,
} from '../state/derived';
import { switchTab, openMove, activeContentTab } from '../state/panel';
import { showToast } from '../state/toasts';
import { renderGameMarkdown, resolveSnippetTokens, type SnippetContext } from '../data/transforms';
import { activeCharacterId, loadCharacter, flushSave } from '../state/persistence';
import { creationMode, creationStep, stepComplete, STEP_ZONE } from '../state/creation';
import { type TourZone } from '../state/tour';
import {
  guideActive, currentGuideStep, isCreationPhase, isTourPhase,
  startGuide,
} from '../state/guide';
import type { StatName } from '../data/types';
import type { Bio, Clock } from '../state/character';

// All rendered markdown comes from my own verified JSON parsers (trusted content)

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

/* Roll-action button anchored to top-right of a box (Play mode only). */
function VitalRollButton({ label, onClick, disabled, singleLine }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  singleLine?: boolean;
}) {
  return (
    <button
      class={`vamp-vital-roll ${singleLine ? 'vamp-vital-roll--inline' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      {singleLine ? label : label.split(' ').map((word, i) => (
        <span key={i} class="vamp-vital-roll__line">{word}</span>
      ))}
    </button>
  );
}

/* Hunger level name + effect text, shown in Hunger's legend tooltip. */
function hungerLevel(hunger: number): { name: string; text: string } {
  if (hunger === 0) return { name: 'Sated', text: 'Just fed well. No penalties.' };
  if (hunger <= 2) return { name: 'Manageable', text: 'Cravings present but controllable. No penalties.' };
  if (hunger === 3) return { name: 'Distracted', text: 'Blood is on your mind constantly. -1 Ongoing except Hunt, Feed, Dirty Your Claws.' };
  if (hunger === 4) return { name: 'Ravenous', text: 'You need blood soon. -2 Ongoing except Hunt, Feed, Dirty Your Claws.' };
  return { name: 'Frenzy', text: 'The Beast is driving. You must Feed until you reach 0 Hunger.' };
}

function HungerTracker({ canRoll }: { canRoll?: boolean }) {
  const hunger = character.value.hunger;
  const warn = hunger >= 5 ? 'frenzy' : hunger === 4 ? 'ravenous' : null;

  return (
    <div class="vamp-hunger-tracker">
      <div class="vamp-vital-row">
        <div class={`vamp-pip-row ${warn ? `vamp-pip-row--hunger-${warn}` : ''}`}>
          <span class="vamp-hunger-pips">
            <ClickPipRow value={hunger} count={5} onChange={setHunger} droplet />
          </span>
          <span class="vamp-tracker-label">{hunger}/5</span>
        </div>
        {canRoll && (
          <div class="vamp-vital-actions">
            <VitalRollButton label="Hunger Check" onClick={performHungerCheck} />
          </div>
        )}
      </div>
      {hunger >= 5 && (
        <div class="vamp-hunger-warn"><strong>Stay Chill</strong> to not Frenzy!</div>
      )}
    </div>
  );
}

function BPTracker({ canRoll }: { canRoll?: boolean }) {
  const bp = character.value.bp;
  const isEdit = editMode.value;
  const pendingBP = character.value.pendingUpgrades.filter(u => u.type === 'bp').length;
  const remaining = bloodSurgesRemaining.value;
  const surgeActive = bloodSurgeActive();

  return (
    <div>
      <div class="vamp-vital-row">
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
        {canRoll && bp >= 1 && (
          <div class="vamp-vital-actions">
            <VitalRollButton
              label="Blood Surge"
              onClick={performBloodSurge}
              disabled={remaining <= 0 || surgeActive}
            />
            <span
              class="vamp-surge-track"
              title={`${remaining} of ${bp} Blood Surge${bp === 1 ? '' : 's'} available tonight`}
            >
              {Array.from({ length: bp }, (_, i) => (
                <span key={i} class={`vamp-surge-pip ${i < remaining ? 'vamp-surge-pip--ready' : ''}`} />
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function HumanityTracker({ canRoll }: { canRoll?: boolean }) {
  const char = character.value;
  const isEdit = editMode.value;
  const humanity = char.humanity;
  /* Filled pips = Humanity; Stains = crossed pips, label shows Humanity. */
  const stains = Math.min(char.stains, 10 - humanity);
  const stainLabel = stains > 0 ? ` (${stains} Stain${stains > 1 ? 's' : ''})` : '';

  function addStain() {
    const outcome = applyStain(humanity, char.stains);
    setHumanity(outcome.humanity, outcome.stains);
    if (outcome.lostHumanity) {
      showToast('Stains filled the track — lost 1 Humanity.', 'warning');
    }
  }

  return (
    <div class="vamp-vital-row">
      <div class={`vamp-pip-row ${canRoll ? 'vamp-pip-row--humanity' : ''}`}>
        {Array.from({ length: 10 }, (_, i) => {
          const state: PipState = i < humanity ? 'filled' : i < humanity + stains ? 'slashed' : 'empty';
          return (
            <div
              key={i}
              class={`vamp-pip vamp-pip--${state} ${isEdit ? '' : 'vamp-pip--locked'}`}
              onClick={isEdit ? () => setHumanity(i < humanity ? i : i + 1, char.stains) : undefined}
            />
          );
        })}
        <span class="vamp-tracker-label">{humanity}{stainLabel}</span>
      </div>
      {canRoll && (
        <div class="vamp-humanity-actions">
          <VitalRollButton label="Remorse Check" onClick={performRemorseCheck} disabled={char.stains === 0} />
          <VitalRollButton label="+1 Stain" onClick={addStain} singleLine />
        </div>
      )}
    </div>
  );
}

function HarmTracker({ hp, canRoll }: { hp: number; canRoll?: boolean }) {
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

  const rootRef = useRef<HTMLDivElement>(null);
  const cols = useSignal(hp);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const recompute = () => {
      const avail = el.clientWidth - 84;
      const perRow = Math.max(1, Math.floor((avail + 3.2) / 27.2));
      const rows = Math.max(1, Math.ceil(hp / perRow));
      cols.value = Math.ceil(hp / rows);
    };
    recompute();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hp]);

  return (
    <div ref={rootRef}>
      <div class="vamp-pip-row vamp-pip-row--harm" style={{ '--harm-cols': String(cols.value) }}>
        <DualPhasePips boxes={boxes.value} advance={advance} reverse={reverse} />
      </div>
      {canRoll && char.playbook !== 'Ghoul' && (
        <div class="vamp-vital-actions">
          <VitalRollButton label="Quick Heal" onClick={performQuickHeal} disabled={sup === 0} />
        </div>
      )}
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
            {/* Rendered markdown from my own verified JSON parsers (trusted content) */}
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
  const whoDraft = useSignal(d.who);
  const textDraft = useSignal(d.text);
  const whoSaved = useRef(d.who);
  const textSaved = useRef(d.text);

  const debouncedWho = useRef(
    debounce((val: string) => { whoSaved.current = val; updateDebt(debtId, { who: val }); }, 3000)
  ).current;
  const debouncedText = useRef(
    debounce((val: string) => { textSaved.current = val; updateDebt(debtId, { text: val }); }, 3000)
  ).current;

  useEffect(() => () => { debouncedWho.cancel(); debouncedText.cancel(); }, []);

  useEffect(() => {
    if (!editMode.value) {
      debouncedWho.flush();
      debouncedText.flush();
      editingField.value = null;
    }
  }, [editMode.value]);

  if (!editingField.value) {
    whoDraft.value = d.who;
    textDraft.value = d.text;
    whoSaved.current = d.who;
    textSaved.current = d.text;
  }

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

  function flushField() {
    if (editingField.value === 'who') debouncedWho.flush();
    if (editingField.value === 'text') debouncedText.flush();
    editingField.value = null;
  }

  function cancelField() {
    if (editingField.value === 'who') {
      debouncedWho.cancel();
      whoDraft.value = whoSaved.current;
    }
    if (editingField.value === 'text') {
      debouncedText.cancel();
      textDraft.value = textSaved.current;
    }
    editingField.value = null;
  }

  function handleFieldKey(e: KeyboardEvent) {
    if (e.key === 'Enter') flushField();
    if (e.key === 'Escape') cancelField();
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
            value={whoDraft.value}
            autoFocus
            onInput={(e) => {
              const val = (e.target as HTMLInputElement).value;
              whoDraft.value = val;
              debouncedWho(val);
            }}
            onBlur={flushField}
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
            value={textDraft.value}
            autoFocus
            onInput={(e) => {
              const val = (e.target as HTMLInputElement).value;
              textDraft.value = val;
              debouncedText(val);
            }}
            onBlur={flushField}
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
  /* Clamp locally for this render; persist in an effect (no signal writes mid-render) */
  const idx = active.value >= tabs.length ? 0 : active.value;
  useEffect(() => {
    if (active.value >= tabs.length) active.value = 0;
  }, [tabs.length]);

  return (
    <div class="vamp-tabs">
      <nav
        class="vamp-tabs__bar"
        role="tablist"
        style={`--tab-count: ${tabs.length}; --tab-active-idx: ${idx}`}
      >
        {tabs.map((tab, i) => (
          <button
            key={tab}
            role="tab"
            aria-selected={idx === i}
            class={`vamp-tabs__tab ${idx === i ? 'vamp-tabs__tab--active' : ''}`}
            onClick={() => { active.value = i; }}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div class="vamp-tabs__panel" role="tabpanel">
        <div style={{ display: idx === 0 ? undefined : 'none' }}><VitalsTab /></div>
        <div style={{ display: idx === 1 ? undefined : 'none' }}><DisciplinesTab /></div>
        <div style={{ display: idx === 2 ? undefined : 'none' }}>
          {/* TODO: Possessions tab — sortable table of tagged items (Tag-System-Rules.md).
             Structured input: base type dropdown, mechanical/descriptive tag fields, description.
             Hover tooltips on tags from parsed reference data. */}
          <div class="vamp-placeholder">
            Possessions and inventory
            <br /><span class="vamp-placeholder__note">Tagged items, equipment, resources</span>
          </div>
        </div>
        <div style={{ display: idx === 3 ? undefined : 'none' }}><ClocksDebtsTab /></div>
        {!isViewing && <div class="vamp-tab-pane--fill" style={{ display: idx === 4 ? undefined : 'none' }}><NotebookTab /></div>}
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

  // All rendered content comes from my own verified JSON parsers (trusted)
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
      {(() => {
        const extras = gameData.value?.optionalExtras;
        const variant = extras?.clanBaneVariants.find(
          v => v.clan.toLowerCase() === (playbook?.name ?? '').toLowerCase(),
        );

        type BaneEntry = {
          key: string; type: string; name: string; fullText: string;
          nameClass: string; label: { text: string; className?: string };
        };
        const baneLabel = (text: string): { text: string; className: string } =>
          ({ text, className: 'vamp-perk__label--bane' });

        /* Top-left bane: the variant replaces standard only when 'variant' is chosen alone. */
        const primary: BaneEntry = char.baneChoice === 'variant' && variant
          ? { key: 'bane', type: 'banes', name: variant.baneName, fullText: variant.consequences, nameClass: 'vamp-bane__name', label: baneLabel('Bloodline Bane:') }
          : { key: 'bane', type: 'banes', name: playbook?.baneName ?? 'Unknown', fullText: playbook?.baneDescription ?? '', nameClass: 'vamp-bane__name', label: baneLabel('Bloodline Bane:') };

        /* Top-right is always the Compulsion. */
        const compulsion: BaneEntry = {
          key: 'compulsion', type: 'compulsions',
          name: playbook?.compulsionName ?? 'None',
          fullText: playbook?.compulsionDescription ?? '',
          nameClass: 'vamp-bane__name--compulsion',
          label: { text: 'Compulsion:', className: 'vamp-perk__label--compulsion' },
        };

        const extraBanes: BaneEntry[] = [];
        if (char.baneChoice === 'both' && variant) {
          extraBanes.push({ key: `variant-${variant.baneName}`, type: 'banes', name: variant.baneName, fullText: variant.consequences, nameClass: 'vamp-bane__name', label: baneLabel('Variant Clan Bane:') });
        }
        for (const fb of char.folkloricBanes) {
          const full = extras?.folkloricBanes.find(b => b.baneName === fb.baneName);
          extraBanes.push({ key: `folk-${fb.baneName}`, type: 'banes', name: fb.baneName, fullText: full?.consequences ?? '', nameClass: 'vamp-bane__name', label: baneLabel('Folkloric Bane:') });
        }
        extraBanes.sort((a, b) => a.name.localeCompare(b.name));

        /* Row-major flow: index 0 left-top, 1 right-top, then extras fill left/right alternately. */
        const all = [primary, compulsion, ...extraBanes];
        const left = all.filter((_, i) => i % 2 === 0);
        const right = all.filter((_, i) => i % 2 === 1);

        const render = (e: BaneEntry) => (
          <SnippetBlock key={e.key} type={e.type} name={e.name} fullText={e.fullText} nameClass={e.nameClass} label={e.label} />
        );

        return (
          <div class="vamp-bane-compulsion">
            <div class="vamp-bane-compulsion__col">{left.map(render)}</div>
            <div class="vamp-merits-flaws__divider" />
            <div class="vamp-bane-compulsion__col">{right.map(render)}</div>
          </div>
        );
      })()}

      <SectionBox title="Convictions & Touchstones" collapsible collapsedLabel="Convictions (& Touchstones)">
        {(collapsed: boolean) => {
          if (editMode.value || (guideActive.value && isCreationPhase.value && creationStep.value === 'convictions')) {
            return <ConvictionsCreationPanel />;
          }
          /* Touchstones always private to viewers & tuck away when collapsed. */
          const showTouchstones = !viewingOtherSheet.value && !collapsed;
          return (
            <div class="vamp-paired vamp-paired--grid">
              {char.convictions.map((conviction, i) => (
                <div class="vamp-paired__item" key={i}>
                  <div class="vamp-paired__conviction">{conviction ? `“${conviction}”` : '—'}</div>
                  {showTouchstones && char.touchstones[i] && char.touchstones[i].name && (
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
          );
        }}
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
  "Baby", "Child", "Youth", "Teen", "Young Adult", "Mature Adult", "Senior",
  "Don't Ask", "Don't Know",
];

const MAX_CONVICTIONS = 4;

function ConvictionForm({ index }: { index: number }) {
  const char = character.value;
  const storedConviction = char.convictions[index] ?? '';
  const raw = char.touchstones[index];
  const storedTouchstone = {
    name: raw?.name ?? '',
    pronouns: raw?.pronouns ?? ['', ''] as [string, string],
    ageBracket: raw?.ageBracket ?? '',
    description: raw?.description ?? '',
  };

  const convDraft = useSignal(storedConviction);
  const tName = useSignal(storedTouchstone.name);
  const tPron0 = useSignal(storedTouchstone.pronouns[0]);
  const tPron1 = useSignal(storedTouchstone.pronouns[1]);
  const tAge = useSignal(storedTouchstone.ageBracket);
  const tDesc = useSignal(storedTouchstone.description);

  const debouncedSave = useRef(
    debounce((conv: string, name: string, p0: string, p1: string, age: string, desc: string) => {
      const c = character.value;
      const convictions = [...c.convictions];
      while (convictions.length <= index) convictions.push('');
      convictions[index] = conv;
      const touchstones = [...c.touchstones];
      while (touchstones.length <= index) touchstones.push({ name: '', pronouns: ['', ''], ageBracket: '', description: '' });
      touchstones[index] = { name, pronouns: [p0, p1], ageBracket: age, description: desc };
      updateCharacter({ convictions, touchstones });
    }, 3000)
  ).current;

  useEffect(() => () => debouncedSave.flush(), []);

  function schedSave() {
    debouncedSave(convDraft.value, tName.value, tPron0.value, tPron1.value, tAge.value, tDesc.value);
  }

  const hasAlwaysNever = /\b(always|never)\b/i.test(convDraft.value);
  const showWarning = convDraft.value.trim().length > 0 && !hasAlwaysNever;
  const descWordCount = tDesc.value.trim().split(/\s+/).filter(Boolean).length;
  const descTooShort = tDesc.value.trim().length > 0 && descWordCount < 3;
  const isEmpty = convDraft.value.trim() === '' && tName.value.trim() === '';

  function onConviction(e: Event) { convDraft.value = (e.target as HTMLInputElement).value; schedSave(); }
  function onName(e: Event) { tName.value = (e.target as HTMLInputElement).value; schedSave(); }
  function onPron0(e: Event) { tPron0.value = (e.target as HTMLInputElement).value; schedSave(); }
  function onPron1(e: Event) { tPron1.value = (e.target as HTMLInputElement).value; schedSave(); }
  function onDesc(e: Event) { tDesc.value = (e.target as HTMLInputElement).value; schedSave(); }
  function onAge(e: Event) { tAge.value = (e.target as HTMLSelectElement).value; schedSave(); }

  return (
    <div class={`vamp-conviction-form ${isEmpty ? 'vamp-conviction-form--empty' : ''}`}>
      <div class="vamp-conviction-form__heading">Conviction {index + 1}</div>

      <input
        class={`vamp-input vamp-conviction-form__conviction ${showWarning ? 'vamp-conviction-form__conviction--warn' : ''}`}
        type="text"
        placeholder={`Write an "Always" or "Never" statement...`}
        value={convDraft.value}
        onInput={onConviction}
      />
      {showWarning && (
        <div class="vamp-conviction-form__warning">
          Convictions usually begin with "Always" or "Never."
        </div>
      )}

      {convDraft.value.trim() && (
        <div class="vamp-conviction-form__preview">"{convDraft.value}"</div>
      )}

      <div class="vamp-conviction-form__sub-heading">Linked Touchstone</div>

      <input
        class="vamp-input"
        type="text"
        placeholder="NPC name"
        value={tName.value}
        onInput={onName}
      />

      <div class="vamp-conviction-form__row">
        <input
          class="vamp-input vamp-conviction-form__pronoun"
          type="text"
          placeholder="they"
          value={tPron0.value}
          onInput={onPron0}
        />
        <span class="vamp-conviction-form__slash">/</span>
        <input
          class="vamp-input vamp-conviction-form__pronoun"
          type="text"
          placeholder="them"
          value={tPron1.value}
          onInput={onPron1}
        />
        <select
          class="creation-dropdown"
          value={tAge.value}
          onChange={onAge}
        >
          <option value="">Age?</option>
          {HUMAN_AGE_BRACKETS.map(ab => <option key={ab} value={ab}>{ab}</option>)}
        </select>
      </div>

      <input
        class={`vamp-input ${descTooShort ? 'vamp-conviction-form__conviction--warn' : ''}`}
        type="text"
        placeholder="Who are they to you? (at least a few words)"
        value={tDesc.value}
        onInput={onDesc}
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

/* Stays open when focus moves to another bio field (Tab flow) */
function handleBioBlur(e: FocusEvent, close: () => void) {
  const related = (e as FocusEvent).relatedTarget as HTMLElement | null;
  const dualContainer = (e.currentTarget as HTMLElement).closest('.vamp-bio__field');
  if (dualContainer?.contains(related)) return;
  const bioContainer = (e.currentTarget as HTMLElement).closest('.vamp-bio');
  if (bioContainer?.contains(related)) return;
  close();
}

function BioDualField({ label, bio, variant, active, onActivate, onClose, onAdvance, onRetreat }: {
  label: string;
  bio: Bio;
  variant: 'ages' | 'pronouns';
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
  onAdvance: () => void;
  onRetreat: () => void;
}) {
  const isEdit = editMode.value;
  const isCreatingName = guideActive.value && isCreationPhase.value && creationStep.value === 'name';
  const isAges = variant === 'ages';
  const v1 = isAges ? bio.vampiricAge : bio.pronouns[0];
  const v2 = isAges ? bio.apparentAge : bio.pronouns[1];
  const display = v1 || v2
    ? (isAges ? `${v1} (${v2})` : `${v1}/${v2}`)
    : '';

  const draft1 = useSignal(v1);
  const draft2 = useSignal(v2);
  const savedRef = useRef({ v1, v2 });
  const hasFocused = useRef(false);

  const debouncedSave = useRef(
    debounce((d1: string, d2: string) => {
      savedRef.current = { v1: d1, v2: d2 };
      const current = character.value.bio;
      if (isAges) {
        updateCharacter({ bio: { ...current, vampiricAge: d1, apparentAge: d2 } });
      } else {
        updateCharacter({ bio: { ...current, pronouns: [d1, d2] } });
      }
    }, 3000)
  ).current;

  useEffect(() => () => debouncedSave.cancel(), []);

  if (!active) {
    draft1.value = v1;
    draft2.value = v2;
    savedRef.current = { v1, v2 };
    hasFocused.current = false;
  }

  function restore() {
    debouncedSave.cancel();
    draft1.value = savedRef.current.v1;
    draft2.value = savedRef.current.v2;
  }

  function handleKey(e: KeyboardEvent, isLastInput: boolean, isFirstInput: boolean) {
    if (e.key === 'Enter') { debouncedSave.flush(); onClose(); }
    if (e.key === 'Escape') { restore(); onClose(); }
    if (e.key === 'Tab') {
      if (e.shiftKey && isFirstInput) { e.preventDefault(); debouncedSave.flush(); onRetreat(); }
      else if (!e.shiftKey && isLastInput) { e.preventDefault(); debouncedSave.flush(); onAdvance(); }
    }
  }

  if (active) {
    return (
      <div class="vamp-bio__field vamp-bio__field--dual">
        <span class="vamp-bio__label">{label}</span>
        <div class="vamp-bio__dual-row">
          <input class="vamp-bio__input vamp-bio__input--half" value={draft1.value}
            placeholder={isAges ? 'actual' : 'any'}
            ref={(el) => { if (el && !hasFocused.current) { hasFocused.current = true; el.focus(); el.select(); } }}
            onInput={(e) => {
              draft1.value = (e.target as HTMLInputElement).value;
              debouncedSave(draft1.value, draft2.value);
            }}
            onBlur={(e) => { debouncedSave.flush(); handleBioBlur(e, onClose); }}
            onKeyDown={(e) => handleKey(e as unknown as KeyboardEvent, false, true)}
          />
          <span class="vamp-bio__sep">{isAges ? '(' : '/'}</span>
          <input class="vamp-bio__input vamp-bio__input--half" value={draft2.value}
            placeholder={isAges ? 'looks' : 'all'}
            onInput={(e) => {
              draft2.value = (e.target as HTMLInputElement).value;
              debouncedSave(draft1.value, draft2.value);
            }}
            onBlur={(e) => { debouncedSave.flush(); handleBioBlur(e, onClose); }}
            onKeyDown={(e) => handleKey(e as unknown as KeyboardEvent, true, false)}
          />
          {isAges && <span class="vamp-bio__sep">)</span>}
        </div>
      </div>
    );
  }

  return (
    <div class="vamp-bio__field" onDblClick={() => { if (isEdit || isCreatingName) onActivate(); }}>
      <span class="vamp-bio__label">{label}</span>
      <span class="vamp-bio__value">{display || '—'}</span>
    </div>
  );
}

function BioField({ label, field, bio, active, onActivate, onClose, onAdvance, onRetreat }: {
  label: string;
  field: keyof Bio;
  bio: Bio;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
  onAdvance: () => void;
  onRetreat: () => void;
}) {
  const draft = useSignal(bio[field] as string);
  const savedRef = useRef(bio[field] as string);
  const hasFocused = useRef(false);
  const isEdit = editMode.value;
  const isCreatingName = guideActive.value && isCreationPhase.value && creationStep.value === 'name';
  const value = bio[field] as string;

  const debouncedSave = useRef(
    debounce((val: string) => {
      savedRef.current = val;
      updateCharacter({ bio: { ...character.value.bio, [field]: val } });
    }, 3000)
  ).current;

  useEffect(() => () => debouncedSave.cancel(), []);

  if (!active) {
    draft.value = value;
    savedRef.current = value;
    hasFocused.current = false;
  }

  if (active) {
    return (
      <div class="vamp-bio__field">
        <span class="vamp-bio__label">{label}</span>
        <input class="vamp-bio__input" value={draft.value}
          ref={(el) => { if (el && !hasFocused.current) { hasFocused.current = true; el.focus(); el.select(); } }}
          onInput={(e) => {
            const val = (e.target as HTMLInputElement).value;
            draft.value = val;
            debouncedSave(val);
          }}
          onBlur={(e) => { debouncedSave.flush(); handleBioBlur(e, onClose); }}
          onKeyDown={(e) => {
            const key = (e as unknown as KeyboardEvent).key;
            if (key === 'Enter') { debouncedSave.flush(); onClose(); }
            if (key === 'Escape') {
              debouncedSave.cancel();
              draft.value = savedRef.current;
              onClose();
            }
            if (key === 'Tab') {
              e.preventDefault();
              debouncedSave.flush();
              if ((e as unknown as KeyboardEvent).shiftKey) onRetreat();
              else onAdvance();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div class="vamp-bio__field" onDblClick={() => { if (isEdit || isCreatingName) onActivate(); }}>
      <span class="vamp-bio__label">{label}</span>
      <span class="vamp-bio__value">{value || '—'}</span>
    </div>
  );
}


const BIO_FIELDS = [
  { type: 'dual', label: 'Ages', variant: 'ages' },
  { type: 'dual', label: 'Pronouns', variant: 'pronouns' },
  { type: 'single', label: 'Height', field: 'height' },
  { type: 'single', label: 'Weight', field: 'weight' },
  { type: 'single', label: 'Style', field: 'style' },
  { type: 'single', label: 'Occupation', field: 'occupation' },
] as const;

function BioSection({ bio }: { bio: Bio }) {
  const activeIndex = useSignal<number | null>(null);

  function activate(i: number) { activeIndex.value = i; }
  function close() { activeIndex.value = null; }
  function advance(current: number) {
    const next = current + 1;
    activeIndex.value = next < BIO_FIELDS.length ? next : null;
  }
  function retreat(current: number) {
    const prev = current - 1;
    activeIndex.value = prev >= 0 ? prev : null;
  }

  return (
    <div class="vamp-bio">
      {BIO_FIELDS.map((f, i) =>
        f.type === 'dual' ? (
          <BioDualField key={f.label} label={f.label} bio={bio} variant={f.variant}
            active={activeIndex.value === i} onActivate={() => activate(i)} onClose={close}
            onAdvance={() => advance(i)} onRetreat={() => retreat(i)} />
        ) : (
          <BioField key={f.label} label={f.label} field={f.field} bio={bio}
            active={activeIndex.value === i} onActivate={() => activate(i)} onClose={close}
            onAdvance={() => advance(i)} onRetreat={() => retreat(i)} />
        )
      )}
    </div>
  );
}

function NameField({ name, isCreating }: { name: string; isCreating: boolean }) {
  const editing = useSignal(false);
  const draft = useSignal(name);
  const savedRef = useRef(name);
  const isEdit = editMode.value;

  const displayRef = useRef<HTMLDivElement>(null);

  const debouncedSave = useRef(
    debounce((text: string) => {
      savedRef.current = text;
      updateCharacter({ name: text });
    }, 3000)
  ).current;

  useEffect(() => () => debouncedSave.cancel(), []);

  /* Full name, always: shrink the font until it fits two lines rather than
     truncating or pushing the sidebar down. */
  useLayoutEffect(() => {
    const el = displayRef.current;
    if (!el) return;
    const MAX = 1.2, MIN = 0.65, STEP = 0.04;
    const fit = () => {
      let size = MAX;
      el.style.fontSize = `${size}rem`;
      for (let i = 0; i < 32 && size > MIN; i++) {
        const lh = parseFloat(getComputedStyle(el).lineHeight) || size * 18.4;
        /* Prefer wrapping to 2 lines over shrinking; names wrap only at spaces/hyphens, width check only shrinks a long unbreakable token instead of letting it overflow. */
        const fits = el.scrollHeight <= lh * 2 + 1 && el.scrollWidth <= el.clientWidth + 1;
        if (fits) break;
        size = Math.max(MIN, size - STEP);
        el.style.fontSize = `${size}rem`;
      }
    };
    let cancelled = false;
    let lastWidth = -1;
    /* Font tweaks change height, which are ignored to avoid a loop. */
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (Math.abs(w - lastWidth) < 0.5) return;
      lastWidth = w;
      fit();
    });
    ro.observe(el);
    document.fonts?.ready.then(() => { if (!cancelled) fit(); });
    return () => { cancelled = true; ro.disconnect(); };
  }, [name, editing.value, isCreating]);

  if (!editing.value && !isCreating) {
    draft.value = name;
    savedRef.current = name;
  }

  if (isCreating || editing.value) {
    return (
      <input
        class="vamp-identity__name-input"
        type="text"
        placeholder="Inscribe a name..."
        value={draft.value}
        onInput={(e) => {
          const text = (e.target as HTMLInputElement).value;
          draft.value = text;
          debouncedSave(text);
        }}
        onBlur={() => { debouncedSave.flush(); editing.value = false; }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { debouncedSave.flush(); editing.value = false; }
          if (e.key === 'Escape') {
            debouncedSave.cancel();
            draft.value = savedRef.current;
            editing.value = false;
          }
        }}
        autoFocus={!isCreating}
      />
    );
  }

  return (
    <div
      ref={displayRef}
      class="vamp-identity__name"
      onDblClick={() => { if (isEdit) editing.value = true; }}
    >{name || 'Unnamed'}</div>
  );
}

function PortraitToggle() {
  const min = portraitMinimized.value;
  return (
    <button
      class={`vamp-portrait-toggle ${min ? 'vamp-portrait-toggle--min' : ''}`}
      onClick={() => { portraitMinimized.value = !min; }}
      aria-label={min ? 'Expand portrait' : 'Minimize portrait'}
      aria-pressed={min}
    >
      <span class="vamp-portrait-toggle__bat" />
    </button>
  );
}

function MiniIdentityCard() {
  const char = character.value;
  const p = char.portraits[0];
  const meta = [char.playbook, char.ageBracket, `BP ${char.bp}`].filter(Boolean).join(' | ');
  return (
    <div class="vamp-identity__mini">
      <div class="vamp-identity__mini-pic">
        <PortraitToggle />
        {p
          ? <img src={p.url} alt={char.name} style={`object-position: ${p.x}% ${p.y}%`} />
          : <span class="vamp-identity__mini-placeholder">?</span>}
      </div>
      <div class="vamp-identity__mini-info">
        <div class="vamp-identity__mini-name">{char.name || 'Unnamed'}</div>
        <div class="vamp-identity__mini-meta">{meta}</div>
      </div>
    </div>
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

  useEffect(() => {
    const urls = character.value.portraits.map(p => p.url);
    preloadPortraits(urls);
  }, [slug]);

  /* Short viewports (720p, or a zoomed-in larger screen) can't fit the full portrait plus
     the stat column. Default the portrait minimized when one is set; manual expand sticks
     since this only ever minimizes, never re-opens. */
  const portraitCount = character.value.portraits.length;
  useEffect(() => {
    if (isViewing || portraitCount === 0) return;
    const mql = window.matchMedia('(max-height: 760px)');
    const apply = () => { if (mql.matches) portraitMinimized.value = true; };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [slug, portraitCount, isViewing]);

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
  const playMode = !editMode.value && !isCreating && !isViewing;

  const hLvl = hungerLevel(char.hunger);
  const hungerTip = `${hLvl.name}: ${hLvl.text}`;
  const bpTip = char.bp === 0
    ? `${hp} HP, no Blood Surges, no Powers, no feeding restrictions`
    : `${hp} HP, Blood Surge ${char.bp}/night, level ${char.bp} Powers`;
  const humanityTip = 'Touchscreens, digest food ~1hr. Blush of Life with Advantage.';
  const harmThreshold = Math.ceil(hp / 2);
  const harmTip = `${char.harm.superficial} Superficial & ${char.harm.aggravated} Aggravated. | At 0 HP: ≥${harmThreshold} Agg. = Final Death | <${harmThreshold} = Torpor`;

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
          {!isCreating && portraitMinimized.value ? (
            <MiniIdentityCard />
          ) : (
            <>
              <NameField name={char.name} isCreating={isCreating && step === 'name'} />
              <div class="vamp-identity__portrait-wrap">
                {!isCreating && <PortraitToggle />}
                <PortraitEditor portraits={char.portraits} name={char.name} />
              </div>
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
            </>
          )}

          <BioSection bio={char.bio} />
        </div>

        <div class="vamp-stat-list">
          {STAT_ORDER.map(statName => {
            const value = char.stats[statName];
            const entry = statMap.find(e => e.statName === statName);
            const moves = entry?.moves ?? [];

            const isEdit = editMode.value && !isCreating;
            const canRoll = !isEdit && !isCreating && !isViewing;
            const cap = statCap.value;
            const handleStatRoll = (stat: typeof statName) => {
              performRoll(stat);
            };
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
                  <div
                    class={`vamp-stat__circle ${canRoll ? 'vamp-stat__circle--rollable' : ''}`}
                    onClick={canRoll ? () => handleStatRoll(statName) : undefined}
                    role={canRoll ? 'button' : undefined}
                    tabIndex={canRoll ? 0 : undefined}
                    aria-label={canRoll ? `Roll +${statName}` : undefined}
                  >
                    {isNaN(value) ? '+0' : value >= 0 ? `+${value}` : value}
                  </div>
                  {isEdit && (
                    <button
                      class="vamp-stat__adj vamp-stat__adj--plus"
                      disabled={value >= cap}
                      onClick={() => adjustStat(statName, 1, cap)}
                    />
                  )}
                  <div
                    class={`vamp-stat__name ${canRoll ? 'vamp-stat__name--rollable' : ''}`}
                    onClick={canRoll ? () => handleStatRoll(statName) : undefined}
                  >
                    {statName}
                  </div>
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

            <SectionBox title="Blood Potency" legendTip={bpTip}>
              <BPTracker canRoll={playMode} />
            </SectionBox>

            <SectionBox title="Humanity" legendTip={humanityTip}>
              <HumanityTracker key={`${char.humanity}-${char.stains}`} canRoll={playMode} />
            </SectionBox>

            <SectionBox title="XP">
              <XPTracker />
            </SectionBox>

            <SectionBox title="Hunger" legendTip={hungerTip}>
              <HungerTracker canRoll={playMode} />
            </SectionBox>

            <SectionBox title="Harm" legendTip={harmTip}>
              <HarmTracker key={`${hp}-${char.harm.superficial}-${char.harm.aggravated}`} hp={hp} canRoll={playMode} />
            </SectionBox>

          </div>
        </div>

        <div class="vamp-sheet__content">
          <div class="vamp-toolbar-row">
            <div class={`vamp-modifier-float ${guideZone === 'toolbar-left' || guideStep?.id === 'tour-modifiers' ? 'guide-spotlight' : ''}`}>
              <SectionBox title="Modifiers">
                <ModifierBar />
              </SectionBox>
            </div>
            <div class={`vamp-scene-float ${guideZone === 'toolbar-right' || guideStep?.id === 'tour-scene-tools' ? 'guide-spotlight' : ''}`}>
              <SectionBox title="Tools">
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
