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
import {
  character, fillClockSegment, unfillClockSegment, removeClock,
  setHunger, setBP, setXP, fireXPTrigger, setHumanity, setHarm,
} from '../state/character';
import { masqueradeClock, fillMasquerade, unfillMasquerade } from '../state/coterie';
import {
  currentPlaybook, currentPredatorType,
  moveStatMap, otherMoves, maxHP, accessibleDisciplineData,
} from '../state/derived';
import { switchTab, openMove } from '../state/panel';
import { renderGameMarkdown } from '../data/transforms';
import type { StatName } from '../data/types';

// All rendered markdown comes from our own verified JSON parsers (trusted content)

const STAT_ORDER: StatName[] = ['Blood', 'Shadow', 'Resolve', 'Demeanor', 'Wits'];

type PipState = 'empty' | 'slashed' | 'filled' | 'confirm';
const PIP_CYCLE: PipState[] = ['empty', 'slashed', 'filled', 'confirm'];

type DebtState = 'empty' | 'slashed' | 'filled';
const DEBT_PIP_CYCLE: DebtState[] = ['empty', 'slashed', 'filled'];

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

  const bpText = bp === 0
    ? `${hp} HP, no Blood Surges, no Powers, no feeding restrictions`
    : `${hp} HP, Blood Surge ${bp}/night, level ${bp} Powers`;

  return (
    <div>
      <div class="vamp-pip-row">
        <ClickPipRow value={bp} count={5} onChange={setBP} muted droplet />
        <span class="vamp-tracker-label">BP {bp}</span>
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

type Debt = { who: string; text: string; state: DebtState };

function useDebtList(initial: Debt[]) {
  const debts = useSignal<Debt[]>(initial);

  function advance(i: number) {
    const next = [...debts.value];
    const idx = DEBT_PIP_CYCLE.indexOf(next[i].state);
    next[i] = { ...next[i], state: DEBT_PIP_CYCLE[(idx + 1) % DEBT_PIP_CYCLE.length] };
    debts.value = next;
  }

  function reverse(i: number, e: Event) {
    e.preventDefault();
    const next = [...debts.value];
    const idx = DEBT_PIP_CYCLE.indexOf(next[i].state);
    next[i] = { ...next[i], state: DEBT_PIP_CYCLE[(idx - 1 + DEBT_PIP_CYCLE.length) % DEBT_PIP_CYCLE.length] };
    debts.value = next;
  }

  return { debts, advance, reverse };
}

function DebtSection({ debts, advance, reverse, guarded }: {
  debts: Debt[];
  advance: (i: number) => void;
  reverse: (i: number, e: Event) => void;
  guarded?: boolean;
}) {
  const confirming = useSignal<number | null>(null);

  function handleAdvance(i: number) {
    if (!guarded) return advance(i);
    if (confirming.value === i) {
      confirming.value = null;
      advance(i);
    } else {
      confirming.value = i;
    }
  }

  return (
    <div class="vamp-debt-list">
      {debts.length === 0 && (
        <div class="vamp-debt-list__empty">None</div>
      )}
      {debts.map((d, i) => (
        <div class="vamp-debt" key={i}>
          <div
            class={`vamp-pip vamp-pip--${confirming.value === i ? 'confirm' : d.state} ${guarded ? 'vamp-pip--muted' : ''}`}
            onClick={() => handleAdvance(i)}
            onContextMenu={(e) => { confirming.value = null; reverse(i, e); }}
          >
            {confirming.value === i && <span class="vamp-pip__confirm">?</span>}
          </div>
          <span class="vamp-debt__body">
            <span class={`vamp-debt__who ${d.state === 'filled' ? 'vamp-debt__who--cashed' : ''}`}>{d.who}</span>
            <span class={`vamp-debt__text ${d.state === 'filled' ? 'vamp-debt__text--cashed' : ''}`}>{d.text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function DebtPanel() {
  const charDebts = character.value.debts;
  const owed = useDebtList(
    charDebts.filter(d => d.direction === 'owed').map(d => ({ who: d.who, text: d.text, state: d.state }))
  );
  const youOwe = useDebtList(
    charDebts.filter(d => d.direction === 'owe').map(d => ({ who: d.who, text: d.text, state: d.state }))
  );

  return (
    <div class="vamp-debts-split">
      <div class="vamp-debts-split__col">
        <div class="vamp-debts-split__heading">Owed to you</div>
        <DebtSection
          debts={owed.debts.value}
          advance={owed.advance}
          reverse={owed.reverse}
        />
      </div>
      <div class="vamp-debts-split__divider" />
      <div class="vamp-debts-split__col">
        <div class="vamp-debts-split__heading">You owe</div>
        <DebtSection
          debts={youOwe.debts.value}
          advance={youOwe.advance}
          reverse={youOwe.reverse}
          guarded
        />
      </div>
    </div>
  );
}

const TABS = ['Vitals', 'Disciplines', 'Possessions', 'Clocks & Debts', 'Notebook'] as const;

function ContentTabs() {
  const active = useSignal(0);

  return (
    <div class="vamp-tabs">
      <nav
        class="vamp-tabs__bar"
        role="tablist"
        style={`--tab-count: ${TABS.length}; --tab-active-idx: ${active.value}`}
      >
        {TABS.map((tab, i) => (
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
        {active.value === 0 && <VitalsTab />}
        {active.value === 1 && <DisciplinesTab />}
        {active.value === 2 && (
          <div class="vamp-placeholder">
            Possessions and inventory
            <br /><span class="vamp-placeholder__note">Tagged items, equipment, resources</span>
          </div>
        )}
        {active.value === 3 && <ClocksDebtsTab />}
        {active.value === 4 && <NotebookTab />}
      </div>
    </div>
  );
}

function ClocksDebtsTab() {
  const mqc = masqueradeClock.value;
  const clocks = character.value.clocks;

  return (
    <>
      <SectionBox title="Debts">
        <DebtPanel />
      </SectionBox>

      <SectionBox title="Clocks">
        <div class="vamp-clocks">
          <ClockDisplay
            clock={mqc}
            gradient
            onFill={fillMasquerade}
            onUnfill={unfillMasquerade}
          />
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

function VitalsTab() {
  const playbook = currentPlaybook.value;
  const pt = currentPredatorType.value;
  const char = character.value;
  const disciplines = accessibleDisciplineData.value;

  const clanPerks = playbook?.perks ?? [];
  const disciplinePerks = disciplines
    .filter(d => d.perk)
    .map(d => ({ name: d.perk!.name, body: d.perk!.body, source: d.name }));

  return (
    <div class="vamp-content-columns">
      <SectionBox title="Perks">
        {clanPerks.map(perk => (
          <div class="vamp-perk" key={perk.name}>
            <div class="vamp-perk__header">
              <span class="vamp-perk__name">{perk.name}</span>
              <span class="vamp-perk__pill">{playbook?.name}</span>
            </div>
            <div class="vamp-perk__text" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(perk.description) }} />
          </div>
        ))}
        {disciplinePerks.map(perk => (
          <div class="vamp-perk" key={perk.name}>
            <div class="vamp-perk__header">
              <span class="vamp-perk__name">{perk.name}</span>
              <span class="vamp-perk__pill">{perk.source}</span>
            </div>
            <div class="vamp-perk__text" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(perk.body) }} />
          </div>
        ))}
      </SectionBox>

      <div class="vamp-basics-right">
        <SectionBox title="Bane">
          <div class="vamp-bane">
            <div class="vamp-bane__name">{playbook?.baneName ?? 'Unknown'}</div>
            <div class="vamp-bane__text" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(playbook?.baneDescription ?? '') }} />
          </div>
        </SectionBox>

        <SectionBox title="Compulsion">
          <div class="vamp-bane">
            <div class="vamp-bane__name vamp-bane__name--compulsion">{playbook?.compulsionName ?? 'None'}</div>
            <div class="vamp-bane__text" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(playbook?.compulsionDescription ?? '') }} />
          </div>
        </SectionBox>

        <SectionBox title="Convictions & Touchstones">
          <div class="vamp-paired">
            {char.convictions.map((conviction, i) => (
              <div class="vamp-paired__item" key={i}>
                <div class="vamp-paired__conviction">{conviction}</div>
                {char.touchstones[i] && (
                  <div class="vamp-paired__touchstone">
                    {char.touchstones[i].name} — {char.touchstones[i].description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionBox>

        <SectionBox title="Merits & Flaws">
          <div class="vamp-merits-flaws">
            <div class="vamp-merits-flaws__col">
              <div class="vamp-merits-flaws__heading vamp-merits-flaws__heading--merit">Merits</div>
              {pt?.merit && (
                <div class="vamp-merit" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pt.merit) }} />
              )}
            </div>
            <div class="vamp-merits-flaws__divider" />
            <div class="vamp-merits-flaws__col">
              <div class="vamp-merits-flaws__heading vamp-merits-flaws__heading--flaw">Flaws</div>
              {pt?.flaw && (
                <div class="vamp-flaw" dangerouslySetInnerHTML={{ __html: renderGameMarkdown(pt.flaw) }} />
              )}
            </div>
          </div>
        </SectionBox>
      </div>
    </div>
  );
}


export function CharacterSheet() {
  const char = character.value;
  const hp = maxHP.value;
  const statMap = moveStatMap.value;
  const others = otherMoves.value;

  return (
    <div class="vamp-sheet">

      <aside class="vamp-sheet__sidebar">
        <div class="vamp-identity">
          <div class="vamp-identity__name">{char.name}</div>
          <div class="vamp-identity__portrait">
            {char.portraitUrl
              ? <img class="vamp-identity__portrait-img" src={char.portraitUrl} alt={char.name} />
              : <span class="vamp-identity__portrait-placeholder">portrait</span>
            }
          </div>
          <div class="vamp-identity__meta">
            <span class="vamp-identity__link" onClick={() => switchTab('character')}>{char.clan}</span>
            <span class="vamp-identity__sep">|</span>
            <span class="vamp-identity__link" onClick={() => switchTab('character')}>{char.ageBracket}</span>
          </div>
          <div class="vamp-identity__meta">
            <span class="vamp-identity__link" onClick={() => switchTab('character')}>{char.predatorType}</span>
            <span class="vamp-identity__sep">|</span>
            Coterie: <span class="vamp-identity__code">???</span>
          </div>
        </div>

        <div class="vamp-stat-list">
          {STAT_ORDER.map(statName => {
            const value = char.stats[statName];
            const entry = statMap.find(e => e.statName === statName);
            const moves = entry?.moves ?? [];

            return (
              <div class="vamp-stat" key={statName}>
                <div class="vamp-stat__header">
                  <div class="vamp-stat__circle">
                    {value >= 0 ? `+${value}` : value}
                  </div>
                  <div class="vamp-stat__name">{statName}</div>
                </div>
                {moves.length > 0 && (
                  <ul class="vamp-stat__moves">
                    {moves.map(m => (
                      <li
                        key={m.name}
                        class="vamp-stat__move"
                        onClick={() => openMove(m.name)}
                      >
                        <strong>{m.name}</strong>
                        {m.altStat && <span class="vamp-stat__alt"> ({m.altStat})</span>}
                      </li>
                    ))}
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
              {others.map(m => (
                <li
                  key={m}
                  class="vamp-stat__move"
                  onClick={() => openMove(m)}
                >
                  <strong>{m}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      <div class="vamp-sheet__right">

        <div class="vamp-vitals">
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
            <div class="vamp-modifier-float">
              <SectionBox title="Move Modifiers">
                <ModifierBar />
              </SectionBox>
            </div>
            <div class="vamp-scene-float">
              <SectionBox title="Scene Tools">
                <SceneTools />
              </SectionBox>
            </div>
          </div>

          <ContentTabs />

        </div>
      </div>

      <RightColumn>
        <RightPanelContent />
      </RightColumn>
    </div>
  );
}
