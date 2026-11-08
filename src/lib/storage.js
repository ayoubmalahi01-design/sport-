import { putMany } from './db.js';

const KEY_TO_STORE = {
  sp_students: 'students',
  sp_attendance: 'attendance',
  sp_private_notes: 'coach_notes',
  sp_test_entries: 'test_results',
  sp_audit: 'audit_log',
  sp_sessions: 'sessions',
  sp_barmes: 'barme_versions',
  sp_injuries: 'injuries',
  sp_measurements: 'measurements',
};

export async function mirrorToIDB(key, val) {
  const store = KEY_TO_STORE[key];
  if (!store) return;
  let arr = val;
  if (!Array.isArray(arr)) {
    try { arr = JSON.parse(val); } catch { return; }
  }
  if (!Array.isArray(arr)) return;
  try {
    const records = arr.map(r => ({
      ...r,
      id: r && r.id != null ? String(r.id) : crypto.randomUUID(),
      institution_id: (r && r.institution_id) || 'local',
      updated_at: new Date().toISOString(),
      sync_state: (r && r.sync_state) || 'local_only',
      schema_version: (r && r.schema_version) || 1,
    }));
    await putMany(store, records);
  } catch (e) {
    console.error('mirrorToIDB failed', key, e);
  }
}