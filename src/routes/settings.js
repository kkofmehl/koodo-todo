const express = require('express');

function createSettingsRouter(todoStore) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ settings: todoStore.getSettings() });
  });

  router.patch('/', (req, res) => {
    const settings = todoStore.updateSettings(req.body || {});
    if (!settings) {
      return res.status(400).json({ error: 'Invalid settings' });
    }
    res.json({ settings });
  });

  return router;
}

module.exports = { createSettingsRouter };
