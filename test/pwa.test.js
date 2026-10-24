const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const express = require('express');

describe('PWA assets', () => {
  let server;
  let port;

  before(async () => {
    const app = express();
    const publicDir = path.join(__dirname, '..', 'public');
    app.use(express.static(publicDir, {
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function get(urlPath) {
    return new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: urlPath }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }).on('error', reject);
    });
  }

  it('serves the web app manifest with the correct content type', async () => {
    const res = await get('/manifest.webmanifest');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/manifest\+json/);
    const manifest = JSON.parse(res.body.toString('utf8'));
    assert.equal(manifest.name, 'Koodo Todo');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/');
    assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
    assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  });

  it('serves the service worker from the site root', async () => {
    const res = await get('/sw.js');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /javascript/);
    assert.equal(res.headers['service-worker-allowed'], '/');
    assert.match(res.body.toString('utf8'), /CACHE_VERSION/);
  });

  it('serves PWA icons', async () => {
    for (const iconPath of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png']) {
      const res = await get(iconPath);
      assert.equal(res.status, 200, iconPath);
      assert.match(res.headers['content-type'], /image\/png/);
      assert.ok(res.body.length > 100);
      assert.equal(res.body[0], 0x89);
      assert.equal(res.body[1], 0x50);
    }
  });

  it('includes PWA link tags in index.html', async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
    const html = res.body.toString('utf8');
    assert.match(html, /rel="manifest"/);
    assert.match(html, /apple-touch-icon/);
    assert.match(html, /apple-mobile-web-app-capable/);
  });

  it('registers a service worker from the client script', () => {
    const appJs = require('fs').readFileSync(
      path.join(__dirname, '..', 'public', 'js', 'app.js'),
      'utf8'
    );
    assert.match(appJs, /serviceWorker\.register\('\/sw\.js'\)/);
  });
});
