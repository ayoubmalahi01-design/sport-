import test from 'node:test';
import assert from 'node:assert/strict';
import { backoffMs } from '../src/lib/syncEngine.js';

test('backoff increases and caps', () => {
  assert.equal(backoffMs(0), 1000);
  assert.equal(backoffMs(1), 2000);
  assert.ok(backoffMs(10) <= 30000);
});