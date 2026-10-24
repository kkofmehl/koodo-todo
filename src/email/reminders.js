const config = require('../config');
const {
  formatChicagoDateKey,
  getChicagoDateParts,
  parseTimeHHMM,
  isAtOrPastChicagoTime,
} = require('../time/chicago');
const { collectUncheckedLines } = require('../completion');
const { escapeHtml } = require('./smtpSender');

function reminderKey(listId, kind, dateKey) {
  return `${listId}:${kind}:${dateKey}`;
}

function buildReminderEmail(list, kind, now = new Date()) {
  const unchecked = collectUncheckedLines(list, now);
  const kindLabel = kind === 'due' ? 'Due today' : 'Daily reminder';
  const subject = `Koodo Todo — ${list.name} (${kindLabel})`;

  const lines = [
    `${kindLabel}: ${list.name}`,
    '',
  ];

  if (unchecked.length === 0) {
    lines.push('All items are checked off.');
  } else {
    lines.push('Unchecked items:');
    for (const line of unchecked) {
      lines.push(`- ${line}`);
    }
  }

  lines.push('', `Open Koodo Todo: ${config.APP_URL}`);

  const text = lines.join('\n');
  const htmlParts = [
    `<p><strong>${escapeHtml(kindLabel)}:</strong> ${escapeHtml(list.name)}</p>`,
  ];

  if (unchecked.length === 0) {
    htmlParts.push('<p>All items are checked off.</p>');
  } else {
    htmlParts.push('<p>Unchecked items:</p><ul>');
    for (const line of unchecked) {
      htmlParts.push(`<li>${escapeHtml(line.trim())}</li>`);
    }
    htmlParts.push('</ul>');
  }

  htmlParts.push(`<p><a href="${escapeHtml(config.APP_URL)}">Open Koodo Todo</a></p>`);

  return { subject, text, html: htmlParts.join('') };
}

function selectDueReminders(lists, now = new Date()) {
  const dateKey = formatChicagoDateKey(now);
  if (!isAtOrPastChicagoTime(now, config.DUE_DATE_REMINDER_HOUR, config.DUE_DATE_REMINDER_MINUTE)) {
    return [];
  }

  return lists.filter((list) => {
    if (list.deletedAt) return false;
    if (!list.reminder?.dueDateEnabled) return false;
    if (!list.dueDate) return false;
    return list.dueDate === dateKey;
  }).map((list) => ({
    list,
    kind: 'due',
    key: reminderKey(list.id, 'due', dateKey),
  }));
}

function selectDailyReminders(lists, now = new Date()) {
  const dateKey = formatChicagoDateKey(now);
  const parts = getChicagoDateParts(now);

  return lists.filter((list) => {
    if (list.deletedAt) return false;
    if (!list.reminder?.dailyEnabled) return false;
    const parsed = parseTimeHHMM(list.reminder.dailyTime);
    if (!parsed) return false;
    return isAtOrPastChicagoTime(now, parsed.hour, parsed.minute);
  }).map((list) => ({
    list,
    kind: 'daily',
    key: reminderKey(list.id, 'daily', dateKey),
    _hour: parts.hour,
  }));
}

function selectPendingReminders(todoStore, now = new Date()) {
  const lists = todoStore.state.lists;
  const candidates = [
    ...selectDueReminders(lists, now),
    ...selectDailyReminders(lists, now),
  ];

  return candidates.filter((candidate) => !todoStore.hasReminderSend(candidate.key));
}

async function runReminders({ todoStore, smtpSender, now = new Date() }) {
  const recipient = todoStore.getSettings().reminderEmail;
  if (!recipient) {
    return { ran: false, reason: 'no_recipient', sent: 0 };
  }

  if (!smtpSender.isConfigured()) {
    return { ran: false, reason: 'not_configured', sent: 0 };
  }

  const pending = selectPendingReminders(todoStore, now);
  let sent = 0;

  for (const candidate of pending) {
    const email = buildReminderEmail(candidate.list, candidate.kind, now);
    const result = await smtpSender.sendMail({
      to: recipient,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    if (result.sent) {
      todoStore.markReminderSend(candidate.key, now);
      sent += 1;
    }
  }

  return { ran: true, sent, pending: pending.length };
}

function startReminderScheduler({ todoStore, smtpSender, intervalMs = config.REMINDER_TICK_MS }) {
  const tick = () => {
    runReminders({ todoStore, smtpSender }).catch((err) => {
      console.error('Reminder tick failed:', err);
    });
  };

  tick();
  return setInterval(tick, intervalMs);
}

module.exports = {
  reminderKey,
  buildReminderEmail,
  selectDueReminders,
  selectDailyReminders,
  selectPendingReminders,
  runReminders,
  startReminderScheduler,
};
