const { formatChicagoDateKey } = require('./time/chicago');

function isItemCompleted(item, list, now = new Date()) {
  if (!item || !item.completedOn) return false;
  if (list && list.daily) {
    return item.completedOn === formatChicagoDateKey(now);
  }
  return true;
}

function collectUncheckedLines(list, now = new Date()) {
  const lines = [];
  if (!list || !Array.isArray(list.items)) return lines;

  for (const item of list.items) {
    if (!isItemCompleted(item, list, now)) {
      lines.push(item.text);
    }
    for (const child of item.children || []) {
      if (!isItemCompleted(child, list, now)) {
        lines.push(`  - ${child.text}`);
      }
    }
  }
  return lines;
}

function countProgress(list, now = new Date()) {
  let total = 0;
  let done = 0;

  function visit(item) {
    total += 1;
    if (isItemCompleted(item, list, now)) done += 1;
  }

  for (const item of list.items || []) {
    visit(item);
    for (const child of item.children || []) {
      visit(child);
    }
  }

  return { total, done };
}

module.exports = {
  isItemCompleted,
  collectUncheckedLines,
  countProgress,
};
