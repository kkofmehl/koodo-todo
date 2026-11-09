const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TodoStore } = require('../src/store/todoStore');
const { createListsRouter } = require('../src/routes/lists');

describe('Lists reorder API', () => {
  let server;
  let port;
  let tmpDir;
  let todoStore;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'koodo-lists-'));
    todoStore = new TodoStore(tmpDir);
    todoStore.init();

    const app = express();
    app.use(express.json());
    app.use('/api/lists', createListsRouter(todoStore));

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await todoStore.writeQueue;
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function request(method, urlPath, body) {
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
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => {
            resolve({
              status: res.statusCode,
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

  it('saves a new active-list order', async () => {
    const first = todoStore.createList({ name: 'Alpha', color: '#5B8DEF' });
    const second = todoStore.createList({ name: 'Beta', color: '#7C5CFC' });
    const third = todoStore.createList({ name: 'Gamma', color: '#E85D9A' });

    const res = await request('POST', '/api/lists/reorder', {
      ids: [first.id, third.id, second.id],
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.lists.map((list) => list.name), ['Alpha', 'Gamma', 'Beta']);

    const listed = await request('GET', '/api/lists');
    assert.deepEqual(listed.body.lists.map((list) => list.id), [first.id, third.id, second.id]);
  });

  it('reorders items and places checked items after open ones', async () => {
    const list = todoStore.createList({ name: 'Tasks', color: '#5B8DEF' });
    const alpha = todoStore.addItem(list.id, { text: 'Alpha' });
    const beta = todoStore.addItem(list.id, { text: 'Beta' });
    const gamma = todoStore.addItem(list.id, { text: 'Gamma' });
    const child = todoStore.addSubItem(list.id, alpha.id, { text: 'Child' });

    const reordered = await request('POST', `/api/lists/${list.id}/items/reorder`, {
      ids: [gamma.id, alpha.id, beta.id],
    });
    assert.equal(reordered.status, 200);
    assert.deepEqual(reordered.body.list.items.map((item) => item.text), ['Gamma', 'Alpha', 'Beta']);

    const childOrder = await request('POST', `/api/lists/${list.id}/items/${alpha.id}/subitems/reorder`, {
      ids: [child.id],
    });
    assert.equal(childOrder.status, 200);

    const checked = await request('PATCH', `/api/lists/${list.id}/items/${alpha.id}`, {
      completed: true,
    });
    assert.equal(checked.status, 200);
    assert.deepEqual(checked.body.list.items.map((item) => item.text), ['Gamma', 'Beta', 'Alpha']);

    const unchecked = await request('PATCH', `/api/lists/${list.id}/items/${alpha.id}`, {
      completed: false,
    });
    assert.deepEqual(unchecked.body.list.items.map((item) => item.text), ['Gamma', 'Beta', 'Alpha']);

    const rejected = await request('POST', `/api/lists/${list.id}/items/reorder`, {
      ids: [gamma.id],
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error, 'Invalid item order');
  });

  it('rejects an incomplete order', async () => {
    const first = todoStore.createList({ name: 'Alpha', color: '#5B8DEF' });
    todoStore.createList({ name: 'Beta', color: '#7C5CFC' });

    const res = await request('POST', '/api/lists/reorder', { ids: [first.id] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid list order');
  });
});
