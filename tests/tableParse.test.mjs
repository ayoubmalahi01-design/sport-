import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTable, detectDelimiter } from '../src/lib/tableParse.js';

test('parse tab-separated with header', () => {
  const rows = parseTable('code\tname\tgroup\nSP-1\tAlice\tA\nSP-2\tBob\tB');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ['code', 'name', 'group']);
  assert.deepEqual(rows[1], ['SP-1', 'Alice', 'A']);
});

test('parse quoted CSV with comma', () => {
  const rows = parseTable('code,name\n"SP,1","Alice, A"');
  assert.deepEqual(rows[1], ['SP,1', 'Alice, A']);
});

test('preserves leading zeros', () => {
  const rows = parseTable('001\tName');
  assert.equal(rows[0][0], '001');
});

test('detectDelimiter tab', () => {
  assert.equal(detectDelimiter('a\tb\nc\td'), '\t');
});