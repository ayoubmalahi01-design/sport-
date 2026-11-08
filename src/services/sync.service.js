// Sync engine — local harness only. Production synchronization is hard-disabled.
import { getSyncMode, isProductionApproved } from '../lib/outbox.js';
import { getAll } from '../lib/db.js';
import { flushOutboxOnce, getSyncSummary, canSync } from '../lib/syncEngine.js';

export function getSyncStatus() {
  const mode = getSyncMode();
  return {
    mode,
    productionApproved: isProductionApproved(),
    enabled: mode !== 'disabled',
    production: mode === 'production' && isProductionApproved(),
  };
}

export async function flushOutbox() {
  const status = getSyncStatus();
  if (!status.enabled) return { flushed: 0, reason: 'disabled' };
  if (status.mode === 'production' && !isProductionApproved()) {
    return { flushed: 0, reason: 'production_not_approved' };
  }
  if (!canSync()) return { flushed: 0, reason: 'no_supabase_client' };
  return await flushOutboxOnce();
}

export async function getConflicts() { return getAll('conflicts'); }
export async function getQuarantine() { return getAll('quarantine'); }