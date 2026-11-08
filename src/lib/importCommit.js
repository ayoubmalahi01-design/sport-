import { getAll, put, putMany } from './db.js';
import { uuid } from './ids.js';
import { scoreWithBarme } from './barmeEngine.js';

function nowIso() { return new Date().toISOString(); }

async function writeAudit(entry) {
  await put('audit_log', { id: uuid(), ...entry, at: nowIso() });
}

async function writeImportBatch(batch) {
  await put('import_batches', batch);
}

async function writeUndo(undo) {
  await put('undo_batches', undo);
}

// Students: insert only
export async function commitStudentsBatch(validRows, meta) {
  const insertedIds = [];
  const students = [];
  for (const r of validRows) {
    const rec = {
      id: r.code,
      uid: uuid(),
      name: r.name,
      age: '—',
      group: r.group || 'المجموعة A',
      status: 'نشط',
      attendance: 100,
      average: '—',
      last: new Date().toISOString().slice(0, 10),
      student_code: r.code,
      full_name: r.name,
      group_name: r.group || 'المجموعة A',
      institution_id: 'local',
      created_via: 'bulk_import',
      source_import_batch_id: null,
      created_at: nowIso(),
      updated_at: nowIso(),
      deleted_at: null,
      origin_device: 'local',
      sync_state: 'local_only',
      schema_version: 1,
    };
    students.push(rec);
  }

  const batchId = uuid();
  for (const s of students) s.source_import_batch_id = batchId;
  const undoId = uuid();

  // atomic-ish: write all
  await putMany('students', students);

  const batch = {
    id: batchId,
    type: 'students',
    institution_id: 'local',
    created_by: 'admin',
    source: meta.source || 'clipboard',
    created_at: nowIso(),
    device_id: 'local',
    status: 'committed',
    mapping: meta.mapping || {},
    counts: {
      total: meta.total || validRows.length,
      valid: validRows.length,
      warning: meta.warning || 0,
      error: meta.error || 0,
      duplicate: meta.duplicate || 0,
      inserted: students.length,
      excluded: (meta.total || validRows.length) - validRows.length,
    },
    report: meta.report || [],
    duplicate_keys: meta.duplicateKeys || [],
    affected_ids: students.map(s => s.id),
    undo_snapshot_id: undoId,
    audit_id: null,
  };
  await writeImportBatch(batch);

  await writeUndo({
    id: undoId,
    batch_id: batchId,
    kind: 'students_import',
    inserted_ids: students.map(s => s.id),
    prior_records: [],
    created_at: nowIso(),
    status: 'available',
  });

  await writeAudit({
    id: uuid(),
    action: 'bulk_students_import',
    detail: `Inserted ${students.length} students (batch ${batchId})`,
    by: 'مدير المؤسسة',
  });

  // mirror localStorage for UI
  try {
    const cur = JSON.parse(localStorage.getItem('sp_students') || '[]');
    localStorage.setItem('sp_students', JSON.stringify([...cur, ...students.map(s => ({
      id: s.id, name: s.name, age: s.age, group: s.group, status: s.status,
      attendance: s.attendance, average: s.average, last: s.last
    }))]));
  } catch {}

  return { batchId, inserted: students.length, undoId };
}

export async function undoStudentsBatch(batchId) {
  const batches = await getAll('import_batches');
  const batch = batches.find(b => b.id === batchId);
  if (!batch) return { success: false, error: 'batch not found' };
  const undos = await getAll('undo_batches');
  const undo = undos.find(u => u.batch_id === batchId);
  if (!undo || undo.status !== 'available') return { success: false, error: 'undo not available' };

  // soft-delete inserted students
  for (const id of undo.inserted_ids) {
    await (async () => {
      const rec = (await getAll('students')).find(s => s.id === id);
      if (rec) {
        rec.deleted_at = new Date().toISOString();
        rec.updated_at = new Date().toISOString();
        rec.sync_state = 'pending';
        await put('students', rec);
      }
    })();
  }
  // remove from localStorage
  try {
    const cur = JSON.parse(localStorage.getItem('sp_students') || '[]');
    const set = new Set(undo.inserted_ids);
    localStorage.setItem('sp_students', JSON.stringify(cur.filter(s => !set.has(s.id))));
  } catch {}

  undo.status = 'used';
  await put('undo_batches', undo);
  batch.status = 'undone';
  await put('import_batches', batch);

  await writeAudit({
    id: uuid(),
    action: 'undo_students_import',
    detail: `Undid batch ${batchId} (${undo.inserted_ids.length} students)`,
    by: 'مدير المؤسسة',
  });
  return { success: true, removed: undo.inserted_ids.length };
}

// Results: insert only. raw-only allowed with null score.
export async function commitResultsBatch(validCells, meta) {
  const results = [];
  for (const c of validCells) {
    const barme = c.barme || null;
    const scoring = barme ? scoreWithBarme(c.num, barme) : { score: null, match: null };
    const rawOnly = !barme;
    const rec = {
      id: uuid(),
      uid: uuid(),
      student_id: c.studentId,
      student_code: c.code,
      test_id: c.testName,
      test_name: c.testName,
      result_date: c.date,
      raw_value: c.num,
      raw: c.raw,
      score: rawOnly ? null : scoring.score,
      converted_score: rawOnly ? null : scoring.score,
      score_match: rawOnly ? null : scoring.match,
      score_status: rawOnly ? 'raw_only_no_barme' : 'computed',
      barme_version_id: barme ? barme.id : null,
      barme_name: barme ? (barme.name || barme.test_type) : null,
      barme_version: barme ? (barme.version || 1) : null,
      scoring_checked_at: new Date().toISOString(),
      source_import_batch_id: null,
      institution_id: 'local',
      created_at: nowIso(),
      updated_at: nowIso(),
      deleted_at: null,
      origin_device: 'local',
      sync_state: 'local_only',
      schema_version: 1,
    };
    results.push(rec);
  }

  const batchId = uuid();
  for (const r of results) r.source_import_batch_id = batchId;
  const undoId = uuid();

  await putMany('test_results', results);

  const batch = {
    id: batchId,
    type: 'test_results',
    institution_id: 'local',
    created_by: 'admin',
    source: meta.source || 'clipboard',
    created_at: nowIso(),
    device_id: 'local',
    status: 'committed',
    mapping: meta.mapping || {},
    counts: {
      total: meta.total || validCells.length,
      valid: validCells.length,
      warning: meta.warning || 0,
      error: meta.error || 0,
      duplicate: meta.duplicate || 0,
      inserted: results.length,
      excluded: (meta.total || validCells.length) - validCells.length,
    },
    report: meta.report || [],
    duplicate_keys: meta.duplicateKeys || [],
    affected_ids: results.map(r => r.id),
    undo_snapshot_id: undoId,
    audit_id: null,
  };
  await writeImportBatch(batch);

  await writeUndo({
    id: undoId,
    batch_id: batchId,
    kind: 'results_import',
    inserted_ids: results.map(r => r.id),
    prior_records: [],
    created_at: nowIso(),
    status: 'available',
  });

  // audit per raw-only
  const rawOnlyCount = results.filter(r => r.score_status === 'raw_only_no_barme').length;
  await writeAudit({
    id: uuid(),
    action: 'bulk_results_import',
    detail: `Inserted ${results.length} results (batch ${batchId}); raw-only: ${rawOnlyCount}`,
    by: 'مدير المؤسسة',
  });
  if (rawOnlyCount > 0) {
    await writeAudit({
      id: uuid(),
      action: 'result.raw_only_saved',
      detail: `${rawOnlyCount} results saved without active BARÈME; score=null (batch ${batchId})`,
      by: 'مدير المؤسسة',
    });
  }

  // mirror localStorage
  try {
    const cur = JSON.parse(localStorage.getItem('sp_test_entries') || '[]');
    const mapped = results.map(r => ({ id: r.id, student: r.student_id, test: r.test_name, raw: r.raw_value, date: r.result_date, score: r.score, barme_version_id: r.barme_version_id }));
    localStorage.setItem('sp_test_entries', JSON.stringify([...cur, ...mapped]));
  } catch {}

  return { batchId, inserted: results.length, undoId, rawOnlyCount };
}

export async function undoResultsBatch(batchId) {
  const batches = await getAll('import_batches');
  const batch = batches.find(b => b.id === batchId);
  if (!batch) return { success: false, error: 'batch not found' };
  const undos = await getAll('undo_batches');
  const undo = undos.find(u => u.batch_id === batchId);
  if (!undo || undo.status !== 'available') return { success: false, error: 'undo not available' };

  for (const id of undo.inserted_ids) {
    const rec = (await getAll('test_results')).find(r => r.id === id);
    if (rec) {
      rec.deleted_at = new Date().toISOString();
      rec.updated_at = new Date().toISOString();
      rec.sync_state = 'pending';
      await put('test_results', rec);
    }
  }
  try {
    const cur = JSON.parse(localStorage.getItem('sp_test_entries') || '[]');
    const set = new Set(undo.inserted_ids);
    localStorage.setItem('sp_test_entries', JSON.stringify(cur.filter(e => !set.has(e.id))));
  } catch {}

  undo.status = 'used';
  await put('undo_batches', undo);
  batch.status = 'undone';
  await put('import_batches', batch);

  await writeAudit({
    id: uuid(),
    action: 'undo_results_import',
    detail: `Undid batch ${batchId} (${undo.inserted_ids.length} results)`,
    by: 'مدير المؤسسة',
  });
  return { success: true, removed: undo.inserted_ids.length };
}