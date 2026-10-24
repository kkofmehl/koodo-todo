const { randomUUID } = require('crypto');
const config = require('./config');

const COOKIE_NAME = 'koodo_device';

function parseCookies(header) {
  if (!header || typeof header !== 'string') return {};
  return header.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function getDeviceTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  return typeof token === 'string' && token ? token : null;
}

function setDeviceCookie(res, deviceToken) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(deviceToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${config.DEVICE_COOKIE_MAX_AGE_SEC}`,
  ];

  if (config.COOKIE_SECURE) {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearDeviceCookie(res) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (config.COOKIE_SECURE) {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function createDeviceToken() {
  return randomUUID();
}

module.exports = {
  COOKIE_NAME,
  parseCookies,
  getDeviceTokenFromRequest,
  setDeviceCookie,
  clearDeviceCookie,
  createDeviceToken,
};
