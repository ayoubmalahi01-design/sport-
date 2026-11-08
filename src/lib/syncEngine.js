// Sync engine — offline-first outbox flush with retry, quarantine, conflict handling.
// Production sync is hard-disabled (PRODUCTION_APPROVED = false).
import { getSyncMode, isProductionApproved, listOutbox, quarantine } from './outbox.js';
import { getSupabase } from './supabaseClient.js';
import { getAll, put } from './db.js';

const MAX_RETRIES = 5;

export function backoffMs(attempt) {
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}

export function canSync() {
  const mode = getSyncMode();
  if (mode === 'disabled') return false;
  if (mode === 'production' && !isProductionApproved()) return false;
  return !!getSupabase();
}

export async function processOutboxItem(item, sb) {
  if (!item || item.status === 'done' || item.status === 'quarantined') {
    return { action: 'skip', item };
  }
  if ((item.attempts || 0) >= MAX_RETRIES) {
    return { action: 'quarantine', reason: 'max_retries_exceeded', item };
  }
  const table = item.entity_type;
  if (!table) {
    return { action: 'retry', error: 'missing entity_type', item };
  }
  try {
    const { error } = await sb.from(table).upsert(item.payload || {});
    if (error) {
      const code = error.code || '';
      const msg = error.message || '';
      if (code === '42501' || /permission|policy|rls/i.test(msg)) {
        return { action: 'quarantine', reason: 'rls_rejected: ' + msg, item };
      }
      if (code === '23505' || /duplicate|unique/i.test(msg)) {
        return { action: 'conflict', reason: 'duplicate_key: ' + msg, item };
      }
      return { action: 'retry', error: msg, item };
    }
    return { action: 'flushed', item };
  } catch (e) {
    return { action: 'retry', error: String(e?.message || e), item };
  }
}

export async function flushOutboxOnce(sbOverride) {
  const sb = sbOverride || getSupabase();
  if (!sb) return { flushed: 0, quarantined: 0, conflicts: 0, reason: 'no_client' };
  if (!canSync() && !sbOverride) return { flushed: 0, quarantined: 0, conflicts: 0, reason: 'disabled' };
  const pending = await listOutbox();
  let flushed = 0, quarantined = 0, conflicts = 0;
  for (const item of pending) {
    const res = await processOutboxItem(item, sb);
    if (res.action === 'skip') continue;
    if (res.action === 'flushed') {
      await put('outbox', { ...item, status: 'done', attempts: (item.attempts || 0) + 1 });
      flushed++;
    } else if (res.action === 'quarantine') {
      await quarantine(item, res.reason);
      await put('outbox', { ...item, status: 'quarantined', attempts: (item.attempts || 0) + 1 });
      quarantined++;
    } else if (res.action === 'conflict') {
      await put('conflicts', {
        id: item.id,
        institution_id: item.institution_id || 'local',
        entity_type: item.entity_type,
        entity_id: item.entity_id || null,
        local_version: item.payload || {},
        server_version: null,
        reason: res.reason,
        status: 'open',
        created_at: new Date().toISOString(),
      });
      await put('outbox', { ...item, status: 'conflict', attempts: (item.attempts || 0) + 1 });
      conflicts++;
    } else {
      await put('outbox', { ...item, status: 'pending', attempts: (item.attempts || 0) + 1, last_error: res.error });
    }
  }
  return { flushed, quarantined, conflicts };
}

export async function getSyncSummary() {
  const pending = await getAll('outbox');
  const conflicts = await getAll('conflicts');
  const quarantined = await getAll('quarantine');
  return {
    pending: pending.filter((x) => x.status === 'pending').length,
    done: pending.filter((x) => x.status === 'done').length,
    conflict: pending.filter((x) => x.status === 'conflict').length + conflicts.length,
    quarantined: quarantined.length,
  };
}