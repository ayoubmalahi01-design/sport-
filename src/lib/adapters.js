// Adapters between app (local/IndexedDB) shapes and Supabase (DB) shapes.
// Pure functions; no network, no side effects.

const STATUS_AR_TO_DB = {
  'حاضر': 'present',
  'غائب': 'absent',
  'إعفاء': 'excused',
  'رخصة': 'permission',
  'واجب': 'duty',
  'present': 'present',
  'absent': 'absent',
  'excused': 'excused',
  'permission': 'permission',
  'duty': 'duty',
};
const STATUS_DB_TO_AR = {
  present: 'حاضر',
  absent: 'غائب',
  excused: 'إعفاء',
  permission: 'رخصة',
  duty: 'واجب',
};

const ABSENCE_AR_TO_DB = {
  'عادي': 'ordinary',
  'رخصة': 'permission',
  'إعفاء': 'exempt',
  'واجب': 'duty',
  'ordinary': 'ordinary',
  'permission': 'permission',
  'exempt': 'exempt',
  'duty': 'duty',
};

export function normalizeStatusToDb(v) {
  return STATUS_AR_TO_DB[String(v || '').trim()] || 'present';
}
export function normalizeStatusToApp(v) {
  return STATUS_DB_TO_AR[String(v || '').trim()] || v || 'حاضر';
}
export function normalizeAbsenceToDb(v) {
  return ABSENCE_AR_TO_DB[String(v || '').trim()] || null;
}
export function normalizeAbsenceToApp(v) {
  const rev = Object.fromEntries(Object.entries(ABSENCE_AR_TO_DB).map(([k, val]) => [val, k]));
  return rev[String(v || '').trim()] || v || '';
}

// --- Students ---
export function studentToDb(app, institutionId) {
  return {
    id: undefined, // let DB generate uuid; keep app code in student_code
    institution_id: institutionId || 'local',
    student_code: String(app.id || app.student_code || '').trim(),
    full_name: String(app.name || app.full_name || '').trim(),
    birth_date: app.birth_date || null,
    group_name: app.group || app.group_name || null,
    status: app.status || 'active',
    created_via: app.created_via || 'manual',
    source_import_batch_id: app.source_import_batch_id || null,
    deleted_at: app.deleted_at || null,
  };
}
export function studentFromDb(db) {
  return {
    id: db.student_code,
    uid: db.id,
    name: db.full_name,
    age: '—',
    group: db.group_name || 'المجموعة A',
    status: db.status || 'active',
    attendance: 100,
    average: '—',
    last: db.created_at ? String(db.created_at).slice(0, 10) : '',
    institution_id: db.institution_id,
    student_code: db.student_code,
    full_name: db.full_name,
    group_name: db.group_name,
    birth_date: db.birth_date,
    created_via: db.created_via,
    source_import_batch_id: db.source_import_batch_id,
    deleted_at: db.deleted_at,
    created_at: db.created_at,
    updated_at: db.updated_at,
  };
}

// --- Attendance ---
export function attendanceToDb(app, institutionId, recordedBy) {
  return {
    institution_id: institutionId || 'local',
    student_id: app.studentId || app.student_id, // adapter caller must resolve code->uuid
    attendance_date: app.date || app.attendance_date,
    status: normalizeStatusToDb(app.status),
    absence_reason: normalizeAbsenceToDb(app.reason || app.absence_reason),
    record_type: app.recordType || app.record_type || 'attendance',
    recorded_by: recordedBy || null,
  };
}
export function attendanceFromDb(db) {
  return {
    id: db.id,
    studentId: db.student_id,
    date: db.attendance_date,
    status: normalizeStatusToApp(db.status),
    reason: normalizeAbsenceToApp(db.absence_reason),
    recordType: db.record_type || 'attendance',
    by: db.recorded_by,
    institution_id: db.institution_id,
    created_at: db.created_at,
  };
}

// --- Test results ---
export function testResultToDb(app, institutionId, recordedBy, barme) {
  return {
    institution_id: institutionId || 'local',
    student_id: app.student_id || app.studentId, // caller resolves code->uuid
    test_id: app.test_id || null, // caller resolves test name->uuid
    test_name: app.test || app.test_name || null,
    result_date: app.date || app.result_date || null,
    recorded_at: app.date ? new Date(app.date).toISOString() : new Date().toISOString(),
    raw_value: app.raw != null ? Number(String(app.raw).replace(',', '.')) : (app.raw_value != null ? Number(app.raw_value) : null),
    converted_score: (app.score != null && app.score !== '') ? Number(app.score) : null,
    score_match: app.scoreMatch || app.score_match || null,
    score_status: app.score_status || (barme ? 'computed' : 'raw_only_no_barme'),
    barme_version_id: app.barme_version_id || app.barmeVersionId || null,
    barme_name: app.barme_name || app.barmeName || (barme ? barme.name : null),
    barme_version: app.barme_version || app.barmeVersion || (barme ? (barme.version || 1) : null),
    source_import_batch_id: app.source_import_batch_id || null,
    recorded_by: recordedBy || null,
  };
}
export function testResultFromDb(db) {
  return {
    id: db.id,
    student: db.student_id,
    student_code: db.student_code || null,
    test: db.test_name || db.test_id,
    test_id: db.test_id,
    raw: db.raw_value,
    score: db.converted_score,
    scoreMatch: db.score_match,
    score_status: db.score_status,
    barme_version_id: db.barme_version_id,
    barme_name: db.barme_name,
    barme_version: db.barme_version,
    date: db.result_date || (db.recorded_at ? String(db.recorded_at).slice(0, 10) : ''),
    institution_id: db.institution_id,
    source_import_batch_id: db.source_import_batch_id,
    created_at: db.created_at,
    updated_at: db.updated_at,
    deleted_at: db.deleted_at,
  };
}

// --- Coach notes ---
export function noteToDb(app, userId, institutionId) {
  return {
    id: undefined,
    owner_id: userId,
    institution_id: institutionId || null,
    title: app.title || (app.text ? String(app.text).slice(0, 40) : null),
    body: app.text || app.body || '',
  };
}
export function noteFromDb(db) {
  return {
    id: db.id,
    text: db.body,
    title: db.title,
    date: db.created_at ? new Date(db.created_at).toLocaleString('ar-TN') : '',
    owner_id: db.owner_id,
    institution_id: db.institution_id,
    created_at: db.created_at,
    updated_at: db.updated_at,
  };
}

// --- Audit log ---
export function auditToDb(app, institutionId, actorId, entityType, entityId) {
  return {
    institution_id: institutionId || null,
    actor_id: actorId || null,
    action: app.action || app.operation || 'action',
    entity_type: entityType || app.entity_type || 'unknown',
    entity_id: entityId || app.entity_id || null,
    old_value: app.old_value || app.oldValue || null,
    new_value: app.new_value || app.newValue || null,
    reason: app.detail || app.details || app.reason || null,
    device_id: app.device_id || null,
    batch_id: app.batch_id || null,
  };
}
export function auditFromDb(db) {
  return {
    id: db.id,
    action: db.action,
    detail: db.reason || (db.new_value ? JSON.stringify(db.new_value) : ''),
    by: db.actor_id,
    at: db.created_at ? new Date(db.created_at).toLocaleString('ar-TN') : '',
    institution_id: db.institution_id,
    entity_type: db.entity_type,
    entity_id: db.entity_id,
    old_value: db.old_value,
    new_value: db.new_value,
    reason: db.reason,
  };
}