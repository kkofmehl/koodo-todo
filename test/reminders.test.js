const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TodoStore } = require('../src/store/todoStore');
const {
  selectPendingReminders,
  runReminders,
  reminderKey,
  buildReminderEmail,
} = require('../src/email/reminders');
const { formatChicagoDateKey } = require('../src/time/chicago');

describe('Reminders', () => {
  let tmpDir;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'koodo-reminders-'));
    store = new TodoStore(tmpDir);
    store.init();
  });

  afterEach(async () => {
    await store.writeQueue;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function chicagoAt(hour, minute, date = '2026-10-23') {
    // 2026-10-23 is CDT (UTC-5).
    const utcHour = hour + 5;
    return new Date(`${date}T${String(utcHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  }

  it('selects a daily reminder at or past the configured time', () => {
    const list = store.createList({
      name: 'Morning',
      color: '#5B8DEF',
      reminder: { dailyEnabled: true, dailyTime: '09:00', dueDateEnabled: false },
    });

    const before = selectPendingReminders(store, chicagoAt(8, 59));
    assert.equal(before.length, 0);

    const after = selectPendingReminders(store, chicagoAt(9, 0));
    assert.equal(after.length, 1);
    assert.equal(after[0].list.id, list.id);
    assert.equal(after[0].kind, 'daily');
  });

  it('selects a due-date reminder at or past 8:00 on the due date', () => {
    store.createList({
      name: 'Due list',
      color: '#5B8DEF',
      dueDate: '2026-10-23',
      reminder: { dailyEnabled: false, dailyTime: '09:00', dueDateEnabled: true },
    });

    assert.equal(selectPendingReminders(store, chicagoAt(7, 59)).length, 0);
    assert.equal(selectPendingReminders(store, chicagoAt(8, 0)).length, 1);
  });

  it('skips deleted lists', () => {
    const list = store.createList({
      name: 'Deleted',
      color: '#5B8DEF',
      dueDate: '2026-10-23',
      reminder: { dailyEnabled: false, dailyTime: '09:00', dueDateEnabled: true },
    });
    store.deleteList(list.id);
    assert.equal(selectPendingReminders(store, chicagoAt(9, 0)).length, 0);
  });

  it('does not reselect a reminder that already sent', () => {
    const list = store.createList({
      name: 'Morning',
      color: '#5B8DEF',
      reminder: { dailyEnabled: true, dailyTime: '09:00', dueDateEnabled: false },
    });
    const now = chicagoAt(9, 0);
    const key = reminderKey(list.id, 'daily', formatChicagoDateKey(now));
    store.markReminderSend(key, now);
    assert.equal(selectPendingReminders(store, now).length, 0);
  });

  it('skips sending when reminder email is missing', async () => {
    store.createList({
      name: 'Morning',
      color: '#5B8DEF',
      reminder: { dailyEnabled: true, dailyTime: '09:00', dueDateEnabled: false },
    });

    const smtpSender = {
      isConfigured: () => true,
      sendMail: async () => ({ sent: true }),
    };

    const result = await runReminders({
      todoStore: store,
      smtpSender,
      now: chicagoAt(9, 0),
    });
    assert.equal(result.ran, false);
    assert.equal(result.reason, 'no_recipient');
  });

  it('marks a send only after SMTP succeeds', async () => {
    store.updateSettings({ reminderEmail: 'me@example.com' });
    const list = store.createList({
      name: 'Morning',
      color: '#5B8DEF',
      reminder: { dailyEnabled: true, dailyTime: '09:00', dueDateEnabled: false },
    });
    store.addItem(list.id, { text: 'Coffee' });

    let calls = 0;
    const failing = {
      isConfigured: () => true,
      sendMail: async () => {
        calls += 1;
        return { sent: false, reason: 'boom' };
      },
    };

    const now = chicagoAt(9, 0);
    const failed = await runReminders({ todoStore: store, smtpSender: failing, now });
    assert.equal(failed.sent, 0);
    assert.equal(selectPendingReminders(store, now).length, 1);

    const succeeding = {
      isConfigured: () => true,
      sendMail: async () => {
        calls += 1;
        return { sent: true };
      },
    };

    const ok = await runReminders({ todoStore: store, smtpSender: succeeding, now });
    assert.equal(ok.sent, 1);
    assert.equal(selectPendingReminders(store, now).length, 0);
    assert.equal(calls, 2);
  });

  it('builds an email with unchecked items', () => {
    const list = store.createList({ name: 'Pack', color: '#5B8DEF' });
    store.addItem(list.id, { text: 'Socks' });
    const email = buildReminderEmail(store.getList(list.id), 'daily');
    assert.match(email.subject, /Pack/);
    assert.match(email.text, /Socks/);
  });
});
