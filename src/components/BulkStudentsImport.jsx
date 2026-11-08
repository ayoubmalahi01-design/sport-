import React, { useState, useMemo } from 'react';
import { parseTable, hasHeaderRow } from '../lib/tableParse.js';
import { autoMap, STUDENT_SYNONYMS } from '../lib/importMapping.js';
import { validateStudents } from '../lib/importValidation.js';
import { commitStudentsBatch, undoStudentsBatch } from '../lib/importCommit.js';

export default function BulkStudentsImport({ students, setStudents, flash }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState({ code: -1, name: -1, group: -1 });
  const [validated, setValidated] = useState(null);
  const [lastBatch, setLastBatch] = useState(null);

  const existingCodes = useMemo(() => students.map(s => s.id || s.student_code), [students]);
  const headers = hasHeader && rows.length ? rows[0] : null;
  const dataRows = hasHeader && rows.length ? rows.slice(1) : rows;

  function doParse() {
    const r = parseTable(text);
    setRows(r);
    if (r.length) {
      const h = hasHeaderRow(r);
      setHasHeader(h);
      const hdr = h ? r[0] : r[0].map((_, i) => `Col ${i + 1}`);
      setMapping(autoMap(hdr, STUDENT_SYNONYMS));
    }
    setValidated(null);
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result || '')); };
    reader.readAsText(f);
  }

  function validate() {
    const hdr = hasHeader && rows.length ? rows[0] : rows[0]?.map((_, i) => `Col ${i + 1}`);
    const dr = hasHeader && rows.length ? rows.slice(1) : rows;
    const m = { ...mapping };
    // ensure indices relative to data rows? mapping based on header row columns (same)
    const v = validateStudents(dr, m, existingCodes);
    setValidated(v);
  }

  const counts = useMemo(() => {
    if (!validated) return null;
    const c = { total: validated.length, valid: 0, warning: 0, error: 0, duplicate: 0 };
    for (const r of validated) {
      if (r.status === 'valid') c.valid++;
      else if (r.status === 'warning') c.warning++;
      else if (r.status === 'error') { c.error++; if (/duplicate|already exists/.test(r.reason)) c.duplicate++; }
    }
    return c;
  }, [validated]);

  async function commit() {
    if (!validated) return;
    const validRows = validated.filter(r => r.status === 'valid' || r.status === 'warning')
      .map(r => ({ code: r.code, name: r.name, group: r.group }));
    if (validRows.length === 0) { flash('لا توجد صفوف صالحة'); return; }
    const dupCount = validated.filter(r => r.status === 'error').length;
    const report = validated.filter(r => r.status !== 'valid').map(r => ({ row: r.rowIndex + 1, status: r.status, reason: r.reason, raw: r.raw }));
    const res = await commitStudentsBatch(validRows, {
      source: 'clipboard', total: validated.length, warning: counts.warning, error: counts.error,
      duplicate: counts.duplicate, mapping, report, duplicateKeys: []
    });
    setLastBatch(res.batchId);
    // update UI students
    const fresh = JSON.parse(localStorage.getItem('sp_students') || '[]');
    setStudents(fresh);
    flash(`تم استيراد ${res.inserted} تلميذ (دفعة ${res.batchId.slice(0,8)})`);
    setValidated(null); setText(''); setRows([]);
  }

  async function undo() {
    if (!lastBatch) return;
    const r = await undoStudentsBatch(lastBatch);
    if (r.success) {
      const fresh = JSON.parse(localStorage.getItem('sp_students') || '[]');
      setStudents(fresh);
      flash(`تم التراجع: ${r.removed} تلميذ`);
      setLastBatch(null);
    } else flash(r.error);
  }

  return (
    <section className="panel">
      <div className="panel-head"><div><h2>استيراد جماعي للتلاميذ (Excel/TSV/CSV)</h2><p>نسخ من Excel ولصق مباشرة. إدراج فقط — لا تحديث، لا حذف.</p></div></div>

      <label>لصق البيانات<textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder="رقم\tالاسم\tالقسم" style={{ width: '100%' }}/></label>
      <div className="action-row" style={{ marginTop: 6 }}>
        <button className="btn btn-primary" onClick={doParse}>تحليل</button>
        <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>رفع CSV/TSV<input type="file" accept=".csv,.tsv,.txt" onChange={onFile} style={{ display: 'none' }}/></label>
        <label><input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} /> صف عنوان</label>
      </div>

      {rows.length > 0 && (
        <>
          <h3 style={{ marginTop: 10 }}>ربط الأعمدة</h3>
          <div className="settings-grid">
            {['code', 'name', 'group'].map(f => (
              <label key={f}>{f === 'code' ? 'الرقم' : f === 'name' ? 'الاسم' : 'القسم'}
                <select value={mapping[f]} onChange={e => setMapping({ ...mapping, [f]: Number(e.target.value) })}>
                  <option value={-1}>— تجاهل —</option>
                  {(hasHeader ? rows[0] : rows[0].map((_, i) => `Col ${i + 1}`)).map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="action-row" style={{ marginTop: 6 }}>
            <button className="btn btn-primary" onClick={validate}>معاينة/تحقق</button>
          </div>
        </>
      )}

      {validated && (
        <>
          <div className="attendance-summary" style={{ marginTop: 10 }}>
            <span>الإجمالي: {counts.total}</span>
            <span className="status good">صالح: {counts.valid}</span>
            <span className="status pending">تحذير: {counts.warning}</span>
            <span className="status bad">خطأ: {counts.error}</span>
            <span>مكرر: {counts.duplicate}</span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 260, overflow: 'auto', marginTop: 6 }}>
            <table><thead><tr><th>#</th><th>الحالة</th><th>الرقم</th><th>الاسم</th><th>القسم</th><th>السبب</th></tr></thead>
            <tbody>{validated.map((r, i) => (
              <tr key={i}>
                <td>{r.rowIndex + 1}</td>
                <td className={r.status === 'valid' ? 'status good' : r.status === 'warning' ? 'status pending' : 'status bad'}>{r.status}</td>
                <td>{r.code || '—'}</td>
                <td>{r.name || '—'}</td>
                <td>{r.group || '—'}</td>
                <td>{r.reason || r.warning || ''}</td>
              </tr>
            ))}</tbody></table>
          </div>
          <div className="action-row" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={commit} disabled={counts.valid + counts.warning === 0}>
              استيراد {counts.valid + counts.warning} صف صالح
            </button>
          </div>
        </>
      )}

      {lastBatch && (
        <div className="action-row" style={{ marginTop: 8 }}>
          <button className="btn btn-danger" onClick={undo}>تراجع عن آخر استيراد ({lastBatch.slice(0,8)})</button>
        </div>
      )}
    </section>
  );
}