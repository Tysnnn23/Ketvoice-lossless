import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEarly } from '../src/search-fast.js';

const later = (value, ms) => new Promise(resolve => setTimeout(() => resolve(value), ms));

test('a slow provider does not hold up an available match', async () => {
  const started = Date.now();
  const result = await collectEarly([later([{ id: 'fast' }], 10), later([{ id: 'slow' }], 200)], 100, 10);
  assert.deepEqual(result.tracks, [{ id: 'fast' }]);
  assert.ok(Date.now() - started < 150);
  assert.deepEqual(await result.complete, [{ id: 'fast' }, { id: 'slow' }]);
});

test('failure and empty results do not hide a working provider', async () => {
  const result = await collectEarly([Promise.reject(new Error('unavailable')), Promise.resolve([]), later([{ id: 'ok' }], 10)], 100, 5);
  assert.deepEqual(result.tracks, [{ id: 'ok' }]);
  assert.deepEqual(await result.complete, [{ id: 'ok' }]);
});

test('no available result returns an empty partial result within the budget', async () => {
  const result = await collectEarly([later([{ id: 'late' }], 100)], 10, 5);
  assert.deepEqual(result.tracks, []);
  assert.deepEqual(await result.complete, [{ id: 'late' }]);
});
