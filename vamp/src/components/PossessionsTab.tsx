import { useSignal } from '@preact/signals';
import { character, addItem, updateItem, removeItem, moveItem, setItemContainer, toggleEquip } from '../state/character';
import { coterieState } from '../state/coterie';
import { activeCoterie, activeCharacterId, giveItem, depositToHaven, withdrawFromHaven } from '../state/persistence';
import { gameData, totalArmor } from '../state/derived';
import { viewingOtherSheet } from '../state/ui';
import {
  orderTags, tagDisplay, canEquip, isEquippableType,
  TEMPLATE_TAGS, RANGE_OPTIONS, RANGE_TAG, CUSTOM_TAG,
} from '../data/itemTags';
import { ITEM_TYPES, type Item, type TagRef, type ItemType, type ItemTag } from '../data/types';
import { Tooltip } from './Tooltip';

type SortMode = 'equipped' | 'name' | 'type';
const SORT_KEY = 'vamp-possessions-sort';
const TAG_LIST_ID = 'vamp-tag-options';

function readSort(): SortMode {
  try {
    const v = localStorage.getItem(SORT_KEY);
    if (v === 'equipped' || v === 'name' || v === 'type') return v;
  } catch { /* storage blocked */ }
  return 'equipped';
}

/* Markdown emphasis markers render as literal junk in a plain-text tooltip. */
function plainEffect(s: string): string {
  return s.replace(/\*\*\*|\*\*|\*|`/g, '');
}

function effectFor(ref: TagRef, catalog: Map<string, ItemTag>): string {
  if (ref.base === CUSTOM_TAG) return ref.custom?.description?.trim() || 'Custom tag; ask your Storyteller.';
  if (ref.base === RANGE_TAG) return 'The range band at which this item operates.';
  const tag = catalog.get(ref.base);
  return tag ? plainEffect(tag.effect) : 'Custom tag; ask your Storyteller.';
}

function sortItems(items: Item[], mode: SortMode): Item[] {
  const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);
  const arr = [...items];
  if (mode === 'name') arr.sort(byName);
  else if (mode === 'type') arr.sort((a, b) => a.type.localeCompare(b.type) || byName(a, b));
  else arr.sort((a, b) => Number(b.equipped) - Number(a.equipped) || byName(a, b));
  return arr;
}

/* Every template tag (Harm, Range, Armor, Use, Fireproof, Warded, etc.) is a singleton;
   adding one replaces any existing tag of the same base. Plain and custom tags stack. */
function commitTag(item: Item, ref: TagRef) {
  const isTemplate = ref.base in TEMPLATE_TAGS;
  const base = isTemplate ? item.tags.filter(t => t.base !== ref.base) : item.tags;
  updateItem(item.id, { tags: [...base, ref] });
}

function removeTagAt(item: Item, index: number) {
  updateItem(item.id, { tags: item.tags.filter((_, i) => i !== index) });
}

/* Key chips by content + position so a removal remounts (rather than recycles) the
   nodes, clearing any open tooltip stuck on the old index. */
const tagKey = (t: TagRef, i: number) => `${t.base}|${t.param ?? ''}|${t.custom?.label ?? ''}|${i}`;

function TagChip({ refTag, catalog, onRemove }: {
  refTag: TagRef;
  catalog: Map<string, ItemTag>;
  onRemove?: () => void;
}) {
  return (
    <Tooltip content={effectFor(refTag, catalog)} anchorClass="vamp-poss-chip">
      <span class="vamp-poss-chip__label">{tagDisplay(refTag)}</span>
      {onRemove && (
        <button
          class="vamp-poss-chip__x"
          title="Remove tag"
          aria-label="Remove tag"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >×</button>
      )}
    </Tooltip>
  );
}

/* Staged tag adder: type/pick a base, then fill its param (number, Range band, or
   free text) or author a custom tag, before it commits. */
function TagAdder({ item, names }: { item: Item; names: string[] }) {
  const draft = useSignal('');
  const pendingBase = useSignal<string | null>(null);
  const pendingParam = useSignal('');
  const customLabel = useSignal('');
  const customDesc = useSignal('');

  function reset() {
    draft.value = '';
    pendingBase.value = null;
    pendingParam.value = '';
    customLabel.value = '';
    customDesc.value = '';
  }

  function pick(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (/^custom$/i.test(value)) { pendingBase.value = CUSTOM_TAG; return; }
    const matched = names.find(n => n.toLowerCase() === value.toLowerCase()) ?? value;
    const meta = TEMPLATE_TAGS[matched];
    if (matched === RANGE_TAG || (meta && meta.param !== 'none')) {
      pendingBase.value = matched;
      return;
    }
    commitTag(item, { base: matched });
    reset();
  }

  if (pendingBase.value === CUSTOM_TAG) {
    return (
      <div class="vamp-poss-adder vamp-poss-adder--custom">
        <input
          class="vamp-poss-adder__input" placeholder="Custom tag name"
          value={customLabel.value} ref={(el) => el?.focus()}
          onInput={(e) => { customLabel.value = (e.target as HTMLInputElement).value; }}
        />
        <input
          class="vamp-poss-adder__input" placeholder="What it does (tooltip)"
          value={customDesc.value}
          onInput={(e) => { customDesc.value = (e.target as HTMLInputElement).value; }}
        />
        <button
          class="vamp-poss-adder__ok"
          disabled={!customLabel.value.trim()}
          onClick={() => {
            commitTag(item, { base: CUSTOM_TAG, custom: { label: customLabel.value.trim(), description: customDesc.value.trim() } });
            reset();
          }}
        >Add</button>
        <button class="vamp-poss-adder__cancel" onClick={reset}>Cancel</button>
      </div>
    );
  }

  if (pendingBase.value) {
    const base = pendingBase.value;
    const isRange = base === RANGE_TAG;
    const numeric = TEMPLATE_TAGS[base]?.param === 'number';
    const hint = base === 'Recharge-X' ? 'Dawn / Scene'
      : base === 'Explosive-X' ? 'Close / Near'
      : base === '[Trespasser]-Warded' ? 'Ghoul / Vampire' : 'value';
    const confirmParam = () => {
      if (!pendingParam.value.trim()) return;
      commitTag(item, { base, param: pendingParam.value.trim() });
      reset();
    };
    return (
      <div class="vamp-poss-adder">
        <span class="vamp-poss-adder__base">{base.replace('-X', '').replace('[Trespasser]-Warded', 'Warded')}</span>
        {isRange ? (
          <select
            class="vamp-poss-adder__input" value={pendingParam.value}
            onChange={(e) => { pendingParam.value = (e.target as HTMLSelectElement).value; }}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmParam(); }}
          >
            <option value="">band…</option>
            {RANGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            class="vamp-poss-adder__input"
            type={numeric ? 'number' : 'text'} min={numeric ? '0' : undefined}
            placeholder={hint} value={pendingParam.value} ref={(el) => el?.focus()}
            onInput={(e) => { pendingParam.value = (e.target as HTMLInputElement).value; }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmParam(); } }}
          />
        )}
        <button class="vamp-poss-adder__ok" disabled={!pendingParam.value.trim()} onClick={confirmParam}>Add</button>
        <button class="vamp-poss-adder__cancel" onClick={reset}>Cancel</button>
      </div>
    );
  }

  return (
    <div class="vamp-poss-adder">
      <input
        class="vamp-poss-adder__input" list={TAG_LIST_ID}
        placeholder="+ tag (type to search)" value={draft.value}
        onInput={(e) => { draft.value = (e.target as HTMLInputElement).value; }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pick(draft.value); } }}
      />
      <button class="vamp-poss-adder__ok" disabled={!draft.value.trim()} onClick={() => pick(draft.value)}>Add</button>
    </div>
  );
}

/* Edit keeps tags in storage order so each chip's index maps to the real array slot. */
function ItemEditor({ item, catalog, names }: { item: Item; catalog: Map<string, ItemTag>; names: string[] }) {
  return (
    <div class="vamp-poss-edit">
      <div class="vamp-poss-edit__row">
        <input
          class="vamp-poss-edit__name" placeholder="Item name" value={item.name}
          onInput={(e) => updateItem(item.id, { name: (e.target as HTMLInputElement).value })}
        />
        <select
          class="vamp-poss-edit__type" value={item.type}
          onChange={(e) => updateItem(item.id, { type: (e.target as HTMLSelectElement).value as ItemType })}
        >
          {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {item.tags.length > 0 && (
        <div class="vamp-poss-row__chips vamp-poss-row__chips--edit">
          {item.tags.map((t, i) => (
            <TagChip key={tagKey(t, i)} refTag={t} catalog={catalog} onRemove={() => removeTagAt(item, i)} />
          ))}
        </div>
      )}
      <TagAdder item={item} names={names} />
      <textarea
        class="vamp-poss-edit__desc" placeholder="Description (flavor only, never rules)"
        value={item.description}
        onInput={(e) => updateItem(item.id, { description: (e.target as HTMLTextAreaElement).value })}
      />
      {/* Nested items can't become containers (1-level rule). */}
      <label class="vamp-poss-edit__container">
        <input
          type="checkbox" checked={item.isContainer}
          disabled={item.containerId !== null && item.containerId !== 'stash' && item.containerId !== 'haven'}
          onChange={(e) => setItemContainer(item.id, (e.target as HTMLInputElement).checked)}
        />
        Holds other items (container)
      </label>
    </div>
  );
}

interface MoveTarget { label: string; target: string | null; }

function MoveMenu({ item, targets }: { item: Item; targets: MoveTarget[] }) {
  const open = useSignal(false);
  if (targets.length === 0) return null;
  return (
    <span class="vamp-poss-move" onMouseLeave={() => { open.value = false; }}>
      <button class="vamp-poss-btn" onClick={() => { open.value = !open.value; }}>Move to…</button>
      {open.value && (
        <div class="vamp-poss-move__menu">
          {targets.map(t => (
            <button
              key={`${t.target ?? 'loose'}`}
              class="vamp-poss-move__item"
              onClick={() => {
                if (t.target === 'haven') depositToHaven(item.id);
                else moveItem(item.id, t.target);
                open.value = false;
              }}
            >{t.label}</button>
          ))}
        </div>
      )}
    </span>
  );
}

/* Hand an item to a Coterie-mate. Shows a qty stepper for stacks (partial give). */
function GiveControl({ item }: { item: Item }) {
  const open = useSignal(false);
  const qty = useSignal(1);
  const members = coterieState.value.members.filter(m => m.characterId !== activeCharacterId.value);
  if (!activeCoterie.value || members.length === 0) return null;
  return (
    <span class="vamp-poss-move" onMouseLeave={() => { open.value = false; }}>
      <button class="vamp-poss-btn" onClick={() => { open.value = !open.value; qty.value = 1; }}>Give…</button>
      {open.value && (
        <div class="vamp-poss-move__menu">
          {item.qty > 1 && (
            <div class="vamp-poss-give__qty">
              <button onClick={() => { qty.value = Math.max(1, qty.value - 1); }}>−</button>
              <span>{qty.value} of {item.qty}</span>
              <button onClick={() => { qty.value = Math.min(item.qty, qty.value + 1); }}>+</button>
            </div>
          )}
          {members.map(m => (
            <button
              key={m.characterId} class="vamp-poss-move__item"
              onClick={() => { giveItem(item.id, m.characterId, qty.value); open.value = false; }}
            >{m.name || 'Unnamed'}</button>
          ))}
        </div>
      )}
    </span>
  );
}

function ItemRow({ item, allItems, catalog, names, readOnly, moveTargets, depth = 0 }: {
  item: Item;
  allItems: Item[];
  catalog: Map<string, ItemTag>;
  names: string[];
  readOnly: boolean;
  moveTargets: (item: Item) => MoveTarget[];
  depth?: number;
}) {
  const expanded = useSignal(false);
  const editing = useSignal(false);
  const confirmDel = useSignal(false);
  const dropActive = useSignal(false);
  const ordered = orderTags(item.tags);
  const chips = [...ordered.leading, ...ordered.middle, ...ordered.trailing];
  const equippable = isEquippableType(item.type);
  /* Only top-level containers nest contents and accept drops; the 1-level rule
     means a contained item is never itself a container. */
  const children = item.isContainer && depth === 0
    ? allItems.filter(i => i.containerId === item.id)
    : [];
  const acceptsDrop = item.isContainer && depth === 0 && !readOnly;

  function onDragStart(e: DragEvent) {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', item.id);
    e.stopPropagation();
  }
  function onDragOver(e: DragEvent) {
    if (!acceptsDrop) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer!.dropEffect = 'move';
    dropActive.value = true;
  }
  function onDrop(e: DragEvent) {
    if (!acceptsDrop) return;
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer!.getData('text/plain');
    if (id && id !== item.id) moveItem(id, item.id);
    dropActive.value = false;
  }

  return (
    <div
      class={`vamp-poss-row ${item.equipped ? 'vamp-poss-row--equipped' : ''} ${item.isContainer ? 'vamp-poss-row--container' : ''} ${dropActive.value ? 'vamp-poss-row--drop' : ''}`}
      draggable={!readOnly && !editing.value}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={() => { dropActive.value = false; }}
      onDrop={onDrop}
    >
      <div
        class="vamp-poss-row__head"
        onClick={() => { const next = !expanded.value; expanded.value = next; if (!next) { editing.value = false; confirmDel.value = false; } }}
      >
        <span class={`vamp-poss-row__pip ${!equippable ? 'vamp-poss-row__pip--none' : ''} ${item.equipped ? 'is-on' : ''}`} aria-hidden="true" />
        <span class="vamp-poss-row__name">
          {item.isContainer && <span class="vamp-poss-row__bag" aria-hidden="true">▾ </span>}
          {item.name || 'Unnamed'}{item.qty > 1 ? ` ×${item.qty}` : ''}
          {item.isContainer && children.length > 0 && <span class="vamp-poss-row__contains"> ({children.length})</span>}
        </span>
        <span class="vamp-poss-row__chips">
          {chips.map((t, i) => <TagChip key={tagKey(t, i)} refTag={t} catalog={catalog} />)}
        </span>
      </div>

      {expanded.value && (
        <div class="vamp-poss-row__body">
          {editing.value ? (
            <ItemEditor item={item} catalog={catalog} names={names} />
          ) : (
            item.description && <p class="vamp-poss-row__desc">{item.description}</p>
          )}

          {!readOnly && (
            <div class="vamp-poss-row__actions">
              {equippable && (
                <button
                  class={`vamp-poss-btn ${item.equipped ? 'vamp-poss-btn--on' : ''}`}
                  disabled={!canEquip(item)}
                  onClick={() => toggleEquip(item.id)}
                >{item.equipped ? 'Unequip' : 'Equip'}</button>
              )}
              <button class="vamp-poss-btn" onClick={() => { editing.value = !editing.value; }}>
                {editing.value ? 'Done' : 'Edit'}
              </button>
              <MoveMenu item={item} targets={moveTargets(item)} />
              <GiveControl item={item} />
              <button
                class={`vamp-poss-btn ${confirmDel.value ? 'vamp-poss-btn--danger' : ''}`}
                onClick={() => { confirmDel.value ? removeItem(item.id) : (confirmDel.value = true); }}
                onMouseLeave={() => { confirmDel.value = false; }}
              >{confirmDel.value ? 'Sure?' : 'Delete'}</button>
            </div>
          )}
        </div>
      )}

      {expanded.value && item.isContainer && depth === 0 && (
        <div class="vamp-poss-row__children">
          {children.length === 0
            ? <p class="vamp-poss-section__empty">Empty. Drag items in, or use Move to…</p>
            : children.map(c => (
              <ItemRow
                key={c.id} item={c} allItems={allItems} catalog={catalog}
                names={names} readOnly={readOnly} moveTargets={moveTargets} depth={1}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, target, items, rowProps, readOnly }: {
  title: string;
  target: string | null;
  items: Item[];
  rowProps: Omit<Parameters<typeof ItemRow>[0], 'item'>;
  readOnly: boolean;
}) {
  const dropActive = useSignal(false);
  function onDragOver(e: DragEvent) {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    dropActive.value = true;
  }
  function onDrop(e: DragEvent) {
    if (readOnly) return;
    e.preventDefault();
    const id = e.dataTransfer!.getData('text/plain');
    if (id) moveItem(id, target);
    dropActive.value = false;
  }
  return (
    <section
      class={`vamp-poss-section ${dropActive.value ? 'vamp-poss-section--drop' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={() => { dropActive.value = false; }}
      onDrop={onDrop}
    >
      <h4 class="vamp-poss-section__title">{title}</h4>
      {items.length === 0
        ? <p class="vamp-poss-section__empty">Nothing here yet.</p>
        : items.map(item => <ItemRow key={item.id} item={item} {...rowProps} />)}
    </section>
  );
}

/* Coterie-shared storage. Items here live in the Coterie doc, not this character; any
   member can Take one into their own inventory. */
function HavenRow({ item, catalog }: { item: Item; catalog: Map<string, ItemTag> }) {
  const ordered = orderTags(item.tags);
  const chips = [...ordered.leading, ...ordered.middle, ...ordered.trailing];
  return (
    <div class="vamp-poss-row">
      <div class="vamp-poss-row__head vamp-poss-row__head--haven">
        <span class="vamp-poss-row__name">{item.name || 'Unnamed'}{item.qty > 1 ? ` ×${item.qty}` : ''}</span>
        <span class="vamp-poss-row__chips">
          {chips.map((t, i) => <TagChip key={tagKey(t, i)} refTag={t} catalog={catalog} />)}
        </span>
        <button class="vamp-poss-btn vamp-poss-haven__take" onClick={() => withdrawFromHaven(item.id)}>Take</button>
      </div>
    </div>
  );
}

function HavenSection({ catalog }: { catalog: Map<string, ItemTag> }) {
  const items = coterieState.value.havenItems;
  const dropActive = useSignal(false);
  const readOnly = viewingOtherSheet.value;
  return (
    <section
      class={`vamp-poss-section ${dropActive.value ? 'vamp-poss-section--drop' : ''}`}
      onDragOver={(e) => { if (readOnly) return; e.preventDefault(); e.dataTransfer!.dropEffect = 'move'; dropActive.value = true; }}
      onDragLeave={() => { dropActive.value = false; }}
      onDrop={(e) => {
        if (readOnly) return;
        e.preventDefault();
        const id = e.dataTransfer!.getData('text/plain');
        if (id) depositToHaven(id);
        dropActive.value = false;
      }}
    >
      <h4 class="vamp-poss-section__title">Haven (shared)</h4>
      {items.length === 0
        ? <p class="vamp-poss-section__empty">The Haven is empty. Drag items in to share them.</p>
        : items.map(it => <HavenRow key={it.id} item={it} catalog={catalog} />)}
    </section>
  );
}

/* Burn one use/charge straight from the loadout strip. Reads live state so a rapid
   double-tap can't recompute from a stale render snapshot and lose a decrement. */
function spendCharge(itemId: string, base: string) {
  const live = character.value.items.find(i => i.id === itemId);
  if (!live) return;
  updateItem(itemId, {
    tags: live.tags.map(t => {
      if (t.base !== base) return t;
      const n = Math.max(0, (parseInt(t.param ?? '0', 10) || 0) - 1);
      return { ...t, param: String(n) };
    }),
  });
}

function LoadoutStrip({ readOnly }: { readOnly: boolean }) {
  const armor = totalArmor.value;
  const equipped = character.value.items.filter(i => i.containerId === null && i.equipped);
  if (equipped.length === 0 && armor.total === 0) return null;
  return (
    <div class="vamp-poss-loadout">
      {armor.total > 0 && (
        <Tooltip
          anchorClass="vamp-poss-loadout__armor"
          content={armor.vsAggravated > 0
            ? `${armor.vsAggravated} of this also reduces Aggravated Harm (Stone Hide). Application is a fiction call.`
            : 'Reduces Superficial Harm. Application is a fiction call, never auto-subtracted.'}
        >
          <span class="vamp-poss-loadout__shield" aria-hidden="true" />
          <span>{armor.total} Armor</span>
        </Tooltip>
      )}
      {equipped.map(it => {
        const harm = it.tags.find(t => t.base === 'N-Harm');
        const range = it.tags.find(t => t.base === 'Range');
        const use = it.tags.find(t => t.base === 'N-Use' || t.base === 'N-Charge');
        return (
          <span key={it.id} class="vamp-poss-loadout__item">
            <span class="vamp-poss-loadout__name">{it.name || 'Unnamed'}</span>
            {harm && <span class="vamp-poss-loadout__stat">{tagDisplay(harm)}</span>}
            {range && <span class="vamp-poss-loadout__stat">{tagDisplay(range)}</span>}
            {use && (
              <button
                class="vamp-poss-loadout__use" disabled={readOnly}
                title="Spend one" onClick={() => spendCharge(it.id, use.base)}
              >{tagDisplay(use)}</button>
            )}
          </span>
        );
      })}
    </div>
  );
}

function QuickAdd() {
  const name = useSignal('');
  const type = useSignal<ItemType>('Miscellaneous');

  function add() {
    const n = name.value.trim();
    if (!n) return;
    addItem({ name: n, type: type.value });
    name.value = '';
  }

  return (
    <div class="vamp-poss-add">
      <input
        class="vamp-poss-add__name" placeholder="Add an item…" value={name.value}
        onInput={(e) => { name.value = (e.target as HTMLInputElement).value; }}
        onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
      />
      <select
        class="vamp-poss-add__type" value={type.value}
        onChange={(e) => { type.value = (e.target as HTMLSelectElement).value as ItemType; }}
      >
        {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <button class="vamp-poss-add__btn" disabled={!name.value.trim()} onClick={add}>Add</button>
    </div>
  );
}

export function PossessionsTab() {
  const sort = useSignal<SortMode>(readSort());
  const readOnly = viewingOtherSheet.value;
  const tags = gameData.value?.itemTags ?? [];
  const catalog = new Map(tags.map(t => [t.name, t]));
  const names = [...tags.map(t => t.name), RANGE_TAG, 'Custom'];

  const items = character.value.items;
  /* Containers can't nest, so every one sits at top level (loose, Stash, or Haven);
     list them all as drop destinations for the Move-to menu. */
  const containers = items.filter(i => i.isContainer);
  const carried = sortItems(items.filter(i => i.containerId === null), sort.value);
  const stashLabel = character.value.playbook === 'Tzimisce' ? 'Hoard' : 'Stash';
  const stash = sortItems(items.filter(i => i.containerId === 'stash'), sort.value);

  const inCoterie = !!activeCoterie.value;
  const moveTargets = (it: Item): MoveTarget[] => {
    const out: MoveTarget[] = [];
    if (it.containerId !== null) out.push({ label: 'Carried', target: null });
    if (it.containerId !== 'stash') out.push({ label: stashLabel, target: 'stash' });
    if (inCoterie) out.push({ label: 'Haven', target: 'haven' });
    if (!it.isContainer) {
      for (const c of containers) {
        if (c.id === it.id || it.containerId === c.id) continue;
        /* Label the container's section so a Stash item can't be moved public by mistake. */
        const where = c.containerId === 'stash' ? ` (${stashLabel})`
          : c.containerId === 'haven' ? ' (Haven)' : ' (Carried)';
        out.push({ label: (c.name || 'Container') + where, target: c.id });
      }
    }
    return out;
  };

  const rowProps = { allItems: items, catalog, names, readOnly, moveTargets };

  function setSort(mode: SortMode) {
    sort.value = mode;
    try { localStorage.setItem(SORT_KEY, mode); } catch { /* storage blocked */ }
  }

  return (
    <div class="vamp-poss">
      <datalist id={TAG_LIST_ID}>
        {names.map(n => <option key={n} value={n} />)}
      </datalist>

      <div class="vamp-poss__toolbar">
        <span class="vamp-poss__count">{items.length} item{items.length === 1 ? '' : 's'}</span>
        <label class="vamp-poss__sort">
          Sort
          <select value={sort.value} onChange={(e) => setSort((e.target as HTMLSelectElement).value as SortMode)}>
            <option value="equipped">Equipped first</option>
            <option value="name">Name A→Z</option>
            <option value="type">Base type</option>
          </select>
        </label>
      </div>

      <LoadoutStrip readOnly={readOnly} />

      <Section title="Carried" target={null} items={carried} rowProps={rowProps} readOnly={readOnly} />

      {/* Stash is private: hidden entirely when viewing someone else's sheet. */}
      {!readOnly && (
        <Section title={`${stashLabel} (private)`} target="stash" items={stash} rowProps={rowProps} readOnly={readOnly} />
      )}

      {!readOnly && inCoterie && <HavenSection catalog={catalog} />}

      {!readOnly && <QuickAdd />}
    </div>
  );
}
