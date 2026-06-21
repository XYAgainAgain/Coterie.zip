import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  character, addModifier, removeModifier, adjustModifierValue,
  quickAdjustForward, quickAdjustOngoing, quickAddHold,
  quickToggleAdvantage, quickToggleDisadvantage, toggleBloodSurge,
  MANUAL_SOURCE, MAX_HOLD_COUNTERS,
} from '../state/character';
import type { Modifier } from '../state/character';
import {
  universalForwardTotal, universalOngoingTotal, universalTotal,
  conditionalTotals, holdCounters, netAdvantage, bloodSurgeArmed,
} from '../state/derived';
import type { AdvantageState } from '../state/derived';
import { STAT_NAMES } from '../data/types';
import type { StatName } from '../data/types';

const HOLD_COLORS = ['var(--v-hold-1)', 'var(--v-hold-2)', 'var(--v-hold-3)'];

const MOD_TYPES = ['forward', 'ongoing', 'hold', 'advantage', 'disadvantage'] as const;

const PlusSvg = () => (
  <svg viewBox="0 0 16 16" width="14" height="14">
    <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
);

const MinusSvg = () => (
  <svg viewBox="0 0 16 16" width="14" height="14">
    <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
);

/* Number with its +/- stacked above/below, matching the Hold counters. */
function NumberCounter({ value, label, dim, onUp, onDown }: {
  value: string;
  label: string;
  dim: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div class="vamp-mod-pair">
      <div class="vamp-mod-counter">
        <button class="vamp-mod-vbtn" onClick={onUp} aria-label={`Add +1 ${label}`} title={`Add +1 ${label}`}><PlusSvg /></button>
        <span class={`vamp-mod-num ${dim ? 'vamp-mod-num--dim' : ''}`}>{value}</span>
        <button class="vamp-mod-vbtn" onClick={onDown} aria-label={`Subtract 1 ${label}`} title={`Subtract 1 ${label}`}><MinusSvg /></button>
      </div>
      <span class={`vamp-mod-pair-label ${dim ? 'vamp-mod-pair-label--dim' : ''}`}>{label}</span>
    </div>
  );
}

function NumbersZone() {
  const fwd = universalForwardTotal.value;
  const ong = universalOngoingTotal.value;

  return (
    <div class="vamp-mod-zone vamp-mod-zone--numbers">
      <NumberCounter
        value={fwd >= 0 ? `+${fwd}` : `${fwd}`}
        label="Forward"
        dim={fwd === 0}
        onUp={() => quickAdjustForward(1)}
        onDown={() => quickAdjustForward(-1)}
      />
      <NumberCounter
        value={ong >= 0 ? `+${ong}` : `${ong}`}
        label="Ongoing"
        dim={ong === 0}
        onUp={() => quickAdjustOngoing(1)}
        onDown={() => quickAdjustOngoing(-1)}
      />
    </div>
  );
}

function DiceModeZone() {
  const state = netAdvantage.value;
  const shortLabel = state === 'advantage' ? 'ADV' : state === 'disadvantage' ? 'DIS' : 'FLAT';
  const fullLabel = state === 'advantage' ? 'Advantage' : state === 'disadvantage' ? 'Disadvantage' : 'Flat';
  const armed = bloodSurgeArmed.value;
  const surgeCount = character.value.bloodSurgeAdvantages + (armed ? 1 : 0);

  return (
    <div class="vamp-mod-zone vamp-mod-zone--dice">
      <div class="vamp-mod-dice-toggle">
        <button
          class={`vamp-mod-arrow vamp-mod-arrow--up ${state === 'advantage' ? 'vamp-mod-arrow--active' : ''}`}
          onClick={quickToggleAdvantage}
          aria-label="Toggle Advantage"
          title="Toggle Advantage"
        >
          <span class="vamp-mod-bat vamp-mod-bat--up" aria-hidden="true" />
        </button>
        <span class={`vamp-mod-dice-label vamp-mod-dice-label--${state}`} title={fullLabel}>{shortLabel}</span>
        <button
          class={`vamp-mod-arrow vamp-mod-arrow--down ${state === 'disadvantage' ? 'vamp-mod-arrow--active' : ''}`}
          onClick={quickToggleDisadvantage}
          aria-label="Toggle Disadvantage"
          title="Toggle Disadvantage"
        >
          <span class="vamp-mod-bat vamp-mod-bat--down" aria-hidden="true" />
        </button>
      </div>
      {surgeCount > 0 && (
        <button
          class={`vamp-mod-surge ${armed ? 'vamp-mod-surge--armed' : ''}`}
          onClick={toggleBloodSurge}
          aria-pressed={armed}
          title={armed ? 'Blood Surge armed for your next roll (tap to cancel)' : 'Arm a Blood Surge Advantage on your next roll'}
        >
          <span class="vamp-mod-surge-name">Surge</span>
          <span class="vamp-mod-surge-count">&times;{surgeCount}</span>
        </button>
      )}
    </div>
  );
}

function HoldZone() {
  const holds = holdCounters.value;
  const canAdd = holds.length < MAX_HOLD_COUNTERS;

  return (
    <div class="vamp-mod-zone vamp-mod-zone--hold">
      {holds.length > 0 && <span class="vamp-mod-label">Hold</span>}
      {holds.map((h, i) => (
        <div class="vamp-mod-hold-counter" key={h.id}>
          <button
            class="vamp-mod-vbtn"
            onClick={() => adjustModifierValue(h.id, 1)}
            aria-label="Gain 1 Hold"
            title="Gain 1 Hold"
          ><PlusSvg /></button>
          <span
            class="vamp-mod-hold-value"
            style={{ color: HOLD_COLORS[i] }}
          >{h.value}</span>
          <button
            class="vamp-mod-vbtn"
            onClick={() => adjustModifierValue(h.id, -1)}
            aria-label="Spend 1 Hold"
            title="Spend 1 Hold"
          ><MinusSvg /></button>
        </div>
      ))}
      {canAdd && (
        <button
          class="vamp-mod-hold-add"
          onClick={quickAddHold}
          aria-label="Add Hold counter"
          title="Add Hold counter"
        >{holds.length === 0 ? '+HOLD' : '+H'}</button>
      )}
    </div>
  );
}

function TotalZone({ onBarClick }: { onBarClick: () => void }) {
  const total = universalTotal.value;
  const conds = conditionalTotals.value;
  const advState = netAdvantage.value;
  const fmtTotal = total >= 0 ? `+${total}` : `${total}`;
  const dim = total === 0 && conds.length === 0 && advState === 'flat';

  const condText = conds.length > 0
    ? '(' + conds.map(c => `${c.total >= 0 ? '+' : ''}${c.total} if ${c.target}`).join(', ') + ')'
    : '';

  return (
    <div class={`vamp-mod-zone vamp-mod-zone--total ${dim ? 'vamp-mod-zone--dim' : ''}`}>
      <span class="vamp-mod-total-caption">Total</span>
      <button
        class={`vamp-mod-total-number vamp-mod-total-number--${advState}`}
        onClick={(e) => { e.stopPropagation(); onBarClick(); }}
        aria-label="View modifier details"
        title="View modifier details"
      >{fmtTotal}</button>
      <span class="vamp-mod-conditionals">{condText || ' '}</span>
    </div>
  );
}

function PopoverModifierRow({ mod }: { mod: Modifier }) {
  const isAdvDis = mod.type === 'advantage' || mod.type === 'disadvantage';
  const isHold = mod.type === 'hold';
  const typeName = mod.type.charAt(0).toUpperCase() + mod.type.slice(1);
  const fmtValue = isAdvDis ? '' : `${mod.value >= 0 ? '+' : ''}${mod.value} `;
  const sourceLabel = mod.source === MANUAL_SOURCE ? '(manual)' : mod.source;

  return (
    <div class={`vamp-mod-popover-row vamp-mod-popover-row--${mod.type}`}>
      <div class="vamp-mod-popover-info">
        <span class="vamp-mod-popover-value">{fmtValue}{typeName}</span>
        {mod.target && <span class="vamp-mod-popover-target"> to {mod.target}</span>}
        <span class="vamp-mod-popover-source"> from {sourceLabel}</span>
        {isHold && mod.spendOn && (
          <span class="vamp-mod-popover-spendon"> ({mod.spendOn})</span>
        )}
      </div>
      <div class="vamp-mod-popover-controls">
        {(mod.type === 'forward' || mod.type === 'ongoing' || isHold) && (
          <>
            <button
              class="vamp-mod-popover-adj"
              onClick={() => adjustModifierValue(mod.id, -1)}
              aria-label={isHold ? 'Spend 1 Hold' : 'Decrease'}
            >-</button>
            <button
              class="vamp-mod-popover-adj"
              onClick={() => adjustModifierValue(mod.id, 1)}
              aria-label={isHold ? 'Gain 1 Hold' : 'Increase'}
            >+</button>
          </>
        )}
        <button
          class="vamp-mod-popover-remove"
          onClick={() => removeModifier(mod.id)}
          aria-label="Remove"
          title="Remove"
        >
          <svg viewBox="0 0 16 16" width="10" height="10">
            <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function AddModifierForm({ onClose }: { onClose: () => void }) {
  const modType = useSignal<Modifier['type']>('forward');
  const modValue = useSignal(1);
  const modTarget = useSignal('');
  const modSource = useSignal('');
  const modSpendOn = useSignal('');
  const modStats = useSignal<StatName[]>([]);

  const isAdvDis = modType.value === 'advantage' || modType.value === 'disadvantage';
  // Only Forward/Ongoing are filtered per-stat by the roll engine, so that's where the gate applies.
  const supportsStatGate = modType.value === 'forward' || modType.value === 'ongoing';

  function toggleStat(s: StatName) {
    modStats.value = modStats.value.includes(s)
      ? modStats.value.filter(x => x !== s)
      : [...modStats.value, s];
  }

  function handleCreate() {
    if (!modSource.value.trim()) return;
    addModifier({
      type: modType.value,
      value: isAdvDis ? 0 : modValue.value,
      target: modTarget.value.trim() || null,
      source: modSource.value.trim(),
      ...(modType.value === 'hold' && modSpendOn.value.trim()
        ? { spendOn: modSpendOn.value.trim() }
        : {}),
      ...(supportsStatGate && modStats.value.length ? { stats: [...modStats.value] } : {}),
    });
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') handleCreate();
    if (e.key === 'Escape') onClose();
  }

  return (
    <div class="vamp-mod-popover-form" onKeyDown={handleKeyDown}>
      <div class="vamp-mod-popover-form__types">
        {MOD_TYPES.map(t => (
          <button
            key={t}
            class={`vamp-mod-popover-form__type ${modType.value === t ? 'vamp-mod-popover-form__type--active' : ''}`}
            onClick={() => { modType.value = t; modStats.value = []; }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div class="vamp-mod-popover-form__fields">
        {!isAdvDis && (
          <div class="vamp-mod-popover-form__field">
            <label>Value</label>
            <div class="vamp-mod-popover-form__value-row">
              <button onClick={() => {
                const min = modType.value === 'hold' ? 1 : -5;
                modValue.value = Math.max(min, modValue.value - 1);
              }}>-</button>
              <span>{modValue.value >= 0 ? `+${modValue.value}` : modValue.value}</span>
              <button onClick={() => { modValue.value = Math.min(5, modValue.value + 1); }}>+</button>
            </div>
          </div>
        )}
        <div class="vamp-mod-popover-form__field">
          <label>Source*</label>
          <input
            type="text"
            placeholder="e.g. cover, an ally, Premonition"
            value={modSource.value}
            onInput={(e) => { modSource.value = (e.target as HTMLInputElement).value; }}
          />
        </div>
        {!isAdvDis && modType.value !== 'hold' && (
          <div class="vamp-mod-popover-form__field">
            <label>Applies to</label>
            <input
              type="text"
              placeholder="e.g. Influence (or leave blank for all)"
              value={modTarget.value}
              onInput={(e) => { modTarget.value = (e.target as HTMLInputElement).value; }}
            />
          </div>
        )}
        {supportsStatGate && (
          <div class="vamp-mod-popover-form__field vamp-mod-popover-form__field--stats">
            <label>Which stat(s)?</label>
            <div class="vamp-mod-popover-form__stats">
              {STAT_NAMES.map(s => (
                <button
                  key={s}
                  type="button"
                  class={`vamp-mod-stat-pill ${modStats.value.includes(s) ? 'vamp-mod-stat-pill--active' : ''}`}
                  onClick={() => toggleStat(s)}
                  title={`Only apply to ${s} rolls`}
                >{s}</button>
              ))}
            </div>
          </div>
        )}
        {modType.value === 'hold' && (
          <div class="vamp-mod-popover-form__field">
            <label>Spend on</label>
            <input
              type="text"
              placeholder="e.g. ask a question"
              value={modSpendOn.value}
              onInput={(e) => { modSpendOn.value = (e.target as HTMLInputElement).value; }}
            />
          </div>
        )}
      </div>

      <div class="vamp-mod-popover-form__actions">
        <button class="vamp-mod-popover-form__cancel" onClick={onClose}>Cancel</button>
        <button
          class="vamp-mod-popover-form__create"
          onClick={handleCreate}
          disabled={!modSource.value.trim()}
        >Add</button>
      </div>
    </div>
  );
}

function ModifierPopover({ onClose, initialShowAdd }: { onClose: () => void; initialShowAdd?: boolean }) {
  const mods = character.value.modifiers;
  const showAddForm = useSignal(initialShowAdd ?? false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const numberMods = mods.filter(m => m.type === 'forward' || m.type === 'ongoing');
  const diceModeMods = mods.filter(m => m.type === 'advantage' || m.type === 'disadvantage');
  const holdMods = mods.filter(m => m.type === 'hold');

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        const bar = (e.target as HTMLElement).closest('.vamp-mod-bar');
        if (!bar) onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div class="vamp-mod-popover" ref={popoverRef}>
      {numberMods.length > 0 && (
        <div class="vamp-mod-popover-section">
          <div class="vamp-mod-popover-section__label">Forward/Ongoing</div>
          {numberMods.map(m => <PopoverModifierRow key={m.id} mod={m} />)}
        </div>
      )}

      {diceModeMods.length > 0 && (
        <div class="vamp-mod-popover-section">
          <div class="vamp-mod-popover-section__label">Advantage/Disadvantage</div>
          {diceModeMods.map(m => <PopoverModifierRow key={m.id} mod={m} />)}
        </div>
      )}

      {holdMods.length > 0 && (
        <div class="vamp-mod-popover-section">
          <div class="vamp-mod-popover-section__label">Hold</div>
          {holdMods.map(m => <PopoverModifierRow key={m.id} mod={m} />)}
        </div>
      )}

      {mods.length === 0 && !showAddForm.value && (
        <div class="vamp-mod-popover-empty">No attributed modifiers</div>
      )}

      {showAddForm.value ? (
        <AddModifierForm onClose={() => { showAddForm.value = false; }} />
      ) : (
        <button
          class="vamp-mod-popover-add-btn"
          onClick={() => { showAddForm.value = true; }}
        >+ Add Modifier</button>
      )}
    </div>
  );
}

export function ModifierBar() {
  const popoverOpen = useSignal(false);
  const addMode = useSignal(false);

  function handleBarClick() {
    addMode.value = false;
    popoverOpen.value = !popoverOpen.value;
  }

  function handleAddClick() {
    addMode.value = true;
    popoverOpen.value = true;
  }

  function handleClose() {
    popoverOpen.value = false;
    addMode.value = false;
  }

  return (
    <>
      <button
        class="vamp-mod-add-btn"
        onClick={handleAddClick}
        aria-label="Add modifier"
        title="Add modifier"
      >+</button>
      <div class="vamp-mod-panel">
        <div class="vamp-mod-bar" onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          handleBarClick();
        }}>
          <NumbersZone />
          <div class="vamp-mod-divider" />
          <HoldZone />
          <div class="vamp-mod-divider" />
          <DiceModeZone />
          <div class="vamp-mod-divider" />
          <TotalZone onBarClick={() => handleBarClick()} />
        </div>
        {popoverOpen.value && <ModifierPopover onClose={handleClose} initialShowAdd={addMode.value} />}
      </div>
    </>
  );
}
