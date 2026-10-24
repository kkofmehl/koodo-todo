const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('../src/config');
const { TodoStore } = require('../src/store/todoStore');
const { createAuthRouter } = require('../src/routes/auth');
const { createRequireAuth } = require('../src/middleware/auth');
const { COOKIE_NAME } = require('../src/deviceCookie');

describe('Auth API', () => {
  let server;
  let port;
  let tmpDir;
  let todoStore;
  let originalPin;

  beforeEach(async () => {
    originalPin = config.PIN;
    config.PIN = '1234';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'koodo-auth-'));
    todoStore = new TodoStore(tmpDir);
    todoStore.init();

    const app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(todoStore));
    app.get('/api/protected', createRequireAuth(todoStore), (req, res) => {
      res.json({ ok: true, token: req.deviceToken });
    });

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    config.PIN = originalPin;
    await todoStore.writeQueue;
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function request(method, urlPath, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: urlPath,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            ...headers,
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: raw ? JSON.parse(raw) : null,
            });
          });
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  function extractCookie(setCookieHeader) {
    const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    if (!header) return null;
    const match = header.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  it('rejects an invalid PIN', async () => {
    const res = await request('POST', '/api/auth/unlock', { pin: '0000' });
    assert.equal(res.status, 403);
  });

  it('unlocks with the correct PIN and sets a device cookie', async () => {
    const res = await request('POST', '/api/auth/unlock', { pin: '1234' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    const token = extractCookie(res.headers['set-cookie']);
    assert.ok(token);
    assert.ok(todoStore.findDevice(token));
  });

  it('restores a session from the device cookie', async () => {
    const unlock = await request('POST', '/api/auth/unlock', { pin: '1234' });
    const token = extractCookie(unlock.headers['set-cookie']);

    const session = await request('GET', '/api/auth/session', null, {
      Cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    });
    assert.equal(session.status, 200);
    assert.equal(session.body.ok, true);
  });

  it('allows protected routes with a valid cookie', async () => {
    const unlock = await request('POST', '/api/auth/unlock', { pin: '1234' });
    const token = extractCookie(unlock.headers['set-cookie']);

    const protectedRes = await request('GET', '/api/protected', null, {
      Cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    });
    assert.equal(protectedRes.status, 200);
  });

  it('rejects protected routes without a cookie', async () => {
    const res = await request('GET', '/api/protected');
    assert.equal(res.status, 401);
  });

  it('locks and clears the device cookie', async () => {
    const unlock = await request('POST', '/api/auth/unlock', { pin: '1234' });
    const token = extractCookie(unlock.headers['set-cookie']);

    const lock = await request('POST', '/api/auth/lock', null, {
      Cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    });
    assert.equal(lock.status, 200);
    assert.equal(todoStore.findDevice(token), null);

    const session = await request('GET', '/api/auth/session', null, {
      Cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    });
    assert.equal(session.status, 401);
  });
});
