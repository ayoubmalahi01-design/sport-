import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatusToDb, normalizeStatusToApp, studentToDb, studentFromDb, testResultToDb, testResultFromDb, noteToDb, noteFromDb, auditToDb, auditFromDb } from '../src/lib/adapters.js';

test('normalizeStatusToDb maps Arabic to English', () => {
  assert.equal(normalizeStatusToDb('حاضر'), 'present');
  assert.equal(normalizeStatusToDb('غائب'), 'absent');
  assert.equal(normalizeStatusToDb('إعفاء'), 'excused');
  assert.equal(normalizeStatusToDb('present'), 'present');
});

test('normalizeStatusToApp maps English to Arabic', () => {
  assert.equal(normalizeStatusToApp('present'), 'حاضر');
  assert.equal(normalizeStatusToApp('absent'), 'غائب');
});

test('student round-trip preserves code', () => {
  const app = { id: 'SP-001', name: 'أحمد', group: 'A', status: 'active' };
  const db = studentToDb(app, 'inst-1');
  assert.equal(db.student_code, 'SP-001');
  assert.equal(db.full_name, 'أحمد');
  const back = studentFromDb({ ...db, id: 'uuid-1', created_at: '2026-01-01T00:00:00Z' });
  assert.equal(back.id, 'SP-001');
  assert.equal(back.name, 'أحمد');
});

test('testResult round-trip preserves raw/score/barme', () => {
  const app = { student_id: 'uuid-1', test: 'Pompes', raw: '12', score: 8, scoreMatch: 'exact', barme_version_id: 'bv-1', barme_name: 'P', barme_version: 2, date: '2026-01-02' };
  const db = testResultToDb(app, 'inst-1', 'user-1', { name: 'P', version: 2 });
  assert.equal(db.raw_value, 12);
  assert.equal(db.converted_score, 8);
  assert.equal(db.result_date, '2026-01-02');
  assert.equal(db.score_status, 'computed');
  const back = testResultFromDb({ ...db, id: 'r-1' });
  assert.equal(back.raw, 12);
  assert.equal(back.score, 8);
  assert.equal(back.barme_version_id, 'bv-1');
});

test('testResult raw-only has null score', () => {
  const app = { student_id: 'u', test: 'Pompes', raw: '5', date: '2026-01-02' };
  const db = testResultToDb(app, 'inst', 'u', null);
  assert.equal(db.converted_score, null);
  assert.equal(db.score_status, 'raw_only_no_barme');
});

test('note round-trip preserves text and owner', () => {
  const app = { text: 'ملاحظة خاصة', title: 'م' };
  const db = noteToDb(app, 'user-1', 'inst-1');
  assert.equal(db.body, 'ملاحظة خاصة');
  assert.equal(db.owner_id, 'user-1');
  const back = noteFromDb({ ...db, id: 'n-1', created_at: '2026-01-01T00:00:00Z' });
  assert.equal(back.text, 'ملاحظة خاصة');
});

test('auditToDb requires entity_type and institution', () => {
  const db = auditToDb({ action: 'test', detail: 'd' }, 'inst-1', 'actor-1', 'student', 's-1');
  assert.equal(db.institution_id, 'inst-1');
  assert.equal(db.actor_id, 'actor-1');
  assert.equal(db.entity_type, 'student');
  assert.equal(db.entity_id, 's-1');
  assert.equal(db.reason, 'd');
});