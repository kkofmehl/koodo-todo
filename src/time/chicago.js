const CHICAGO_TZ = 'America/Chicago';

function getChicagoDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour === '24' ? '0' : lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function formatChicagoDateKey(date = new Date()) {
  const { year, month, day } = getChicagoDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseTimeHHMM(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function isAtOrPastChicagoTime(date, hour, minute) {
  const parts = getChicagoDateParts(date);
  if (parts.hour > hour) return true;
  if (parts.hour < hour) return false;
  return parts.minute >= minute;
}

module.exports = {
  CHICAGO_TZ,
  getChicagoDateParts,
  formatChicagoDateKey,
  parseTimeHHMM,
  isAtOrPastChicagoTime,
};
