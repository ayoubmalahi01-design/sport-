import test from 'node:test';
import assert from 'node:assert/strict';
import { processOutboxItem } from '../src/lib/syncEngine.js';

function mockClient(handler) {
  return { from: () => ({ upsert: async (p) => handler(p) }) };
}

test('processOutboxItem flushes on success', async () => {
  const sb = mockClient(async () => ({ error: null }));
  const item = { id: '1', entity_type: 'students', payload: { id: 's1' }, attempts: 0, status: 'pending' };
  const r = await processOutboxItem(item, sb);
  assert.equal(r.action, 'flushed');
});

test('processOutboxItem quarantines on RLS error', async () => {
  const sb = mockClient(async () => ({ error: { code: '42501', message: 'permission denied' } }));
  const item = { id: '2', entity_type: 'students', payload: {}, attempts: 0, status: 'pending' };
  const r = await processOutboxItem(item, sb);
  assert.equal(r.action, 'quarantine');
});

test('processOutboxItem detects conflict on duplicate', async () => {
  const sb = mockClient(async () => ({ error: { code: '23505', message: 'duplicate key' } }));
  const item = { id: '3', entity_type: 'students', payload: {}, attempts: 0, status: 'pending' };
  const r = await processOutboxItem(item, sb);
  assert.equal(r.action, 'conflict');
});

test('processOutboxItem retries on transient error', async () => {
  const sb = mockClient(async () => ({ error: { code: '500', message: 'server error' } }));
  const item = { id: '4', entity_type: 'students', payload: {}, attempts: 0, status: 'pending' };
  const r = await processOutboxItem(item, sb);
  assert.equal(r.action, 'retry');
});

test('processOutboxItem quarantines after max retries', async () => {
  const sb = mockClient(async () => ({ error: null }));
  const item = { id: '5', entity_type: 'students', payload: {}, attempts: 5, status: 'pending' };
  const r = await processOutboxItem(item, sb);
  assert.equal(r.action, 'quarantine');
  assert.equal(r.reason, 'max_retries_exceeded');
});

test('processOutboxItem skips done items', async () => {
  const sb = mockClient(async () => ({ error: null }));
  const item = { id: '6', entity_type: 'students', payload: {}, attempts: 0, status: 'done' };
  const r = await processOutboxItem(item, sb);
  assert.equal(r.action, 'skip');
});