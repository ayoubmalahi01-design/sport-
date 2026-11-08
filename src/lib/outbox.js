import { getAll, put } from './db.js';
import { uuid } from './ids.js';

const SYNC_MODE_KEY = 'sp_sync_mode'; // disabled | local-harness | test-project | production

export function getSyncMode() {
  try { return localStorage.getItem(SYNC_MODE_KEY) || 'disabled'; } catch { return 'disabled'; }
}
export function setSyncMode(mode) {
  try { localStorage.setItem(SYNC_MODE_KEY, mode); } catch {}
}

export const PRODUCTION_APPROVED = false; // Gate P: never flipped at runtime

export function isProductionApproved() { return PRODUCTION_APPROVED === true; }

export async function enqueueOutbox(record) {
  const item = {
    id: uuid(),
    ...record,
    created_at: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  };
  await put('outbox', item);
  return item;
}

export async function listOutbox() { return getAll('outbox'); }

export async function quarantine(item, reason) {
  await put('quarantine', {
    id: item.id || uuid(),
    ...item,
    reason,
    quarantined_at: new Date().toISOString(),
    status: 'quarantined',
  });
}