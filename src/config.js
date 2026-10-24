const path = require('path');
require('./loadEnv');

function resolveCookieSecure() {
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (process.env.COOKIE_SECURE === 'true') return true;
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  return appUrl.startsWith('https://');
}

module.exports = {
  PORT: parseInt(process.env.PORT || '8080', 10),
  DATA_DIR: process.env.DATA_DIR || path.join(process.cwd(), 'data'),
  PIN: process.env.PIN || '0611',
  DEVICE_COOKIE_MAX_AGE_SEC: 365 * 24 * 60 * 60,
  COOKIE_SECURE: resolveCookieSecure(),
  APP_URL: process.env.APP_URL || 'http://localhost:8080',
  EMAIL_FROM: process.env.EMAIL_FROM || '',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '465', 10),
  SMTP_SECURE: process.env.SMTP_SECURE !== 'false',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  REMINDER_TICK_MS: parseInt(process.env.REMINDER_TICK_MS || '30000', 10),
  DUE_DATE_REMINDER_HOUR: 8,
  DUE_DATE_REMINDER_MINUTE: 0,
  LIST_COLORS: [
    '#5B8DEF',
    '#7C5CFC',
    '#E85D9A',
    '#F0594A',
    '#F5A524',
    '#2DD4A8',
    '#38BDF8',
    '#A78BFA',
  ],
  MAX_LIST_NAME_LENGTH: 80,
  MAX_ITEM_TEXT_LENGTH: 500,
};

module.exports.assertProductionPin = function assertProductionPin() {
  if (process.env.FLY_APP_NAME && !process.env.PIN) {
    throw new Error('PIN environment variable is required on Fly.io');
  }
};
