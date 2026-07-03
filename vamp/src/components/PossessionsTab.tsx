import { signal, useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import {
  character, addItem, updateItem, removeItem, moveItem, setItemContainer, toggleEquip,
} from '../state/character';
import { coterieState } from '../state/coterie';
import { activeCoterie, activeCharacterId, giveItem, relocate, depositToHaven, updateHavenItem, removeHavenItem, adjustHavenItemQty } from '../state/persistence';
import { gameData } from '../state/derived';
import { viewingOtherSheet } from '../state/ui';
import { forceToast } from '../state/toasts';
import {
  orderTags, tagDisplay, canEquip, isEquippableType,
  TEMPLATE_TAGS, RANGE_TAG, CUSTOM_TAG, RANGE_BANDS, rangeParam, STASH_ID, HAVEN_ID,
} from '../data/itemTags';
import { isContainerItem, CONTAINER_TAG, isDescendant, collectSubtree } from '../data/itemTree';
import { ITEM_TYPES, type Item, type TagRef, type ItemType, type ItemTag } from '../data/types';
import { debounce } from '../utils/debounce';
import { moveToast, takeToast } from '../data/gifts';
import { Tooltip } from './Tooltip';
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  useSensor, useSensors, PointerSensor, pointerWithin, rectIntersection,
  type DragEndEvent, type DragStartEvent, type CollisionDetection,
} from '@dnd-kit/core';

/* Rows that are expanded to show their body + children. A Set, not one id, so a nested
   path (room → bag → contents) can stay open at once; reset on mount. */
const expandedIds = signal<Set<string>>(new Set());
/* The one row whose inline editor is open (only ever one at a time). */
const editingId = signal<string | null>(null);
/* Flips true once the open editor changes anything, so the edit tick reads as "saved". */
const editDirty = signal(false);
/* Which row menu is open, keyed "move:id" / "give:id" / "bag:id"; one at a time. */
const openMenu = signal<string | null>(null);
/* The item id being dragged, for the drag-overlay ghost. */
const draggingId = signal<string | null>(null);

function isExpanded(id: string): boolean { return expandedIds.value.has(id); }
function setExpanded(id: string, on: boolean): void {
  const next = new Set(expandedIds.value);
  if (on) next.add(id); else next.delete(id);
  expandedIds.value = next;
}

/* The mutators a row edits through: owned items hit the character signal (instant),
   Haven items hit the coterie transaction. Same editor UI, different store. */
interface ItemStore {
  update: (id: string, patch: Partial<Omit<Item, 'id'>>) => void;
  remove: (id: string) => void;
}
const CHAR_STORE: ItemStore = { update: updateItem, remove: removeItem };
const HAVEN_STORE: ItemStore = { update: updateHavenItem, remove: removeHavenItem };

type TagRole = 'harm' | 'range' | 'armor' | 'res' | 'container' | 'custom' | 'plain';

function tagRole(base: string): TagRole {
  if (base === 'N-Harm') return 'harm';
  if (base === RANGE_TAG) return 'range';
  if (base === 'N-Armor' || base === 'Ignore-Armor' || base === 'Ignore-BP-Armor') return 'armor';
  if (base === 'N-Use' || base === 'N-Charge' || base === 'Recharge-X') return 'res';
  if (base === CONTAINER_TAG) return 'container';
  if (base === CUSTOM_TAG) return 'custom';
  return 'plain';
}

/* The item's dominant role for its zone chip; charges outrank Harm (locked ruling). */
function itemRole(it: Item): TagRole {
  const has = (b: string) => it.tags.some(t => t.base === b);
  if (has('N-Use') || has('N-Charge') || has('Recharge-X')) return 'res';
  if (has('N-Harm')) return 'harm';
  if (has('N-Armor') || has('Ignore-Armor') || has('Ignore-BP-Armor')) return 'armor';
  if (isContainerItem(it)) return 'container';
  if (has(RANGE_TAG)) return 'range';
  return 'plain';
}

function plainEffect(s: string): string {
  return s.replace(/\*\*\*|\*\*|\*|`/g, '');
}

function effectFor(ref: TagRef, catalog: Map<string, ItemTag>): string {
  if (ref.base === CUSTOM_TAG) return ref.custom?.description?.trim() || 'Custom tag; ask your Storyteller.';
  if (ref.base === RANGE_TAG) return 'The Range band at which this item operates.';
  const tag = catalog.get(ref.base);
  return tag ? tag.effect : 'Custom tag; ask your Storyteller.';
}

/* Key chips by content + index so a removal remounts the node, clearing a stuck tooltip. */
const tagKey = (t: TagRef, i: number) => `${t.base}|${t.param ?? ''}|${t.custom?.label ?? ''}|${i}`;

/* Template tags are singletons (one per base); plain/custom stack. Adding/removing the
   Container tag mirrors the isContainer flag the move/nest rules key off. */
function commitTag(store: ItemStore, item: Item, ref: TagRef) {
  const isTemplate = ref.base in TEMPLATE_TAGS;
  const base = isTemplate ? item.tags.filter(t => t.base !== ref.base) : item.tags;
  store.update(item.id, { tags: [...base, ref] });
  if (ref.base === CONTAINER_TAG && store === CHAR_STORE) setItemContainer(item.id, true);
  editDirty.value = true;
}

function removeTagAt(store: ItemStore, item: Item, index: number) {
  const removed = item.tags[index];
  store.update(item.id, { tags: item.tags.filter((_, i) => i !== index) });
  if (removed?.base === CONTAINER_TAG && store === CHAR_STORE) setItemContainer(item.id, false);
  editDirty.value = true;
}

function zoneLabel(target: string | null): string {
  if (target === null) return 'On You';
  if (target === STASH_ID) return 'the Stash';
  if (target === HAVEN_ID) return 'the Haven';
  const it = character.value.items.find(i => i.id === target) ?? coterieState.value.havenItems.find(i => i.id === target);
  return it ? (it.name || 'the bag') : 'the bag';
}

/* Toasts fire only on a root-box change, so each move end resolves to its owning box. */
function rootZone(target: string | null): 'you' | 'stash' | 'haven' {
  const haven = coterieState.value.havenItems;
  const charItems = character.value.items;
  let cur = target;
  const seen = new Set<string>();
  while (cur !== null && cur !== STASH_ID && cur !== HAVEN_ID) {
    if (seen.has(cur)) break; // defends against a corrupt containerId cycle
    seen.add(cur);
    const inHaven = haven.some(i => i.id === cur);
    const parent = (inHaven ? haven : charItems).find(i => i.id === cur);
    if (!parent) return inHaven ? 'haven' : 'you';
    cur = parent.containerId;
  }
  return cur === STASH_ID ? 'stash' : cur === HAVEN_ID ? 'haven' : 'you';
}

/* Always-on debounced field; EditableTextField is dblclick-gated, wrong inside an open
   editor. Keyed by item id at the call site, so draft state is fresh per edit session. */
function DebouncedInput({ value, onSave, placeholder, multiline, className }: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}) {
  const draft = useSignal(value);
  const save = useRef(debounce(onSave, 3000)).current;
  useEffect(() => () => save.flush(), [save]);
  const onInput = (e: Event) => {
    const text = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
    draft.value = text;
    save(text);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { save.cancel(); draft.value = value; (e.target as HTMLElement).blur(); }
    else if (e.key === 'Enter' && !multiline) save.flush();
  };
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Tag
      class={className}
      value={draft.value}
      placeholder={placeholder}
      onInput={onInput}
      onBlur={() => save.flush()}
      onKeyDown={onKeyDown}
      {...(multiline ? { rows: 2 } : {})}
    />
  );
}

/* The qty number between the steppers; double-click to type an exact amount instead of
   clicking +/- hundreds of times. Commits a whole number >= 1 on Enter/blur. */
function EditableQty({ qty, onSet }: { qty: number; onSet: (n: number) => void }) {
  const editing = useSignal(false);
  const draft = useSignal('');
  const focused = useRef(false);

  if (!editing.value) {
    return (
      <span
        class="vamp-poss-qty__val" title="Double-click to type an amount"
        onDblClick={() => { draft.value = String(qty); focused.current = false; editing.value = true; }}
      >{qty}</span>
    );
  }

  const commit = () => {
    if (!editing.value) return; // Escape already closed us; unmount blur must not re-commit
    const n = Math.floor(Number(draft.value));
    if (Number.isFinite(n) && n >= 1) onSet(n);
    editing.value = false;
  };
  return (
    <input
      class="vamp-poss-qty__input" type="number" min="1" inputMode="numeric" value={draft.value}
      ref={(el) => { if (el && !focused.current) { focused.current = true; el.focus(); el.select(); } }}
      onInput={(e) => { draft.value = (e.target as HTMLInputElement).value; }}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') editing.value = false; }}
      onBlur={commit}
    />
  );
}

function TagChip({ refTag, catalog, onRemove }: {
  refTag: TagRef;
  catalog: Map<string, ItemTag>;
  onRemove?: () => void;
}) {
  return (
    <Tooltip content={effectFor(refTag, catalog)} userContent={refTag.base === CUSTOM_TAG} anchorClass={`vamp-poss-chip vamp-poss-chip--${tagRole(refTag.base)}`}>
      <span class="vamp-poss-chip__label">{tagDisplay(refTag)}</span>
      {onRemove && (
        <button
          class="vamp-poss-chip__x" title="Remove tag" aria-label="Remove tag"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >×</button>
      )}
    </Tooltip>
  );
}

/* Combobox tag picker: search/browse the catalog, then fill a template param (number,
   Range band pair, or free text) or author a custom tag before it commits. */
function TagPicker({ item, catalog, store }: { item: Item; catalog: Map<string, ItemTag>; store: ItemStore }) {
  const search = useSignal('');
  const step = useSignal<'list' | 'num' | 'range' | 'custom'>('list');
  const base = useSignal('');
  const val = useSignal('');
  const rMin = useSignal('Close');
  const rMax = useSignal('Close');
  const customLabel = useSignal('');
  const customDesc = useSignal('');
  const showAll = useSignal(false);

  const owned = new Set(item.tags.map(t => t.base));
  const typeCat = item.type === 'Miscellaneous' ? 'Misc.' : `${item.type}s`;
  const relevant = (t: ItemTag) => t.categories.includes(typeCat) || t.categories.includes('All');

  function backToList() { step.value = 'list'; base.value = ''; val.value = ''; }
  function resetAll() { search.value = ''; backToList(); customLabel.value = ''; customDesc.value = ''; showAll.value = false; }

  function pick(name: string) {
    const meta = TEMPLATE_TAGS[name];
    if (name === RANGE_TAG) { base.value = name; rMin.value = 'Close'; rMax.value = 'Close'; step.value = 'range'; return; }
    if (meta && meta.param !== 'none') { base.value = name; val.value = ''; step.value = meta.param === 'text' ? 'custom' : 'num'; }
    else { commitTag(store, item, { base: name }); resetAll(); }
  }

  const q = search.value.trim().toLowerCase();
  const results = catalog.size === 0 ? [] : [...catalog.values()]
    .filter(t => !owned.has(t.name) && (!q || t.name.toLowerCase().includes(q)))
    .sort((a, b) => Number(relevant(b)) - Number(relevant(a)) || a.name.localeCompare(b.name))
    .slice(0, (showAll.value || q) ? 9999 : 40);

  if (step.value === 'num') {
    const numeric = TEMPLATE_TAGS[base.value]?.param === 'number';
    const commit = () => { if (val.value.trim() && (!numeric || Number(val.value) >= 0)) { commitTag(store, item, { base: base.value, param: val.value.trim() }); resetAll(); } };
    return (
      <div class="vamp-poss-picker vamp-poss-picker--param">
        <span class="vamp-poss-picker__prefix">{base.value.startsWith('N-') ? '' : base.value}</span>
        <input
          class="vamp-poss-picker__num" type={numeric ? 'number' : 'text'} min={numeric ? '0' : undefined}
          value={val.value} ref={(el) => el?.focus()}
          onInput={(e) => { val.value = (e.target as HTMLInputElement).value; }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        />
        <span class="vamp-poss-picker__suffix">{base.value.startsWith('N-') ? `-${base.value.slice(2)}` : ''}</span>
        <button class="vamp-poss-btn vamp-poss-btn--primary" disabled={!val.value.trim()} onClick={commit}>Apply</button>
        <button class="vamp-poss-btn" onClick={backToList}>Back</button>
      </div>
    );
  }

  if (step.value === 'range') {
    const maxOpts = RANGE_BANDS.slice(RANGE_BANDS.indexOf(rMin.value));
    return (
      <div class="vamp-poss-picker vamp-poss-picker--param">
        <select
          class="vamp-poss-picker__band" value={rMin.value}
          onChange={(e) => {
            const mn = (e.target as HTMLSelectElement).value;
            rMin.value = mn;
            if (RANGE_BANDS.indexOf(rMax.value) < RANGE_BANDS.indexOf(mn)) rMax.value = mn;
          }}
        >{RANGE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}</select>
        <span class="vamp-poss-picker__dash">–</span>
        <select
          class="vamp-poss-picker__band" value={rMax.value}
          onChange={(e) => { rMax.value = (e.target as HTMLSelectElement).value; }}
        >{maxOpts.map(b => <option key={b} value={b}>{b}</option>)}</select>
        <span class="vamp-poss-picker__suffix">Range</span>
        <button class="vamp-poss-btn vamp-poss-btn--primary" onClick={() => { commitTag(store, item, { base: RANGE_TAG, param: rangeParam(rMin.value, rMax.value) }); resetAll(); }}>Apply</button>
        <button class="vamp-poss-btn" onClick={backToList}>Back</button>
      </div>
    );
  }

  if (step.value === 'custom') {
    const isTemplate = base.value && base.value !== CUSTOM_TAG;
    const commit = () => {
      if (isTemplate) { if (val.value.trim()) { commitTag(store, item, { base: base.value, param: val.value.trim() }); resetAll(); } return; }
      if (customLabel.value.trim()) { commitTag(store, item, { base: CUSTOM_TAG, custom: { label: customLabel.value.trim(), description: customDesc.value.trim() } }); resetAll(); }
    };
    if (isTemplate) {
      return (
        <div class="vamp-poss-picker vamp-poss-picker--param">
          <span class="vamp-poss-picker__prefix">{base.value.replace('-X', '')}</span>
          <input
            class="vamp-poss-picker__num" value={val.value} ref={(el) => el?.focus()}
            placeholder={base.value === 'Recharge-X' ? 'Dawn / Scene' : 'value'}
            onInput={(e) => { val.value = (e.target as HTMLInputElement).value; }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          />
          <button class="vamp-poss-btn vamp-poss-btn--primary" disabled={!val.value.trim()} onClick={commit}>Apply</button>
          <button class="vamp-poss-btn" onClick={backToList}>Back</button>
        </div>
      );
    }
    return (
      <div class="vamp-poss-picker vamp-poss-picker--custom">
        <input
          class="vamp-poss-picker__input" placeholder="Tag label" value={customLabel.value} ref={(el) => el?.focus()}
          onInput={(e) => { customLabel.value = (e.target as HTMLInputElement).value; }}
        />
        <input
          class="vamp-poss-picker__input" placeholder="What it does (tooltip, optional)" value={customDesc.value}
          onInput={(e) => { customDesc.value = (e.target as HTMLInputElement).value; }}
        />
        <button class="vamp-poss-btn vamp-poss-btn--primary" disabled={!customLabel.value.trim()} onClick={commit}>Add tag</button>
        <button class="vamp-poss-btn" onClick={backToList}>Back</button>
      </div>
    );
  }

  return (
    <div class="vamp-poss-picker">
      <input
        class="vamp-poss-picker__input" placeholder="Type to filter, or browse below…" value={search.value} ref={(el) => el?.focus()}
        onInput={(e) => { search.value = (e.target as HTMLInputElement).value; }}
      />
      <div class="vamp-poss-picker__results">
        {q && (
          <button class="vamp-poss-picker__row vamp-poss-picker__row--custom" onClick={() => { customLabel.value = search.value.trim(); customDesc.value = ''; base.value = ''; step.value = 'custom'; }}>
            <span class="vamp-poss-picker__name">Create “{search.value.trim()}”</span>
            <span class="vamp-poss-picker__hint">custom tag</span>
          </button>
        )}
        {results.map(t => (
          <button key={t.name} class="vamp-poss-picker__row" onClick={() => pick(t.name)}>
            <span class="vamp-poss-picker__name">
              <span class={`vamp-poss-picker__dot ${relevant(t) ? 'is-relevant' : ''}`} />{t.name}
            </span>
            <span class="vamp-poss-picker__hint">{plainEffect(t.effect)}</span>
          </button>
        ))}
        {results.length === 0 && q && <div class="vamp-poss-picker__empty">No matches.</div>}
        {!showAll.value && !q && catalog.size > 40 && (
          <button class="vamp-poss-picker__more" onClick={() => { showAll.value = true; }}>Show all tags ↓</button>
        )}
      </div>
    </div>
  );
}

function ItemEditor({ item, catalog, store }: { item: Item; catalog: Map<string, ItemTag>; store: ItemStore }) {
  const adding = useSignal(false);
  const ordered = orderTags(item.tags);
  const chips = [...ordered.leading, ...ordered.middle, ...ordered.trailing];
  return (
    <div class="vamp-poss-edit">
      <div class="vamp-poss-edit__row">
        <DebouncedInput
          className="vamp-poss-edit__name" value={item.name} placeholder="Item name"
          onSave={(v) => { store.update(item.id, { name: v }); editDirty.value = true; }}
        />
        <select
          class="vamp-poss-edit__type" value={item.type}
          onChange={(e) => { store.update(item.id, { type: (e.target as HTMLSelectElement).value as ItemType }); editDirty.value = true; }}
        >{ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
      </div>

      <div class="vamp-poss-edit__tags">
        {chips.map((t) => {
          const idx = item.tags.indexOf(t);
          return <TagChip key={tagKey(t, idx)} refTag={t} catalog={catalog} onRemove={() => removeTagAt(store, item, idx)} />;
        })}
        {item.tags.length === 0 && <span class="vamp-poss-edit__notags">No tags yet. Tags are the mechanics of the item.</span>}
        <button class="vamp-poss-edit__tagbtn" onClick={() => { adding.value = !adding.value; }}>{adding.value ? 'Done Tagging' : '+ Tag'}</button>
      </div>

      {adding.value && (
        <div class="vamp-poss-edit__picker">
          <TagPicker item={item} catalog={catalog} store={store} />
        </div>
      )}

      <DebouncedInput
        className="vamp-poss-edit__desc" value={item.description} placeholder="Description (flavor only, never rules)…" multiline
        onSave={(v) => { store.update(item.id, { description: v }); editDirty.value = true; }}
      />
    </div>
  );
}

interface MoveTarget { label: string; target: string | null; disabled: boolean; }

/* Move destinations across both stores, minus the item itself and its own subtree (you
   can't nest a container into its own contents). Cross-store targets can't cycle. */
function moveTargetsFor(item: Item, charItems: Item[], havenItems: Item[], inCoterie: boolean, stashLabel: string): MoveTarget[] {
  const pool = havenItems.some(h => h.id === item.id) ? havenItems : charItems;
  const allowed = (cid: string) => cid !== item.id && !isDescendant(pool, item.id, cid);

  const out: MoveTarget[] = [
    { label: 'On You', target: null, disabled: item.containerId === null },
    { label: stashLabel, target: STASH_ID, disabled: item.containerId === STASH_ID },
  ];
  if (inCoterie) out.push({ label: 'Haven', target: HAVEN_ID, disabled: item.containerId === HAVEN_ID });
  for (const c of charItems) {
    if (isContainerItem(c) && allowed(c.id)) out.push({ label: `Into: ${c.name || 'Bag'}`, target: c.id, disabled: item.containerId === c.id });
  }
  if (inCoterie) {
    for (const c of havenItems) {
      if (isContainerItem(c) && allowed(c.id)) out.push({ label: `Into Haven: ${c.name || 'Room'}`, target: c.id, disabled: item.containerId === c.id });
    }
  }
  return out;
}

/* Move an item to a zone/container through the shared router, with a toast. Toasts only
   after the move lands; failed Haven transactions surface their own warning. */
async function performMove(item: Item, target: string | null) {
  if (target === item.containerId) return;
  const crossedBox = rootZone(item.containerId) !== rootZone(target);
  if (await relocate(item.id, target) && crossedBox) {
    forceToast(target === null ? takeToast(item.name) : moveToast(item.name, zoneLabel(target)), 'info');
  }
}

function MoveMenu({ item, targets }: { item: Item; targets: MoveTarget[] }) {
  const key = `move:${item.id}`;
  const open = openMenu.value === key;
  return (
    <span class="vamp-poss-menu">
      <button class="vamp-poss-btn" onClick={() => { openMenu.value = open ? null : key; }}>Move to…</button>
      {open && (
        <div class="vamp-poss-menu__list">
          {targets.map(t => (
            <button
              key={t.target ?? 'loose'} class="vamp-poss-menu__item" disabled={t.disabled}
              onClick={() => { if (!t.disabled) { performMove(item, t.target); openMenu.value = null; } }}
            >{t.label}</button>
          ))}
        </div>
      )}
    </span>
  );
}

/* Hand an item to a Coterie-mate; partial stacks via the qty stepper. giveItem owns its
   own toast + payload sanitizing, so we just call it. */
function GiveControl({ item }: { item: Item }) {
  const key = `give:${item.id}`;
  const open = openMenu.value === key;
  const qty = useSignal(1);
  const members = coterieState.value.members.filter(m => m.characterId !== activeCharacterId.value);
  if (!activeCoterie.value || members.length === 0) return null;
  return (
    <span class="vamp-poss-menu">
      <button class="vamp-poss-btn" onClick={() => { openMenu.value = open ? null : key; qty.value = 1; }}>Give to…</button>
      {open && (
        <div class="vamp-poss-menu__list">
          {item.qty > 1 && (
            <div class="vamp-poss-give__qty">
              <button onClick={() => { qty.value = Math.max(1, qty.value - 1); }}>−</button>
              <span>{qty.value} of {item.qty}</span>
              <button onClick={() => { qty.value = Math.min(item.qty, qty.value + 1); }}>+</button>
            </div>
          )}
          {members.map(m => (
            <button key={m.characterId} class="vamp-poss-menu__item" onClick={() => { giveItem(item.id, m.characterId, qty.value); openMenu.value = null; }}>{m.name || 'Unnamed'}</button>
          ))}
        </div>
      )}
    </span>
  );
}

/* Deleting a bag never destroys its contents: prompt for a safe bucket first (locked
   ruling 2026-06-13). Empty bags and loose items use a plain two-click confirm. */
function DeleteControl({ item, contents, inCoterie }: { item: Item; contents: Item[]; inCoterie: boolean }) {
  const confirm = useSignal(false);
  const key = `bag:${item.id}`;
  const bagOpen = openMenu.value === key;
  /* Count the whole subtree, not just direct children: nested contents ride along too. */
  const moving = collectSubtree(character.value.items, item.id).length - 1;

  /* Haven deposits are awaited one by one; if any fails the bag survives so the leftover
     children still have a parent (the deposit's own warning toast covers the failure). */
  async function redistribute(target: string | null) {
    openMenu.value = null;
    let allMoved = true;
    for (const c of contents) {
      if (target === HAVEN_ID) allMoved = (await depositToHaven(c.id)) && allMoved;
      else moveItem(c.id, target);
    }
    if (!allMoved) return;
    removeItem(item.id);
    forceToast(`Deleted ${item.name || 'bag'}; contents sent to ${zoneLabel(target)}.`, 'info');
  }

  if (isContainerItem(item) && contents.length > 0) {
    return (
      <span class="vamp-poss-menu">
        <button class="vamp-poss-btn vamp-poss-btn--del" onClick={() => { openMenu.value = bagOpen ? null : key; }}>Delete bag…</button>
        {bagOpen && (
          <div class="vamp-poss-menu__list">
            <div class="vamp-poss-menu__note">Send {moving} item{moving === 1 ? '' : 's'} to:</div>
            <button class="vamp-poss-menu__item" onClick={() => redistribute(null)}>On You</button>
            <button class="vamp-poss-menu__item" onClick={() => redistribute(STASH_ID)}>Stash</button>
            {inCoterie && <button class="vamp-poss-menu__item" onClick={() => redistribute(HAVEN_ID)}>Haven</button>}
          </div>
        )}
      </span>
    );
  }

  return (
    <button
      class={`vamp-poss-btn vamp-poss-btn--del ${confirm.value ? 'vamp-poss-btn--danger' : ''}`}
      onMouseLeave={() => { confirm.value = false; }}
      onClick={() => { confirm.value ? removeItem(item.id) : (confirm.value = true); }}
    >{confirm.value ? 'Sure?' : 'Delete'}</button>
  );
}

/* Toggle a row's expand (view) state; clicking the open editor's row collapses to view. */
function toggleRow(id: string) {
  if (isExpanded(id) && editingId.value !== id) setExpanded(id, false);
  else { setExpanded(id, true); editingId.value = null; }
}

/* Toggle a row's inline editor; the ✓ closes the row entirely (matches the old flow). */
function toggleEditRow(id: string) {
  if (editingId.value === id) { editingId.value = null; setExpanded(id, false); }
  else { editingId.value = id; setExpanded(id, true); editDirty.value = false; }
}

function ItemRow({ item, allItems, havenItems, catalog, inCoterie, stashLabel, readOnly, depth = 0 }: {
  item: Item;
  allItems: Item[];
  havenItems: Item[];
  catalog: Map<string, ItemTag>;
  inCoterie: boolean;
  stashLabel: string;
  readOnly: boolean;
  depth?: number;
}) {
  const expanded = isExpanded(item.id);
  const editing = editingId.value === item.id;
  const ordered = orderTags(item.tags);
  const chips = [...ordered.leading, ...ordered.middle, ...ordered.trailing];
  const container = isContainerItem(item);
  const children = container ? allItems.filter(i => i.containerId === item.id) : [];
  const equippable = isEquippableType(item.type);
  const equipTip = !canEquip(item)
    ? (equippable ? "Can't equip from storage; carry it first" : "This type can't be equipped")
    : (item.equipped ? 'Equipped (click to unequip)' : 'Click to equip');

  const drag = useDraggable({ id: `row:${item.id}`, disabled: readOnly });
  const drop = useDroppable({ id: `crow:${item.id}`, disabled: !container });
  const setRef = (node: HTMLElement | null) => { drag.setNodeRef(node); drop.setNodeRef(node); };

  return (
    <div
      ref={setRef}
      class={`vamp-poss-row ${expanded ? 'is-open' : ''} ${item.equipped ? 'is-equipped' : ''} ${drag.isDragging ? 'is-dragging' : ''} ${drop.isOver ? 'is-drop-over' : ''}`}
      style={depth ? { '--poss-depth': String(depth) } : undefined}
    >
      <div class="vamp-poss-row__line">
        {!readOnly && <span class="vamp-poss-row__grip" title="Drag to move" {...drag.listeners}>⋮⋮</span>}
        {!readOnly && (
          <button
            class={`vamp-poss-row__pip ${!canEquip(item) ? 'is-none' : ''} ${item.equipped ? 'is-on' : ''}`}
            title={equipTip} aria-label={equipTip} disabled={!canEquip(item)}
            onClick={(e) => { e.stopPropagation(); toggleEquip(item.id); }}
          />
        )}
        <button class="vamp-poss-row__main" onClick={() => toggleRow(item.id)}>
          <span class="vamp-poss-row__name">{item.name || 'Unnamed'}</span>
          {item.qty > 1 && <span class="vamp-poss-row__qty">×{item.qty}</span>}
          <span class="vamp-poss-row__chips">
            {chips.map((t, i) => <TagChip key={tagKey(t, i)} refTag={t} catalog={catalog} />)}
          </span>
        </button>
        {!readOnly && (
          <button
            class={`vamp-poss-row__edit ${editing ? 'is-on' : ''} ${editing && editDirty.value ? 'is-dirty' : ''}`} title={editing ? 'Done editing' : 'Edit'}
            onClick={(e) => { e.stopPropagation(); toggleEditRow(item.id); }}
          >{editing ? '✓' : '✎'}</button>
        )}
      </div>

      {expanded && (
        <div class="vamp-poss-row__body">
          {editing
            ? <ItemEditor key={item.id} item={item} catalog={catalog} store={CHAR_STORE} />
            : (item.description && <p class="vamp-poss-row__desc">{item.description}</p>)}
          {!readOnly && (
            <div class="vamp-poss-row__actions">
              <MoveMenu item={item} targets={moveTargetsFor(item, allItems, havenItems, inCoterie, stashLabel)} />
              <GiveControl item={item} />
              <span class="vamp-poss-qty">
                <button class="vamp-poss-btn" onClick={() => updateItem(item.id, { qty: Math.max(1, item.qty - 1) })}>−</button>
                <EditableQty qty={item.qty} onSet={(n) => updateItem(item.id, { qty: n })} />
                <button class="vamp-poss-btn" onClick={() => updateItem(item.id, { qty: item.qty + 1 })}>+</button>
              </span>
              <DeleteControl item={item} contents={children} inCoterie={inCoterie} />
            </div>
          )}
        </div>
      )}

      {expanded && container && (
        <div class="vamp-poss-row__children">
          {children.length === 0
            ? <p class="vamp-poss-empty">Currently empty. Drag an item into it!</p>
            : children.map(c => (
              <ItemRow key={c.id} item={c} allItems={allItems} havenItems={havenItems} catalog={catalog} inCoterie={inCoterie} stashLabel={stashLabel} readOnly={readOnly} depth={depth + 1} />
            ))}
        </div>
      )}
    </div>
  );
}

function HavenRow({ item, allHaven, charItems, catalog, inCoterie, stashLabel, readOnly, depth = 0 }: {
  item: Item;
  allHaven: Item[];
  charItems: Item[];
  catalog: Map<string, ItemTag>;
  inCoterie: boolean;
  stashLabel: string;
  readOnly: boolean;
  depth?: number;
}) {
  const confirmDel = useSignal(false);
  const expanded = isExpanded(item.id);
  const editing = editingId.value === item.id;
  const ordered = orderTags(item.tags);
  const chips = [...ordered.leading, ...ordered.middle, ...ordered.trailing];
  const container = isContainerItem(item);
  const children = container ? allHaven.filter(i => i.containerId === item.id) : [];

  const drag = useDraggable({ id: `row:${item.id}`, disabled: readOnly });
  const drop = useDroppable({ id: `crow:${item.id}`, disabled: !container });
  const setRef = (node: HTMLElement | null) => { drag.setNodeRef(node); drop.setNodeRef(node); };

  return (
    <div
      ref={setRef}
      class={`vamp-poss-row ${expanded ? 'is-open' : ''} ${drag.isDragging ? 'is-dragging' : ''} ${drop.isOver ? 'is-drop-over' : ''}`}
      style={depth ? { '--poss-depth': String(depth) } : undefined}
    >
      <div class="vamp-poss-row__line">
        {!readOnly && <span class="vamp-poss-row__grip" title="Drag to move" {...drag.listeners}>⋮⋮</span>}
        <button class="vamp-poss-row__main" onClick={() => toggleRow(item.id)}>
          <span class="vamp-poss-row__name">{item.name || 'Unnamed'}</span>
          {item.qty > 1 && <span class="vamp-poss-row__qty">×{item.qty}</span>}
          <span class="vamp-poss-row__chips">
            {chips.map((t, i) => <TagChip key={tagKey(t, i)} refTag={t} catalog={catalog} />)}
          </span>
        </button>
        {!readOnly && <button class="vamp-poss-btn vamp-poss-haven__take" onClick={() => performMove(item, null)}>Take</button>}
        {!readOnly && (
          <button
            class={`vamp-poss-row__edit ${editing ? 'is-on' : ''} ${editing && editDirty.value ? 'is-dirty' : ''}`} title={editing ? 'Done editing' : 'Edit'}
            onClick={(e) => { e.stopPropagation(); toggleEditRow(item.id); }}
          >{editing ? '✓' : '✎'}</button>
        )}
      </div>

      {expanded && (
        <div class="vamp-poss-row__body">
          {editing
            ? <ItemEditor key={item.id} item={item} catalog={catalog} store={HAVEN_STORE} />
            : (item.description && <p class="vamp-poss-row__desc">{item.description}</p>)}
          {!readOnly && (
            <div class="vamp-poss-row__actions">
              <MoveMenu item={item} targets={moveTargetsFor(item, charItems, allHaven, inCoterie, stashLabel)} />
              <span class="vamp-poss-qty">
                <button class="vamp-poss-btn" onClick={() => adjustHavenItemQty(item.id, -1)}>−</button>
                <EditableQty qty={item.qty} onSet={(n) => updateHavenItem(item.id, { qty: n })} />
                <button class="vamp-poss-btn" onClick={() => adjustHavenItemQty(item.id, 1)}>+</button>
              </span>
              <button
                class={`vamp-poss-btn vamp-poss-btn--del ${confirmDel.value ? 'vamp-poss-btn--danger' : ''}`}
                onMouseLeave={() => { confirmDel.value = false; }}
                onClick={() => { confirmDel.value ? removeHavenItem(item.id) : (confirmDel.value = true); }}
              >{confirmDel.value ? 'Sure?' : 'Delete'}</button>
            </div>
          )}
        </div>
      )}

      {expanded && container && (
        <div class="vamp-poss-row__children">
          {children.length === 0
            ? <p class="vamp-poss-empty">Currently empty. Drag an item into it!</p>
            : children.map(c => (
              <HavenRow key={c.id} item={c} allHaven={allHaven} charItems={charItems} catalog={catalog} inCoterie={inCoterie} stashLabel={stashLabel} readOnly={readOnly} depth={depth + 1} />
            ))}
        </div>
      )}
    </div>
  );
}

function ListGroup({ title, icon, count, empty, emptyHint, zoneKey, children }: {
  title: string; icon: string; count: number; empty: boolean; emptyHint: string; zoneKey: string; children: ComponentChildren;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${zoneKey}` });
  return (
    <div ref={setNodeRef} class={`vamp-poss-group ${isOver ? 'is-drop-over' : ''}`}>
      <div class="vamp-poss-group__head">
        <span class="vamp-poss-group__icon" style={{ '--poss-icon': `url(/assets/images/vamp/${icon})` }} />
        <span class="vamp-poss-group__title">{title}</span>
        {count > 0 && <span class="vamp-poss-group__count">{count} item{count === 1 ? '' : 's'}</span>}
        <span class="vamp-poss-group__rule" />
      </div>
      {empty ? <p class="vamp-poss-empty">{emptyHint}</p> : children}
    </div>
  );
}

/* Compact mover chip in the right-column zones; clicking jumps to (expands) its row. */
function ZoneChip({ item, pool }: { item: Item; pool: Item[] }) {
  const kids = isContainerItem(item) ? pool.filter(i => i.containerId === item.id).length : 0;
  const equippedHere = item.equipped && item.containerId === null;
  const drag = useDraggable({ id: `chip:${item.id}`, disabled: viewingOtherSheet.value });
  const drop = useDroppable({ id: `cchip:${item.id}`, disabled: !isContainerItem(item) });
  const setRef = (node: HTMLElement | null) => { drag.setNodeRef(node); drop.setNodeRef(node); };
  return (
    <button
      ref={setRef}
      class={`vamp-poss-zchip vamp-poss-zchip--${itemRole(item)} ${equippedHere ? 'is-equipped' : ''} ${drag.isDragging ? 'is-dragging' : ''} ${drop.isOver ? 'is-drop-over' : ''}`}
      title={item.description || item.name}
      {...drag.listeners}
      onClick={() => { setExpanded(item.id, true); editingId.value = null; }}
    >
      {equippedHere && <span class="vamp-poss-zchip__dot" />}
      {item.name || 'Unnamed'}
      {kids > 0 && <span class="vamp-poss-zchip__count"> ({kids})</span>}
    </button>
  );
}

function ZonePanel({ title, sub, icon, items, zoneKey, pool }: { title: string; sub: string; icon: string; items: Item[]; zoneKey: string; pool: Item[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${zoneKey}` });
  return (
    <div ref={setNodeRef} class={`vamp-poss-zone ${isOver ? 'is-drop-over' : ''}`}>
      <div class="vamp-poss-zone__head">
        <span class="vamp-poss-zone__icon" style={{ '--poss-icon': `url(/assets/images/vamp/${icon})` }} />
        <div class="vamp-poss-zone__labels">
          <span class="vamp-poss-zone__title">{title}</span>
          <span class="vamp-poss-zone__sub">{sub}</span>
        </div>
      </div>
      <div class="vamp-poss-zone__chips">
        {items.length === 0
          ? <span class="vamp-poss-zone__empty">Nothing here yet.</span>
          : items.map(it => <ZoneChip key={it.id} item={it} pool={pool} />)}
      </div>
    </div>
  );
}

function QuickAdd() {
  const open = useSignal(false);
  const name = useSignal('');
  const type = useSignal<ItemType | ''>('');
  const harm = useSignal('');
  const rMin = useSignal('Close');
  const rMax = useSignal('Close');
  const armor = useSignal<boolean | null>(null);
  const armorN = useSignal('');
  const container = useSignal<boolean | null>(null);

  function reset() { open.value = false; name.value = ''; type.value = ''; harm.value = ''; rMin.value = 'Close'; rMax.value = 'Close'; armor.value = null; armorN.value = ''; container.value = null; }

  const t = type.value;
  const valid = !!name.value.trim() && !!t
    && (t !== 'Weapon' || (harm.value !== '' && Number(harm.value) >= 0))
    && (t !== 'Wearable' || armor.value !== true || (armorN.value !== '' && Number(armorN.value) >= 1));

  function commit() {
    if (!valid) return;
    const tags: TagRef[] = [];
    if (t === 'Weapon') { tags.push({ base: 'N-Harm', param: String(harm.value) }); tags.push({ base: RANGE_TAG, param: rangeParam(rMin.value, rMax.value) }); }
    if (t === 'Wearable' && armor.value === true) tags.push({ base: 'N-Armor', param: String(armorN.value) });
    /* Structures and Vehicles obviously hold things, so they're containers by default. */
    const isBag = t === 'Structure' || t === 'Vehicle'
      || ((t === 'Wearable' || t === 'Miscellaneous') && container.value === true);
    if (isBag) tags.push({ base: CONTAINER_TAG });
    const id = addItem({ name: name.value.trim(), type: t as ItemType, tags, isContainer: isBag });
    if (t === 'Structure') moveItem(id, STASH_ID); // you don't carry a building; default it to the Stash
    setExpanded(id, true);
    editingId.value = id;
    editDirty.value = false;
    reset();
  }

  if (!open.value) return <button class="vamp-poss-add__open" onClick={() => { open.value = true; }}>+&nbsp;&nbsp;Add an item…</button>;

  return (
    <div class="vamp-poss-add">
      <div class="vamp-poss-add__row">
        <input
          class="vamp-poss-add__name" placeholder="What did you get?" value={name.value} ref={(el) => el?.focus()}
          onInput={(e) => { name.value = (e.target as HTMLInputElement).value; }}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        />
        <select
          class="vamp-poss-add__type" value={type.value}
          onChange={(e) => { type.value = (e.target as HTMLSelectElement).value as ItemType; armor.value = null; armorN.value = ''; harm.value = ''; container.value = null; }}
        >
          <option value="">Type…</option>
          {ITEM_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
        </select>
      </div>

      {t === 'Weapon' && (
        <div class="vamp-poss-add__req">
          <label class="vamp-poss-add__field"><input type="number" min="0" value={harm.value} onInput={(e) => { harm.value = (e.target as HTMLInputElement).value; }} /><span>-Harm</span></label>
          <label class="vamp-poss-add__field">
            <select value={rMin.value} onChange={(e) => { const mn = (e.target as HTMLSelectElement).value; rMin.value = mn; if (RANGE_BANDS.indexOf(rMax.value) < RANGE_BANDS.indexOf(mn)) rMax.value = mn; }}>{RANGE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}</select>
            <span class="vamp-poss-picker__dash">–</span>
            <select value={rMax.value} onChange={(e) => { rMax.value = (e.target as HTMLSelectElement).value; }}>{RANGE_BANDS.slice(RANGE_BANDS.indexOf(rMin.value)).map(b => <option key={b} value={b}>{b}</option>)}</select>
            <span>Range</span>
          </label>
        </div>
      )}

      {t === 'Wearable' && (
        <div class="vamp-poss-add__req">
          <span class="vamp-poss-add__q">Provides Armor?</span>
          <button class={`vamp-poss-btn ${armor.value === true ? 'vamp-poss-btn--select' : ''}`} onClick={() => { armor.value = true; }}>Yes</button>
          <button class={`vamp-poss-btn ${armor.value === false ? 'vamp-poss-btn--select' : ''}`} onClick={() => { armor.value = false; armorN.value = ''; }}>No</button>
          {armor.value === true && <label class="vamp-poss-add__field"><input type="number" min="1" value={armorN.value} onInput={(e) => { armorN.value = (e.target as HTMLInputElement).value; }} /><span>-Armor</span></label>}
        </div>
      )}

      {(t === 'Wearable' || t === 'Miscellaneous') && (
        <div class="vamp-poss-add__req">
          <span class="vamp-poss-add__q">Is it a container?</span>
          <button class={`vamp-poss-btn ${container.value === true ? 'vamp-poss-btn--select' : ''}`} onClick={() => { container.value = true; }}>Yes</button>
          <button class={`vamp-poss-btn ${container.value === false ? 'vamp-poss-btn--select' : ''}`} onClick={() => { container.value = false; }}>No</button>
        </div>
      )}

      <div class="vamp-poss-add__foot">
        <button class="vamp-poss-btn vamp-poss-btn--primary" disabled={!valid} onClick={commit}>Add</button>
        <button class="vamp-poss-btn" onClick={reset}>Cancel</button>
      </div>
    </div>
  );
}

/* Prefer a container under the pointer (nest) over the group/zone it sits inside (move). */
const possCollision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const nested = within.find(c => { const s = String(c.id); return s.startsWith('crow:') || s.startsWith('cchip:'); });
  if (nested) return [nested];
  return within.length ? within : rectIntersection(args);
};

export function PossessionsTab() {
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.('.vamp-poss-menu')) openMenu.value = null;
    };
    document.addEventListener('click', onDocClick);
    return () => {
      document.removeEventListener('click', onDocClick);
      expandedIds.value = new Set();
      editingId.value = null;
      editDirty.value = false;
      openMenu.value = null;
      draggingId.value = null;
    };
  }, []);

  const readOnly = viewingOtherSheet.value;
  const tags = gameData.value?.itemTags ?? [];
  const catalog = new Map(tags.map(t => [t.name, t] as const));

  const items = character.value.items;
  const carried = items.filter(i => i.containerId === null);
  const stash = items.filter(i => i.containerId === STASH_ID);
  const havenItems = coterieState.value.havenItems;
  const havenTop = havenItems.filter(i => i.containerId === HAVEN_ID);
  const inCoterie = !!activeCoterie.value;
  const stashLabel = character.value.playbook === 'Tzimisce' ? 'Hoard' : 'Stash';
  const stashIcon = stashLabel === 'Hoard' ? 'treasure-chest.svg' : 'coffin.svg';

  const rowProps = { allItems: items, havenItems, catalog, inCoterie, stashLabel, readOnly };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /* Drop routing: a dragged item lands on a zone/group (move to that root) or a container
     (nest). relocate() resolves the source + destination store, including cross-store. */
  async function onDragEnd(e: DragEndEvent) {
    draggingId.value = null;
    if (!e.over) return;
    const id = String(e.active.id).replace(/^(row|chip):/, '');
    const dragged = items.find(i => i.id === id) ?? havenItems.find(i => i.id === id);
    if (!dragged) return;
    const target = String(e.over.id);
    const zoneMatch = target.match(/^(?:zone|group):(.+)$/);

    let dest: string | null;
    if (zoneMatch) {
      const zone = zoneMatch[1];
      dest = zone === 'haven' ? HAVEN_ID : zone === 'stash' ? STASH_ID : null;
    } else {
      dest = target.replace(/^(crow|cchip):/, '');
      const destItem = items.find(i => i.id === dest) ?? havenItems.find(i => i.id === dest);
      const pool = items.some(i => i.id === id) ? items : havenItems;
      if (!destItem || !isContainerItem(destItem) || dest === id || isDescendant(pool, id, dest)) return;
    }
    if (dest === dragged.containerId) return;
    const crossedBox = rootZone(dragged.containerId) !== rootZone(dest);

    if (!(await relocate(id, dest))) return;
    if (dest === null && dragged.containerId !== null) {
      const it = character.value.items.find(i => i.id === id);
      if (it && isEquippableType(it.type) && !it.equipped) toggleEquip(id); // drop On You = carry + auto-equip
    }
    if (crossedBox) forceToast(dest === null ? takeToast(dragged.name) : moveToast(dragged.name, zoneLabel(dest)), 'info');
  }

  const ghost = draggingId.value
    ? items.find(i => i.id === draggingId.value) ?? havenItems.find(i => i.id === draggingId.value)
    : null;
  const ghostPool = ghost && items.some(i => i.id === ghost.id) ? items : havenItems;
  const ghostKids = ghost && isContainerItem(ghost) ? ghostPool.filter(i => i.containerId === ghost.id).length : 0;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={possCollision}
      onDragStart={(e: DragStartEvent) => { draggingId.value = String(e.active.id).replace(/^(row|chip):/, ''); }}
      onDragEnd={onDragEnd}
    >
      <div class="vamp-poss">
        <div class="vamp-poss__list">
          <ListGroup title="On You" icon="person.svg" count={carried.length} empty={carried.length === 0} emptyHint="Nothing carried yet. Add an item." zoneKey="carried">
            {carried.map(it => <ItemRow key={it.id} item={it} {...rowProps} />)}
          </ListGroup>

          {!readOnly && (
            <ListGroup title={stashLabel} icon={stashIcon} count={stash.length} empty={stash.length === 0} emptyHint="Private storage. Move something here." zoneKey="stash">
              {stash.map(it => <ItemRow key={it.id} item={it} {...rowProps} />)}
            </ListGroup>
          )}

          {inCoterie && (
            <ListGroup title="Haven" icon="haven.svg" count={havenTop.length} empty={havenTop.length === 0} emptyHint="Shared with your Coterie." zoneKey="haven">
              {havenTop.map(it => <HavenRow key={it.id} item={it} allHaven={havenItems} charItems={items} catalog={catalog} inCoterie={inCoterie} stashLabel={stashLabel} readOnly={readOnly} />)}
            </ListGroup>
          )}
        </div>

        <div class="vamp-poss__divider" />

        <div class="vamp-poss__zones">
          {!readOnly && <QuickAdd />}
          <div class="vamp-poss__zones-label">Scoot your stuff around</div>
          <ZonePanel title="On You" sub="Carried & equipped" icon="person.svg" items={carried} zoneKey="carried" pool={items} />
          {!readOnly && <ZonePanel title={stashLabel} sub="Private (only you)" icon={stashIcon} items={stash} zoneKey="stash" pool={items} />}
          {inCoterie && <ZonePanel title="Haven" sub="Shared with your Coterie" icon="haven.svg" items={havenTop} zoneKey="haven" pool={havenItems} />}
        </div>
      </div>
      {createPortal(
        <DragOverlay>
          {ghost ? (
            <span class={`vamp-poss-zchip vamp-poss-zchip--${itemRole(ghost)} vamp-poss-zchip--ghost`}>
              {ghost.equipped && ghost.containerId === null && <span class="vamp-poss-zchip__dot" />}
              {ghost.name || 'Unnamed'}
              {ghostKids > 0 && <span class="vamp-poss-zchip__count"> ({ghostKids})</span>}
            </span>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
