import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreWithBarme } from '../src/lib/barmeEngine.js';

const barme = { direction: 'higher', thresholds: [{ raw: 10, score: 5 }, { raw: 20, score: 10 }, { raw: 30, score: 15 }] };

test('exact match', () => {
  assert.deepEqual(scoreWithBarme(20, barme), { score: 10, match: 'exact', raw: 20 });
});

test('nearest higher (no interpolation)', () => {
  const r = scoreWithBarme(15, barme);
  assert.equal(r.score, 10);
  assert.equal(r.match, 'nearest_higher');
});

test('clamp low', () => {
  const r = scoreWithBarme(5, barme);
  assert.equal(r.score, 5);
  assert.equal(r.match, 'clamped');
});

test('clamp high', () => {
  const r = scoreWithBarme(100, barme);
  assert.equal(r.score, 15);
  assert.equal(r.match, 'clamped');
});

test('no barme -> null', () => {
  assert.equal(scoreWithBarme(10, null).score, null);
});

test('invalid raw -> null', () => {
  assert.equal(scoreWithBarme('abc', barme).score, null);
});