const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const {
  getDeviceTokenFromRequest,
  setDeviceCookie,
  clearDeviceCookie,
  createDeviceToken,
} = require('../deviceCookie');

function createAuthRouter(todoStore) {
  const router = express.Router();

  const unlockLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.get('/session', (req, res) => {
    const deviceToken = getDeviceTokenFromRequest(req);
    if (!deviceToken) {
      return res.status(401).json({ error: 'No saved session' });
    }

    const device = todoStore.findDevice(deviceToken);
    if (!device) {
      clearDeviceCookie(res);
      return res.status(401).json({ error: 'Saved session expired' });
    }

    todoStore.touchDevice(deviceToken);
    res.json({ ok: true });
  });

  router.post('/unlock', unlockLimiter, (req, res) => {
    const { pin } = req.body || {};
    if (pin !== config.PIN) {
      return res.status(403).json({ error: 'Invalid PIN' });
    }

    const deviceToken = createDeviceToken();
    todoStore.registerDevice(deviceToken);
    setDeviceCookie(res, deviceToken);
    res.json({ ok: true });
  });

  router.post('/lock', (req, res) => {
    const deviceToken = getDeviceTokenFromRequest(req);
    if (deviceToken) {
      todoStore.removeDevice(deviceToken);
    }
    clearDeviceCookie(res);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAuthRouter };
