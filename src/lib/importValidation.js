import { STUDENT_SYNONYMS, RESULT_SYNONYMS, autoMap, STUDENT_REQUIRED } from './importMapping.js';

function normCode(v) { return String(v == null ? '' : v).trim(); }
function normName(v) { return String(v == null ? '' : v).trim(); }
function normGroup(v) { const s = String(v == null ? '' : v).trim(); return s === '' ? null : s; }

export function validateStudents(rows, mapping, existingCodes) {
  // rows: array of arrays (parsed table). mapping: {code, name, group} -> column index or -1
  const existing = new Set((existingCodes || []).map(c => String(c).trim().toLowerCase()));
  const seen = new Set();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === '')) { out.push({ rowIndex: i, status: 'skipped', reason: 'empty row', raw: r }); continue; }
    const code = normCode(mapping.code >= 0 ? r[mapping.code] : '');
    const name = normName(mapping.name >= 0 ? r[mapping.name] : '');
    const group = normGroup(mapping.group >= 0 ? r[mapping.group] : '');
    const reasons = [];
    let status = 'valid';
    if (code === '') { reasons.push('missing code'); status = 'error'; }
    if (name === '') { reasons.push('missing name'); status = 'error'; }
    if (code !== '') {
      const key = code.toLowerCase();
      if (seen.has(key)) { reasons.push('duplicate code in batch'); status = 'error'; }
      if (existing.has(key)) { reasons.push('student already exists'); status = 'error'; }
      seen.add(key);
    }
    // same name different code warning
    out.push({ rowIndex: i, status, reason: reasons.join('; ') || (group === null ? 'missing group (warning)' : ''), code, name, group, raw: r,
      warning: group === null ? 'missing group' : null });
  }
  // fix status for warnings
  for (const o of out) {
    if (o.status === 'valid' && o.warning) o.status = 'warning';
  }
  return out;
}

export function validateResultsLong(rows, mapping, existingKeys, studentsByCode, enabledTests, activeBarmeFn) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === '')) { out.push({ rowIndex: i, status: 'skipped', reason: 'empty row', raw: r }); continue; }
    const code = normCode(mapping.code >= 0 ? r[mapping.code] : '');
    const testName = String(mapping.test >= 0 ? r[mapping.test] : '').trim();
    const rawVal = mapping.raw >= 0 ? r[mapping.raw] : '';
    const date = mapping.date >= 0 ? String(r[mapping.date] || '').trim() : '';
    const reasons = [];
    let status = 'valid';
    // student match
    const student = studentsByCode[code.toLowerCase()];
    if (code === '') { reasons.push('missing code'); status = 'error'; }
    else if (!student) { reasons.push('unmatched student code'); status = 'error'; }
    // test
    if (testName === '') { reasons.push('missing test'); status = 'error'; }
    else if (!enabledTests.includes(testName)) { reasons.push('test not enabled'); status = 'error'; }
    // raw
    const num = Number(String(rawVal).trim().replace(',', '.'));
    if (rawVal === '' || rawVal == null) { reasons.push('missing value'); status = 'error'; }
    else if (isNaN(num)) { reasons.push('invalid numeric value'); status = 'error'; }
    // date
    let normDate = date;
    if (date === '') normDate = new Date().toISOString().slice(0, 10);
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date) && !/^\d{1,2}-\d{1,2}-\d{4}$/.test(date)) {
      // maybe excel serial
      if (/^\d+$/.test(date) && Number(date) > 40000) { reasons.push('unsupported date format (excel serial)'); status = 'error'; }
      else {
        // try parse
        const d = new Date(date);
        if (isNaN(d.getTime())) { reasons.push('invalid date'); status = 'error'; }
        else normDate = d.toISOString().slice(0, 10);
      }
    } else {
      // convert dd/mm/yyyy or dd-mm-yyyy
      const m1 = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      const m2 = date.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (m1) normDate = `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
      else if (m2) normDate = `${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
    }
    // duplicate within batch / db
    const key = `${code.toLowerCase()}|${testName}|${normDate}`;
    if (code && testName) {
      if (seen.has(key)) { reasons.push('duplicate in batch'); status = 'error'; }
      if (existingKeys && existingKeys.has(key.toLowerCase())) { reasons.push('result already exists'); status = 'error'; }
      seen.add(key);
    }
    // barme
    const barme = activeBarmeFn ? activeBarmeFn(testName) : null;
    const rawOnly = !barme;

    out.push({
      rowIndex: i, status, reason: reasons.join('; '), code, studentId: student ? student.id : null,
      testName, raw: rawVal, num, date: normDate, key, barme, rawOnly, rawValues: r
    });
  }
  // warnings for raw-only
  for (const o of out) {
    if (o.status === 'valid' && o.rawOnly) o.status = 'warning';
  }
  return out;
}

export function validateResultsWide(rows, mapping, existingKeys, studentsByCode, enabledTests, activeBarmeFn, selectedTests) {
  // mapping: code, date, and testColumns: {colIndex: testName}
  const out = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c === '')) { out.push({ rowIndex: i, status: 'skipped', reason: 'empty row', raw: r, cells: [] }); continue; }
    const code = normCode(mapping.code >= 0 ? r[mapping.code] : '');
    const dateRaw = mapping.date >= 0 ? String(r[mapping.date] || '').trim() : '';
    let normDate = dateRaw === '' ? new Date().toISOString().slice(0, 10) : dateRaw;
    // convert
    const m1 = normDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const m2 = normDate.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m1) normDate = `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
    else if (m2) normDate = `${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;

    const student = studentsByCode[code.toLowerCase()];
    const cells = [];
    for (const colIdx of Object.keys(mapping.testColumns || {})) {
      const testName = mapping.testColumns[colIdx];
      const rawVal = r[colIdx];
      if (rawVal === '' || rawVal == null) continue; // skip empty cells
      const reasons = [];
      let status = 'valid';
      if (code === '') { reasons.push('missing code'); status = 'error'; }
      else if (!student) { reasons.push('unmatched student code'); status = 'error'; }
      if (!enabledTests.includes(testName)) { reasons.push('test not enabled'); status = 'error'; }
      const num = Number(String(rawVal).trim().replace(',', '.'));
      if (isNaN(num)) { reasons.push('invalid numeric value'); status = 'error'; }
      const key = `${code.toLowerCase()}|${testName}|${normDate}`;
      if (seen.has(key)) { reasons.push('duplicate in batch'); status = 'error'; }
      if (existingKeys && existingKeys.has(key.toLowerCase())) { reasons.push('result already exists'); status = 'error'; }
      seen.add(key);
      const barme = activeBarmeFn ? activeBarmeFn(testName) : null;
      const rawOnly = !barme;
      if (status === 'valid' && rawOnly) status = 'warning';
      cells.push({ rowIndex: i, status, reason: reasons.join('; '), code, studentId: student ? student.id : null, testName, raw: rawVal, num, date: normDate, key, barme, rawOnly });
    }
    out.push({ rowIndex: i, code, date: normDate, student, cells, raw: r });
  }
  return out;
}