const path = require('path');
const express = require('express');
const config = require('./config');
const { assertProductionPin } = require('./config');
const { TodoStore } = require('./store/todoStore');
const { createAuthRouter } = require('./routes/auth');
const { createListsRouter } = require('./routes/lists');
const { createSettingsRouter } = require('./routes/settings');
const { createRequireAuth } = require('./middleware/auth');
const { createSmtpSender } = require('./email/smtpSender');
const { startReminderScheduler } = require('./email/reminders');

assertProductionPin();

const todoStore = new TodoStore(config.DATA_DIR);
todoStore.init();

const smtpSender = createSmtpSender();
const requireAuth = createRequireAuth(todoStore);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.webmanifest')) {
      res.setHeader('Content-Type', 'application/manifest+json');
    }
    if (filePath.endsWith(`${path.sep}sw.js`) || filePath.endsWith('/sw.js')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Service-Worker-Allowed', '/');
    }
  },
}));


app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', createAuthRouter(todoStore));
app.use('/api/lists', requireAuth, createListsRouter(todoStore));
app.use('/api/settings', requireAuth, createSettingsRouter(todoStore));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const server = app.listen(config.PORT, () => {
  console.log(`Koodo Todo listening on port ${config.PORT}`);
});

const reminderTimer = startReminderScheduler({ todoStore, smtpSender });

function shutdown() {
  clearInterval(reminderTimer);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server, todoStore };
