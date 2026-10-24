const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TodoStore } = require('../src/store/todoStore');
const { isItemCompleted } = require('../src/completion');
const { formatChicagoDateKey } = require('../src/time/chicago');

describe('TodoStore', () => {
  let tmpDir;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'koodo-store-'));
    store = new TodoStore(tmpDir);
    store.init();
  });

  afterEach(async () => {
    await store.writeQueue;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a list with name, color, and defaults', () => {
    const list = store.createList({ name: 'Groceries', color: '#5B8DEF' });
    assert.equal(list.name, 'Groceries');
    assert.equal(list.color, '#5B8DEF');
    assert.equal(list.daily, false);
    assert.equal(list.dueDate, null);
    assert.equal(list.deletedAt, null);
    assert.deepEqual(list.items, []);
    assert.equal(list.reminder.dailyEnabled, false);
    assert.equal(list.reminder.dueDateEnabled, false);
  });

  it('rejects empty list names and invalid colors', () => {
    assert.equal(store.createList({ name: '  ', color: '#5B8DEF' }), null);
    assert.equal(store.createList({ name: 'Ok', color: 'not-a-color' }), null);
  });

  it('updates list name, color, due date, daily, and reminders', () => {
    const list = store.createList({ name: 'A', color: '#5B8DEF' });
    const updated = store.updateList(list.id, {
      name: 'Renamed',
      color: '#E85D9A',
      dueDate: '2026-11-01',
      daily: true,
      reminder: {
        dailyEnabled: true,
        dailyTime: '09:30',
        dueDateEnabled: true,
      },
    });
    assert.equal(updated.name, 'Renamed');
    assert.equal(updated.color, '#E85D9A');
    assert.equal(updated.dueDate, '2026-11-01');
    assert.equal(updated.daily, true);
    assert.equal(updated.reminder.dailyEnabled, true);
    assert.equal(updated.reminder.dailyTime, '09:30');
    assert.equal(updated.reminder.dueDateEnabled, true);
  });

  it('adds items and one level of sub-items', () => {
    const list = store.createList({ name: 'Tasks', color: '#5B8DEF' });
    const item = store.addItem(list.id, { text: 'Parent' });
    const child = store.addSubItem(list.id, item.id, { text: 'Child' });
    assert.equal(item.text, 'Parent');
    assert.equal(child.text, 'Child');

    const fresh = store.getList(list.id);
    assert.equal(fresh.items.length, 1);
    assert.equal(fresh.items[0].children.length, 1);
    assert.equal(fresh.items[0].children[0].text, 'Child');
  });

  it('does not nest beyond one sub-item level', () => {
    const list = store.createList({ name: 'Tasks', color: '#5B8DEF' });
    const item = store.addItem(list.id, { text: 'Parent' });
    const child = store.addSubItem(list.id, item.id, { text: 'Child' });
    const deeper = store.addSubItem(list.id, child.id, { text: 'Too deep' });
    assert.equal(deeper, null);
  });

  it('toggles completion with a Chicago date for daily lists', () => {
    const list = store.createList({ name: 'Daily', color: '#5B8DEF', daily: true });
    const item = store.addItem(list.id, { text: 'Walk' });
    const today = formatChicagoDateKey();

    const checked = store.setItemCompleted(list.id, item.id, true);
    assert.equal(checked.completedOn, today);
    assert.equal(isItemCompleted(checked, store.getList(list.id)), true);

    const unchecked = store.setItemCompleted(list.id, item.id, false);
    assert.equal(unchecked.completedOn, null);
  });

  it('treats yesterday completion as incomplete on a daily list', () => {
    const list = store.createList({ name: 'Daily', color: '#5B8DEF', daily: true });
    const item = store.addItem(list.id, { text: 'Walk' });
    store.setItemCompleted(list.id, item.id, true);

    store.state.lists.find((entry) => entry.id === list.id).items[0].completedOn = '2000-01-01';
    store._persist();

    const fresh = store.getList(list.id);
    assert.equal(isItemCompleted(fresh.items[0], fresh), false);
  });

  it('keeps standard-list completion until unchecked', () => {
    const list = store.createList({ name: 'Once', color: '#5B8DEF' });
    const item = store.addItem(list.id, { text: 'File taxes' });
    store.setItemCompleted(list.id, item.id, true);
    store.state.lists.find((entry) => entry.id === list.id).items[0].completedOn = '2000-01-01';
    store._persist();

    const fresh = store.getList(list.id);
    assert.equal(isItemCompleted(fresh.items[0], fresh), true);
  });

  it('reorders active lists and leaves deleted lists in place', () => {
    const first = store.createList({ name: 'First', color: '#5B8DEF' });
    const second = store.createList({ name: 'Second', color: '#7C5CFC' });
    const third = store.createList({ name: 'Third', color: '#E85D9A' });
    store.deleteList(second.id);

    const reordered = store.reorderLists([first.id, third.id]);
    assert.deepEqual(reordered.map((list) => list.name), ['First', 'Third']);
    assert.deepEqual(store.state.lists.map((list) => list.name), ['First', 'Second', 'Third']);
    assert.equal(store.getActiveLists().map((list) => list.id).join(','), `${first.id},${third.id}`);
  });

  it('rejects list orders that are not a permutation of the active lists', () => {
    const first = store.createList({ name: 'First', color: '#5B8DEF' });
    const second = store.createList({ name: 'Second', color: '#7C5CFC' });

    assert.equal(store.reorderLists([first.id]), null);
    assert.equal(store.reorderLists([first.id, first.id]), null);
    assert.equal(store.reorderLists([first.id, 'missing']), null);
    assert.equal(store.reorderLists('nope'), null);
    assert.deepEqual(store.getActiveLists().map((list) => list.name), ['Second', 'First']);

    store.deleteList(second.id);
    assert.equal(store.reorderLists([first.id, second.id]), null);
    assert.deepEqual(store.getActiveLists().map((list) => list.id), [first.id]);
  });

  it('persists list order across store reloads', async () => {
    const first = store.createList({ name: 'First', color: '#5B8DEF' });
    const second = store.createList({ name: 'Second', color: '#7C5CFC' });
    store.reorderLists([first.id, second.id]);
    await store.writeQueue;

    const reloaded = new TodoStore(tmpDir);
    reloaded.init();
    assert.deepEqual(reloaded.getActiveLists().map((list) => list.name), ['First', 'Second']);
  });

  it('soft-deletes lists into the recycle bin and restores them', () => {
    const list = store.createList({ name: 'Gone', color: '#5B8DEF' });
    store.deleteList(list.id);

    assert.equal(store.getActiveLists().length, 0);
    assert.equal(store.getDeletedLists().length, 1);
    assert.ok(store.getDeletedLists()[0].deletedAt);

    const restored = store.restoreList(list.id);
    assert.equal(restored.deletedAt, null);
    assert.equal(store.getActiveLists().length, 1);
  });

  it('permanently deletes lists from the recycle bin', () => {
    const list = store.createList({ name: 'Gone', color: '#5B8DEF' });
    store.deleteList(list.id);
    assert.equal(store.permanentlyDeleteList(list.id), true);
    assert.equal(store.getDeletedLists().length, 0);
    assert.equal(store.getList(list.id), null);
  });

  it('deletes items immediately', () => {
    const list = store.createList({ name: 'Tasks', color: '#5B8DEF' });
    const item = store.addItem(list.id, { text: 'Temp' });
    assert.equal(store.deleteItem(list.id, item.id), true);
    assert.equal(store.getList(list.id).items.length, 0);
  });

  it('saves reminder email settings', () => {
    store.updateSettings({ reminderEmail: 'me@example.com' });
    assert.equal(store.getSettings().reminderEmail, 'me@example.com');
  });

  it('registers devices and looks them up by token', () => {
    const device = store.registerDevice('token-abc');
    assert.equal(device.token, 'token-abc');
    assert.ok(store.findDevice('token-abc'));
    assert.equal(store.findDevice('missing'), null);
  });

  it('records reminder sends idempotently', () => {
    assert.equal(store.hasReminderSend('list1:daily:2026-10-23'), false);
    store.markReminderSend('list1:daily:2026-10-23');
    assert.equal(store.hasReminderSend('list1:daily:2026-10-23'), true);
  });

  it('persists across store reloads', async () => {
    const list = store.createList({ name: 'Persist', color: '#5B8DEF' });
    store.addItem(list.id, { text: 'Item' });
    await store.writeQueue;

    const reloaded = new TodoStore(tmpDir);
    reloaded.init();
    assert.equal(reloaded.getActiveLists().length, 1);
    assert.equal(reloaded.getActiveLists()[0].items[0].text, 'Item');
  });
});
