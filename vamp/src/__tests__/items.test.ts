import { describe, it, expect, beforeEach } from 'vitest';
import {
  character, BLANK_CHARACTER,
  addItem, updateItem, removeItem, moveItem, setItemQty, setItemContainer, toggleEquip,
} from '../state/character';

beforeEach(() => {
  character.value = structuredClone(BLANK_CHARACTER);
});

const byId = (id: string) => character.value.items.find(i => i.id === id);

describe('addItem / updateItem', () => {
  it('appends with sane defaults and returns the new id', () => {
    const id = addItem({ name: 'Crowbar', type: 'Weapon' });
    expect(byId(id)).toMatchObject({
      name: 'Crowbar', type: 'Weapon', qty: 1,
      equipped: false, isContainer: false, containerId: null,
    });
    expect(byId(id)!.tags).toEqual([]);
  });

  it('patches fields by id', () => {
    const id = addItem({ name: 'Crowbar', type: 'Weapon' });
    updateItem(id, { name: 'Pry Bar', description: 'bent' });
    expect(byId(id)).toMatchObject({ name: 'Pry Bar', description: 'bent' });
  });

  it('drops equipped when a patch makes the item non-equippable', () => {
    const id = addItem({ name: 'Knife', type: 'Weapon', equipped: true });
    updateItem(id, { type: 'Vehicle' });
    expect(byId(id)!.equipped).toBe(false);
  });

  it('refuses to equip an in-container item via a raw patch', () => {
    const id = addItem({ name: 'Knife', type: 'Weapon', containerId: 'stash' });
    updateItem(id, { equipped: true });
    expect(byId(id)!.equipped).toBe(false);
  });
});

describe('setItemQty', () => {
  it('clamps to a minimum of 1', () => {
    const id = addItem({ name: 'Blood Bags', type: 'Consumable', qty: 3 });
    setItemQty(id, 5); expect(byId(id)!.qty).toBe(5);
    setItemQty(id, 0); expect(byId(id)!.qty).toBe(1);
    setItemQty(id, -2); expect(byId(id)!.qty).toBe(1);
  });
});

describe('toggleEquip', () => {
  it('flips a loose equippable item', () => {
    const id = addItem({ name: 'Jacket', type: 'Wearable' });
    toggleEquip(id); expect(byId(id)!.equipped).toBe(true);
    toggleEquip(id); expect(byId(id)!.equipped).toBe(false);
  });

  it('no-ops on a non-equippable type', () => {
    const id = addItem({ name: 'Van', type: 'Vehicle' });
    toggleEquip(id); expect(byId(id)!.equipped).toBe(false);
  });

  it('no-ops on an item inside a container', () => {
    const id = addItem({ name: 'Knife', type: 'Weapon', containerId: 'stash' });
    toggleEquip(id); expect(byId(id)!.equipped).toBe(false);
  });
});

describe('moveItem', () => {
  it('clears equipped when stowing off your person', () => {
    const id = addItem({ name: 'Knife', type: 'Weapon', equipped: true });
    moveItem(id, 'stash');
    expect(byId(id)).toMatchObject({ containerId: 'stash', equipped: false });
  });

  it('places a loose item into a real container', () => {
    const bag = addItem({ name: 'Bag', type: 'Miscellaneous', isContainer: true });
    const phone = addItem({ name: 'Phone', type: 'Tech' });
    moveItem(phone, bag);
    expect(byId(phone)!.containerId).toBe(bag);
  });

  it('nests a container inside another container', () => {
    const room = addItem({ name: 'Room', type: 'Structure', isContainer: true });
    const bag = addItem({ name: 'Go-Bag', type: 'Miscellaneous', isContainer: true });
    moveItem(bag, room);
    expect(byId(bag)!.containerId).toBe(room);
  });

  it('rejects a target that is not a real container', () => {
    const knife = addItem({ name: 'Knife', type: 'Weapon' });
    const jacket = addItem({ name: 'Jacket', type: 'Wearable' });
    moveItem(knife, jacket);
    expect(byId(knife)!.containerId).toBeNull();
  });

  it('rejects moving an item into itself', () => {
    const bag = addItem({ name: 'Bag', type: 'Miscellaneous', isContainer: true });
    moveItem(bag, bag);
    expect(byId(bag)!.containerId).toBeNull();
  });

  it('rejects nesting a container into its own descendant', () => {
    const room = addItem({ name: 'Room', type: 'Structure', isContainer: true });
    const bag = addItem({ name: 'Go-Bag', type: 'Miscellaneous', isContainer: true });
    moveItem(bag, room);   // bag now inside room
    moveItem(room, bag);   // would form a cycle
    expect(byId(room)!.containerId).toBeNull();
    expect(byId(bag)!.containerId).toBe(room);
  });
});

describe('removeItem', () => {
  it('frees a deleted container\'s children to loose', () => {
    const bag = addItem({ name: 'Bag', type: 'Miscellaneous', isContainer: true });
    const phone = addItem({ name: 'Phone', type: 'Tech', containerId: bag });
    removeItem(bag);
    expect(byId(bag)).toBeUndefined();
    expect(byId(phone)!.containerId).toBeNull();
  });
});

describe('setItemContainer', () => {
  it('un-containering frees children to loose', () => {
    const bag = addItem({ name: 'Bag', type: 'Miscellaneous', isContainer: true });
    const phone = addItem({ name: 'Phone', type: 'Tech', containerId: bag });
    setItemContainer(bag, false);
    expect(byId(bag)!.isContainer).toBe(false);
    expect(byId(phone)!.containerId).toBeNull();
  });

  it('making an item a container leaves loose items untouched', () => {
    const bag = addItem({ name: 'Bag', type: 'Miscellaneous' });
    const phone = addItem({ name: 'Phone', type: 'Tech' });
    setItemContainer(bag, true);
    expect(byId(bag)!.isContainer).toBe(true);
    expect(byId(phone)!.containerId).toBeNull();
  });

  it('un-containering a Stash bag keeps its children in Stash (no privacy leak)', () => {
    const bag = addItem({ name: 'Bag', type: 'Miscellaneous', isContainer: true, containerId: 'stash' });
    const phone = addItem({ name: 'Phone', type: 'Tech', containerId: bag });
    setItemContainer(bag, false);
    expect(byId(phone)!.containerId).toBe('stash');
  });
});
