import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('fast endpoint serves Tidal matches without waiting for Qobuz', async () => {
  const tidal = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: { items: [{ id: 573293, title: 'Without Me', artist: { name: 'Eminem' } }] } }));
  });
  tidal.listen(0, '127.0.0.1');
  await once(tidal, 'listening');
  const reserve = http.createServer();
  reserve.listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(port), ENABLE_TIDAL: 'true', ENABLE_AMAZON: 'false',
      TIDAL_API_URL: `http://127.0.0.1:${tidal.address().port}`, QOBUZ_SESSION_FILE: 'test-nonexistent-session.json' },
    stdio: 'ignore'
  });
  try {
    let response;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { response = await fetch(`http://127.0.0.1:${port}/search/fast?q=fixture&quality=lossless`); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert.ok(response, 'addon did not start');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.tracks.map(track => track.id), ['tidal:573293']);
  } finally {
    child.kill();
    await new Promise(resolve => tidal.close(resolve));
  }
});
