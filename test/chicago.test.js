const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatChicagoDateKey,
  getChicagoDateParts,
  parseTimeHHMM,
  isAtOrPastChicagoTime,
} = require('../src/time/chicago');

describe('Chicago time helpers', () => {
  it('formats a Chicago date key', () => {
    const key = formatChicagoDateKey(new Date('2026-06-15T18:00:00Z'));
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses HH:MM times', () => {
    assert.deepEqual(parseTimeHHMM('9:05'), { hour: 9, minute: 5 });
    assert.deepEqual(parseTimeHHMM('09:05'), { hour: 9, minute: 5 });
    assert.equal(parseTimeHHMM('25:00'), null);
    assert.equal(parseTimeHHMM('abc'), null);
  });

  it('detects when Chicago time is at or past a target', () => {
    const morning = new Date('2026-01-15T15:00:00Z'); // 09:00 Chicago (CST)
    const parts = getChicagoDateParts(morning);
    assert.equal(parts.hour, 9);
    assert.equal(isAtOrPastChicagoTime(morning, 9, 0), true);
    assert.equal(isAtOrPastChicagoTime(morning, 9, 1), false);
    assert.equal(isAtOrPastChicagoTime(morning, 8, 59), true);
  });
});
