import { useSignal } from '@preact/signals';
import { SectionBox } from '../components/SectionBox';

const STATS = [
  { name: 'Blood', value: 2, moves: [['Dirty Your Claws'], ['Feed', 'Reposition']] },
  { name: 'Shadow', value: 1, moves: [['Slip Away']] },
  { name: 'Resolve', value: 0, moves: [['Protect the Coterie'], ['Stay Chill']] },
  { name: 'Demeanor', value: 1, moves: [['Discern Vibes'], ['Hunt']] },
  { name: 'Wits', value: -1, moves: [['Catch the Scent']] },
] as const;

const OTHER_MOVES = [
  'Blush of Life',
  'Help or Hinder',
  'Influence',
] as const;

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

  function advance(i: number) {
    const next = [...boxes.value];
    const idx = PIP_CYCLE.indexOf(next[i]);
    next[i] = PIP_CYCLE[(idx + 1) % PIP_CYCLE.length];
    boxes.value = next;
  }

  function reverse(i: number, e: Event) {
    e.preventDefault();
    const next = [...boxes.value];
    const idx = PIP_CYCLE.indexOf(next[i]);
    next[i] = PIP_CYCLE[(idx - 1 + PIP_CYCLE.length) % PIP_CYCLE.length];
    boxes.value = next;
  }

  const filled = () => boxes.value.filter(s => s === 'filled').length;
  const slashed = () => boxes.value.filter(s => s === 'slashed').length;

  return { boxes, advance, reverse, filled, slashed };
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

function useClickPips(count: number, initial: number) {
  const filled = useSignal(initial);
  return { filled, count };
}

function ClickPipRow({ filled, count, muted, droplet }: {
  filled: { value: number };
  count: number;
  muted?: boolean;
  droplet?: boolean;
}) {
  const shape = droplet ? 'vamp-pip--droplet' : 'vamp-pip--round';
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          class={`vamp-pip ${shape} vamp-pip--small ${i < filled.value ? 'vamp-pip--filled' : ''} ${muted ? 'vamp-pip--muted' : ''}`}
          onClick={() => { filled.value = i < filled.value ? i : i + 1; }}
        />
      ))}
    </>
  );
}

const HUNGER_LEVELS: Record<number, { name: string; text: string }> = {
  0: { name: 'Sated', text: 'Just fed well. No penalties.' },
  1: { name: 'Manageable', text: 'Cravings present but controllable. No penalties.' },
  2: { name: 'Manageable', text: 'Cravings present but controllable. No penalties.' },
  3: { name: 'Distracted', text: 'Blood is on your mind constantly. -1 Ongoing except Hunt, Feed, Dirty Your Claws.' },
  4: { name: 'Ravenous', text: 'You need blood soon. -2 Ongoing except Hunt, Feed, Dirty Your Claws.' },
  5: { name: 'Frenzy', text: 'The Beast is driving. You must Feed until you reach 0 Hunger.' },
};

const BP_LEVELS: Record<number, { hp: number; text: string }> = {
  0: { hp: 6, text: '6 HP, no Blood Surges, no Powers, no feeding restrictions' },
  1: { hp: 6, text: '6 HP, Blood Surge 1/night, level 1 Powers, no feeding restrictions' },
  2: { hp: 9, text: '9 HP, Blood Surge 2/night, level 2 Powers, animals and bags slake 1 less' },
  3: { hp: 12, text: '12 HP, Blood Surge 3/night, level 3 Powers, animals provide no sustenance. -1 XP penalty' },
  4: { hp: 15, text: '15 HP, Blood Surge 4/night, level 4 Powers, below 2 Hunger must drain/kill. -2 XP penalty' },
  5: { hp: 18, text: '18 HP, Blood Surge 5/night, level 5 Powers, below 3 Hunger requires lethal drain. -2 XP penalty' },
};

function HungerTracker() {
  const { filled, count } = useClickPips(5, 2);
  const level = HUNGER_LEVELS[filled.value] ?? HUNGER_LEVELS[5];
  const isFrenzy = filled.value >= 5;

  return (
    <div>
      <div class="vamp-pip-row">
        <ClickPipRow filled={filled} count={count} droplet />
        <span class="vamp-tracker-label">{filled.value}/5</span>
      </div>
      <div class="vamp-tracker-note">
        <strong class={isFrenzy ? 'vamp-frenzy-glow' : ''}>{level.name}:</strong>{' '}{level.text}
      </div>
    </div>
  );
}

function BPTracker({ filled }: { filled: { value: number } }) {
  const level = BP_LEVELS[filled.value] ?? BP_LEVELS[1];

  return (
    <div>
      <div class="vamp-pip-row">
        <ClickPipRow filled={filled} count={5} muted droplet />
        <span class="vamp-tracker-label">BP {filled.value}</span>
      </div>
      <div class="vamp-tracker-note">{level.text}</div>
    </div>
  );
}

function HumanityTracker() {
  const { boxes, advance, reverse, filled, slashed } = useDualPhase(
    ['filled', 'filled', 'filled', 'filled', 'filled', 'filled', 'filled', 'slashed', 'empty', 'empty']
  );
  const stainCount = slashed();
  const stainLabel = stainCount > 0
    ? ` (${stainCount} Stain${stainCount > 1 ? 's' : ''})`
    : '';

  return (
    <div>
      <div class="vamp-pip-row">
        <DualPhasePips boxes={boxes.value} advance={advance} reverse={reverse} />
        <span class="vamp-tracker-label">{filled()}{stainLabel}</span>
      </div>
      <div class="vamp-tracker-note">
        Touchscreens, digest food ~1hr. Blush of Life with Advantage.
      </div>
    </div>
  );
}

function HarmTracker({ maxHP }: { maxHP: number }) {
  const { boxes, advance, reverse, filled, slashed } = useDualPhase(
    ['slashed', 'slashed', 'filled', 'empty', 'empty', 'empty']
  );
  const sup = slashed();
  const agg = filled();
  const threshold = Math.ceil(maxHP / 2);

  return (
    <div>
      <div class="vamp-pip-row">
        <DualPhasePips boxes={boxes.value} advance={advance} reverse={reverse} />
        <span class="vamp-tracker-label">{sup} Superficial | {agg} Aggravated</span>
      </div>
      <div class="vamp-tracker-note">
        At 0 HP: &gt;{threshold} Aggravated = Final Death | &lt;{threshold} = Torpor
      </div>
    </div>
  );
}

function XPTracker() {
  const { filled, count } = useClickPips(10, 3);
  const checks = useSignal<boolean[]>([false, false, false]);

  function toggleCheck(i: number) {
    if (checks.value[i]) return;
    const next = [...checks.value];
    next[i] = true;
    checks.value = next;
    filled.value = Math.min(filled.value + 1, count);
  }

  return (
    <div>
      <div class="vamp-pip-row">
        <ClickPipRow filled={filled} count={count} />
        <span class="vamp-tracker-label">{filled.value}/{count}</span>
      </div>
      <div class="vamp-xp-triggers">
        <div class="vamp-xp-triggers__heading">Once each per session, gain +1 XP when you...</div>
        <label class="vamp-xp-trigger">
          <input type="checkbox" checked={checks.value[0]} onChange={() => toggleCheck(0)} />
          {' '}Deliver Final Death to a Kindred you believe is irredeemable or too dangerous to exist
        </label>
        <label class="vamp-xp-trigger">
          <input type="checkbox" checked={checks.value[1]} onChange={() => toggleCheck(1)} />
          {' '}Prevent violence or injustice against mortals who cannot protect themselves
        </label>
        <label class="vamp-xp-trigger">
          <input type="checkbox" checked={checks.value[2]} onChange={() => toggleCheck(2)} />
          {' '}Successfully resist your Bane when drinking another vampire's blood
        </label>
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
  const owed = useDebtList([
    { who: 'Alejandro', text: 'You kept quiet about his unsanctioned feeding grounds', state: 'empty' },
    { who: 'Nadia', text: 'You saved her ghoul from a Sabbat ambush', state: 'slashed' },
  ]);
  const youOwe = useDebtList([
    { who: 'The Prince', text: 'Overlooked your Sire breaking Tradition when Embracing you', state: 'empty' },
  ]);

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

const TABS = ['Basics', 'Disciplines', 'Possessions', 'Notebook', 'Clocks'] as const;

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
        {active.value === 0 && <BasicsTab />}
        {active.value === 1 && (
          <div class="vamp-placeholder">
            Discipline Powers reference
            <br /><span class="vamp-placeholder__note">Blood Sorcery, Celerity, Obfuscate</span>
          </div>
        )}
        {active.value === 2 && (
          <div class="vamp-placeholder">
            Possessions and inventory
            <br /><span class="vamp-placeholder__note">Tagged items, equipment, resources</span>
          </div>
        )}
        {active.value === 3 && (
          <div class="vamp-placeholder">
            Notebook
            <br /><span class="vamp-placeholder__note">Draggable markdown sticky notes</span>
          </div>
        )}
        {active.value === 4 && (
          <div class="vamp-placeholder">
            Clocks
            <br /><span class="vamp-placeholder__note">4/6/8-segment named clocks with conditions</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BasicsTab() {
  return (
    <>
      <div class="vamp-content-columns">
        <SectionBox title="Perks">
          <div class="vamp-perk">
            <div class="vamp-perk__name">Righteous Hunger</div>
            <div class="vamp-perk__text">When you <strong>Feed</strong> from someone you believe genuinely deserves punishment, slake an additional 1 Hunger. If you successfully Diablerize them, you don't lose any Humanity, and instead clear all Stains.</div>
          </div>
          <div class="vamp-perk">
            <div class="vamp-perk__name">Arbiter's Eyes</div>
            <div class="vamp-perk__text">When you <strong>Discern Vibes</strong> or <strong>Catch the Scent</strong> to determine if someone has recently committed a crime or transgression, you have Advantage on the roll.</div>
          </div>
        </SectionBox>

        <div class="vamp-bane-compulsion">
          <SectionBox title="Bane">
            <div class="vamp-bane">
              <div class="vamp-bane__name">Diablerist's Thirst</div>
              <div class="vamp-bane__text">When you <strong>Feed</strong> from another vampire, you must immediately <strong>Stay Chill</strong> or enter a feeding Frenzy, attempting to drain them completely. On a success, take an Ongoing penalty equal to your BP to <strong>Stay Chill</strong> and resist <strong>Feeding</strong> from them again until you're too far away to smell them.</div>
            </div>
          </SectionBox>
          <SectionBox title="Compulsion">
            <div class="vamp-bane">
              <div class="vamp-bane__name">Judgment</div>
              <div class="vamp-bane__text">When someone violates one of your Convictions or personal codes in your presence, take an Ongoing penalty equal to your BP to all rolls except those directly working toward punishing them, until you <strong>Feed</strong> from the transgressor or the scene ends.</div>
            </div>
          </SectionBox>
        </div>
      </div>

      <div class="vamp-content-columns">
        <SectionBox title="Convictions & Touchstones">
          <div class="vamp-paired">
            <div class="vamp-paired__item">
              <div class="vamp-paired__conviction">"I will never harm an innocent."</div>
              <div class="vamp-paired__touchstone">Marcus — mortal friend, bartender at The Red Door</div>
            </div>
            <div class="vamp-paired__item">
              <div class="vamp-paired__conviction">"The strong must protect the weak."</div>
              <div class="vamp-paired__touchstone">Elena — former colleague, social worker</div>
            </div>
          </div>
        </SectionBox>

        <SectionBox title="Debts">
          <DebtPanel />
        </SectionBox>
      </div>
    </>
  );
}

export function CharacterSheet() {
  const bpFilled = useSignal(1);
  const maxHP = (BP_LEVELS[bpFilled.value] ?? BP_LEVELS[1]).hp;

  return (
    <div class="vamp-sheet">

      <aside class="vamp-sheet__sidebar">
        <div class="vamp-identity">
          <div class="vamp-identity__name">Johnny Fangs</div>
          <div class="vamp-identity__portrait">portrait</div>
          <div class="vamp-identity__meta">Banu Haqim <span class="vamp-identity__sep">|</span> Fledgling</div>
          <div class="vamp-identity__meta">Consensualist <span class="vamp-identity__sep">|</span> Coterie: <span class="vamp-identity__code">???</span></div>
        </div>

        <div class="vamp-stat-list">
          {STATS.map(s => (
            <div class="vamp-stat" key={s.name}>
              <div class="vamp-stat__header">
                <div class="vamp-stat__circle">
                  {s.value >= 0 ? `+${s.value}` : s.value}
                </div>
                <div class="vamp-stat__name">{s.name}</div>
              </div>
              <ul class="vamp-stat__moves">
                {s.moves.map((line, li) => (
                  <li key={li} class="vamp-stat__move">
                    {line.map((m, mi) => (
                      <span key={m}>
                        {mi > 0 && <span class="vamp-stat__sep">|</span>}
                        <strong>{m}</strong>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div class="vamp-sidebar__universal">
          <div class="vamp-stat__name">Other Basic Moves</div>
          <ul class="vamp-stat__moves vamp-stat__moves--universal">
            {OTHER_MOVES.map(m => (
              <li key={m} class="vamp-stat__move"><strong>{m}</strong></li>
            ))}
          </ul>
        </div>
      </aside>

      <div class="vamp-sheet__right">

        <div class="vamp-vitals">
          <div class="vamp-vitals__grid">

            <SectionBox title="Blood Potency">
              <BPTracker filled={bpFilled} />
            </SectionBox>

            <SectionBox title="Humanity">
              <HumanityTracker />
            </SectionBox>

            <SectionBox title="XP">
              <XPTracker />
            </SectionBox>

            <SectionBox title="Hunger">
              <HungerTracker />
            </SectionBox>

            <SectionBox title="Harm">
              <HarmTracker maxHP={maxHP} />
            </SectionBox>

          </div>
        </div>

        <div class="vamp-sheet__content">

          <div class="vamp-modifier-float">
            <SectionBox title="Move Modifiers">
              <div class="vamp-modifier-stack">
                <div class="vamp-modifier">
                  <span class="vamp-modifier__value">+1 Forward</span>
                  <span>to <strong>Influence</strong></span>
                  <span class="vamp-modifier__source">from Auspex: Premonition</span>
                </div>
                <div class="vamp-modifier">
                  <span class="vamp-modifier__value">+1 Ongoing</span>
                  <span>to <strong>Discern Vibes</strong></span>
                  <span class="vamp-modifier__source">from Heightened Senses</span>
                </div>
                <div class="vamp-modifier">
                  <span class="vamp-modifier__value">2 Hold</span>
                  <span>from <strong>Discern Vibes</strong></span>
                  <span class="vamp-modifier__source">spend to ask a question</span>
                </div>
              </div>
            </SectionBox>
          </div>

          <ContentTabs />

        </div>
      </div>

      <aside class="vamp-sheet__panel-right">
        <div class="vamp-placeholder">
          Coterie Sheet
          <br /><span class="vamp-placeholder__note">Advancement, Coterie Stats, Bloodline</span>
        </div>
      </aside>
    </div>
  );
}
