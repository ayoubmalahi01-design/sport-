// Local-first IndexedDB foundation
// Primary local database. Supabase is optional and never required to open the app.
const DB_NAME = 'sport_performance';
const DB_VERSION = 1;
const STORES = [
  'students','attendance','test_results','tests','sessions','coach_notes',
  'injuries','measurements','infrastructure','institutions','profiles',
  'barme_families','barme_versions','audit_log','outbox','conflicts',
  'quarantine','sync_meta','import_batches','undo_batches','trash','meta'
];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => { /* keep waiting */ };
  });
  return dbPromise;
}

function tx(store, mode) {
  return openDB().then(db => db.transaction(store, mode).objectStore(store));
}

export async function getAll(store) {
  const os = await tx(store, 'readonly');
  return new Promise((resolve, reject) => {
    const req = os.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function get(store, id) {
  const os = await tx(store, 'readonly');
  return new Promise((resolve, reject) => {
    const req = os.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, record) {
  const os = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = os.put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putMany(store, records) {
  if (!records || records.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    for (const r of records) os.put(r);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function softDelete(store, id) {
  const rec = await get(store, id);
  if (!rec) return false;
  rec.deleted_at = new Date().toISOString();
  rec.updated_at = new Date().toISOString();
  rec.sync_state = 'pending';
  await put(store, rec);
  return true;
}

export async function hardClear(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const req = t.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const STORE_LIST = STORES;