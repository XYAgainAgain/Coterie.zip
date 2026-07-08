import { useSignal } from '@preact/signals';
import { coterieState } from '../../../state/coterie';
import { activeCoterie } from '../../../state/persistence';
import { gameData } from '../../../state/derived';
import { ItemEditor, prefillTagsForType, type ItemStore } from '../../PossessionsTab';
import { stAddHavenItem, stUpdateHavenItem, stRemoveHavenItem, stAdjustHavenItemQty, stGiftHavenItem } from '../../../state/stHaven';
import { HAVEN_ID, RANGE_BANDS } from '../../../data/itemTags';
import { ITEM_TYPES, type Item, type ItemType, type ItemTag } from '../../../data/types';
import type { StRosterEntry } from '../../../state/stRosterLogic';

/* ST edits route through the transactional Haven writers, which toast the deploy notice on
   the interim permission-denied. Same editor UI the player uses, different store. */
const HAVEN_ST_STORE: ItemStore = {
  update: (id, patch) => { void stUpdateHavenItem(id, patch); },
  remove: (id) => { void stRemoveHavenItem(id); },
};

function newHavenItem(name: string, type: ItemType, tags: Item['tags'], isContainer: boolean): Item {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    type,
    tags,
    description: '',
    qty: 1,
    equipped: false,
    isContainer,
    containerId: HAVEN_ID,
  };
}

/* Full Possessions-style add flow: type-driven prompts (Weapon → N-Harm + Range, Wearable →
   Armor/Container) pre-fill the starter tags, same as the player's QuickAdd. */
function AddHavenForm() {
  const open = useSignal(false);
  const name = useSignal('');
  const type = useSignal<ItemType | ''>('');
  const harm = useSignal('');
  const rMin = useSignal('Close');
  const rMax = useSignal('Close');
  const armor = useSignal<boolean | null>(null);
  const armorN = useSignal('');
  const container = useSignal<boolean | null>(null);

  const t = type.value;
  const valid = !!name.value.trim() && !!t
    && (t !== 'Weapon' || (harm.value !== '' && Number(harm.value) >= 0))
    && (t !== 'Wearable' || armor.value !== true || (armorN.value !== '' && Number(armorN.value) >= 1));

  function reset() {
    open.value = false; name.value = ''; type.value = ''; harm.value = '';
    rMin.value = 'Close'; rMax.value = 'Close'; armor.value = null; armorN.value = ''; container.value = null;
  }

  function commit() {
    if (!valid) return;
    const { tags, isContainer } = prefillTagsForType(t as ItemType, {
      harm: harm.value, rMin: rMin.value, rMax: rMax.value, armor: armor.value, armorN: armorN.value, container: container.value,
    });
    void stAddHavenItem(newHavenItem(name.value, t as ItemType, tags, isContainer));
    reset();
  }

  if (!open.value) {
    return <button class="vamp-st-haven__add" onClick={() => { open.value = true; }}>+&nbsp;&nbsp;Stock the Haven…</button>;
  }

  return (
    <div class="vamp-st-haven__form">
      <div class="vamp-st-haven__form-row">
        <input
          class="vamp-input vamp-st-haven__name" placeholder="What are you leaving them?" value={name.value}
          ref={(el) => el?.focus()}
          onInput={(e) => { name.value = (e.target as HTMLInputElement).value; }}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') reset(); }}
        />
        <select
          class="vamp-input vamp-st-haven__type" value={type.value}
          onChange={(e) => { type.value = (e.target as HTMLSelectElement).value as ItemType; harm.value = ''; armor.value = null; armorN.value = ''; container.value = null; }}
        >
          <option value="">Type…</option>
          {ITEM_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
        </select>
      </div>

      {t === 'Weapon' && (
        <div class="vamp-st-haven__req">
          <label class="vamp-st-haven__field"><input type="number" min="0" value={harm.value} onInput={(e) => { harm.value = (e.target as HTMLInputElement).value; }} /><span>-Harm</span></label>
          <label class="vamp-st-haven__field">
            <select value={rMin.value} onChange={(e) => { const mn = (e.target as HTMLSelectElement).value; rMin.value = mn; if (RANGE_BANDS.indexOf(rMax.value) < RANGE_BANDS.indexOf(mn)) rMax.value = mn; }}>{RANGE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}</select>
            <span>–</span>
            <select value={rMax.value} onChange={(e) => { rMax.value = (e.target as HTMLSelectElement).value; }}>{RANGE_BANDS.slice(RANGE_BANDS.indexOf(rMin.value)).map(b => <option key={b} value={b}>{b}</option>)}</select>
            <span>Range</span>
          </label>
        </div>
      )}

      {t === 'Wearable' && (
        <div class="vamp-st-haven__req">
          <span class="vamp-st-haven__q">Provides Armor?</span>
          <button class={`vamp-st-btn ${armor.value === true ? 'vamp-st-btn--select' : ''}`} onClick={() => { armor.value = true; }}>Yes</button>
          <button class={`vamp-st-btn ${armor.value === false ? 'vamp-st-btn--select' : ''}`} onClick={() => { armor.value = false; armorN.value = ''; }}>No</button>
          {armor.value === true && <label class="vamp-st-haven__field"><input type="number" min="1" value={armorN.value} onInput={(e) => { armorN.value = (e.target as HTMLInputElement).value; }} /><span>-Armor</span></label>}
        </div>
      )}

      {(t === 'Wearable' || t === 'Miscellaneous') && (
        <div class="vamp-st-haven__req">
          <span class="vamp-st-haven__q">Is it a container?</span>
          <button class={`vamp-st-btn ${container.value === true ? 'vamp-st-btn--select' : ''}`} onClick={() => { container.value = true; }}>Yes</button>
          <button class={`vamp-st-btn ${container.value === false ? 'vamp-st-btn--select' : ''}`} onClick={() => { container.value = false; }}>No</button>
        </div>
      )}

      <div class="vamp-st-haven__form-foot">
        <button class="vamp-st-btn vamp-st-btn--primary" disabled={!valid} onClick={commit}>Add</button>
        <button class="vamp-st-btn" onClick={reset}>Cancel</button>
      </div>
    </div>
  );
}

/* Mirrors the sheet's "Move to…" but ST-sourced: sends the item to a consented member's gift
   queue (stGiftHavenItem removes it from the Haven in the same transaction). */
function SendControl({ item, members }: { item: Item; members: StRosterEntry[] }) {
  const open = useSignal(false);
  if (members.length === 0) return null;
  return (
    <span class="vamp-st-haven__send">
      <button class="vamp-st-btn" onClick={() => { open.value = !open.value; }}>Send to…</button>
      {open.value && (
        <div class="vamp-st-haven__send-menu">
          {members.map(m => (
            <button
              key={m.characterId} class="vamp-st-haven__send-item"
              onClick={() => { void stGiftHavenItem(item.id, m.characterId, m.name); open.value = false; }}
            >{m.name || 'Unnamed'}</button>
          ))}
        </div>
      )}
    </span>
  );
}

function HavenItemRow({ item, catalog, members }: { item: Item; catalog: Map<string, ItemTag>; members: StRosterEntry[] }) {
  const editing = useSignal(false);
  const confirmDel = useSignal(false);
  const childCount = coterieState.value.havenItems.filter(i => i.containerId === item.id).length;

  return (
    <div class={`vamp-st-haven__row ${editing.value ? 'is-open' : ''}`}>
      <div class="vamp-st-haven__line">
        <button class="vamp-st-haven__main" onClick={() => { editing.value = !editing.value; }}>
          <span class="vamp-st-haven__item-name">{item.name || 'Unnamed'}</span>
          <span class="vamp-st-haven__item-type">{item.type}</span>
          {item.qty > 1 && <span class="vamp-st-haven__item-qty">×{item.qty}</span>}
          {childCount > 0 && <span class="vamp-st-haven__item-kids">({childCount})</span>}
        </button>
        <span class="vamp-st-haven__qty">
          <button class="vamp-st-btn" title="Fewer" onClick={() => void stAdjustHavenItemQty(item.id, -1)}>−</button>
          <button class="vamp-st-btn" title="More" onClick={() => void stAdjustHavenItemQty(item.id, 1)}>+</button>
        </span>
        <SendControl item={item} members={members} />
        <button
          class={`vamp-st-btn vamp-st-btn--del ${confirmDel.value ? 'is-danger' : ''}`}
          onMouseLeave={() => { confirmDel.value = false; }}
          onClick={() => { confirmDel.value ? void stRemoveHavenItem(item.id) : (confirmDel.value = true); }}
        >{confirmDel.value ? 'Sure?' : 'Remove'}</button>
      </div>
      {editing.value && (
        <div class="vamp-st-haven__editor">
          <ItemEditor key={item.id} item={item} catalog={catalog} store={HAVEN_ST_STORE} />
        </div>
      )}
    </div>
  );
}

export function HavenTile({ roster }: { roster: StRosterEntry[] }) {
  const inCoterie = !!activeCoterie.value;
  const tags = gameData.value?.itemTags ?? [];
  const catalog = new Map(tags.map(t => [t.name, t] as const));
  const items = coterieState.value.havenItems.filter(i => i.containerId === HAVEN_ID);
  const members = roster.filter(e => e.consented);

  if (!inCoterie) return <p class="vamp-st-tile__empty">No Coterie is loaded.</p>;

  return (
    <div class="vamp-st-haven">
      <AddHavenForm />
      <div class="vamp-st-haven__list">
        {items.length === 0
          ? <p class="vamp-st-tile__empty">The Haven is bare. Leave them something.</p>
          : items.map(it => <HavenItemRow key={it.id} item={it} catalog={catalog} members={members} />)}
      </div>
    </div>
  );
}
