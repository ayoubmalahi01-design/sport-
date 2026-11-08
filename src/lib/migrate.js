import { getAll, put, putMany } from './db.js';

const FLAG_ID = 'sp_migrated_to_idb_v1';

const MAPPING = {
  'sp_students': 'students',
  'sp_attendance': 'attendance',
  'sp_private_notes': 'coach_notes',
  'sp_test_entries': 'test_results',
  'sp_audit': 'audit_log',
  'sp_sessions': 'sessions',
  'sp_barmes': 'barme_versions',
  'sp_injuries': 'injuries',
  'sp_measurements': 'measurements',
  'sp_institutions': 'institutions',
};

function nowIso() { return new Date().toISOString(); }

export async function backupLocalStorage() {
  try {
    const snapshot = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sp_')) snapshot[k] = localStorage.getItem(k);
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    localStorage.setItem('sp_backup_v2_' + ts, JSON.stringify(snapshot));
    return ts;
  } catch (e) {
    console.error('backupLocalStorage failed', e);
    return null;
  }
}

export async function migrateLocalStorage() {
  try {
    const meta = await getAll('meta');
    if (meta.some(m => m.id === FLAG_ID && m.done)) {
      return { skipped: true };
    }

    await backupLocalStorage();

    const counts = {};
    for (const [key, store] of Object.entries(MAPPING)) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) { counts[key] = 0; continue; }
        let arr;
        try { arr = JSON.parse(raw); } catch { counts[key] = 0; continue; }
        if (!Array.isArray(arr)) { counts[key] = 0; continue; }
        const existing = await getAll(store);
        if (existing.length > 0) { counts[key] = existing.length; continue; }

        const records = arr.map(r => ({
          ...r,
          id: r && r.id != null ? String(r.id) : crypto.randomUUID(),
          legacy_id: r && r.id != null ? r.id : null,
          institution_id: (r && r.institution_id) || 'local',
          owner_id: (r && r.owner_id) || null,
          created_at: (r && r.created_at) || nowIso(),
          updated_at: (r && r.updated_at) || nowIso(),
          deleted_at: (r && r.deleted_at) || null,
          origin_device: 'local',
          sync_state: 'local_only',
          schema_version: 1,
        }));
        await putMany(store, records);
        counts[key] = records.length;
      } catch (e) {
        console.error('migration error for', key, e);
        counts[key] = 0;
      }
    }

    await put('meta', { id: FLAG_ID, done: true, at: nowIso(), counts });
    return { done: true, counts };
  } catch (e) {
    console.error('migrateLocalStorage failed', e);
    return { done: false, error: String(e) };
  }
}