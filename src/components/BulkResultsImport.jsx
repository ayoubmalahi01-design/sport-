import React, { useState, useMemo } from 'react';
import { parseTable, hasHeaderRow } from '../lib/tableParse.js';
import { autoMap, RESULT_SYNONYMS } from '../lib/importMapping.js';
import { validateResultsLong, validateResultsWide } from '../lib/importValidation.js';
import { commitResultsBatch, undoResultsBatch } from '../lib/importCommit.js';
import { getBarmes } from '../services/barme.service.js';

const TESTS = ['Pompes', 'Abdominaux', 'Barre fixe', 'Test Navette - Léger 20m'];

export default function BulkResultsImport({ students, flash }) {
  const [mode, setMode] = useState('selected'); // selected | long | wide
  const [selectedTest, setSelectedTest] = useState('Pompes');
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState({ code: -1, test: -1, raw: -1, date: -1 });
  const [testColumns, setTestColumns] = useState({}); // colIndex -> testName
  const [validated, setValidated] = useState(null); // array of rows/cells
  const [lastBatch, setLastBatch] = useState(null);

  const studentsByCode = useMemo(() => {
    const m = {};
    for (const s of students) m[String(s.id || s.student_code).trim().toLowerCase()] = s;
    return m;
  }, [students]);

  const enabledTests = TESTS;
  const activeBarmeFn = (testName) => {
    const barmes = getBarmes();
    return barmes.find(b => b.isActive && (b.test_type === testName || (b.name || '').includes(testName))) || barmes.find(b => b.isActive) || null;
  };

  const existingKeys = useMemo(() => {
    try {
      const entries = JSON.parse(localStorage.getItem('sp_test_entries') || '[]');
      return new Set(entries.map(e => `${e.student}|${e.test}|${e.date}`.toLowerCase()));
    } catch { return new Set(); }
  }, []);

  function doParse() {
    const r = parseTable(text);
    setRows(r);
    if (r.length) {
      const h = hasHeaderRow(r);
      setHasHeader(h);
      const hdr = h ? r[0] : r[0].map((_, i) => `Col ${i + 1}`);
      if (mode === 'wide') {
        const m = autoMap(hdr, RESULT_SYNONYMS);
        setMapping({ code: m.code ?? -1, test: -1, raw: -1, date: m.date ?? -1 });
        // default testColumns empty
        setTestColumns({});
      } else {
        setMapping(autoMap(hdr, RESULT_SYNONYMS));
      }
    }
    setValidated(null);
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(f);
  }

  function validate() {
    const dr = hasHeader && rows.length ? rows.slice(1) : rows;
    const hdr = hasHeader && rows.length ? rows[0] : rows[0]?.map((_, i) => `Col ${i + 1}`);
    if (mode === 'wide') {
      const v = validateResultsWide(dr, { code: mapping.code, date: mapping.date, testColumns }, existingKeys, studentsByCode, enabledTests, activeBarmeFn);
      setValidated({ type: 'wide', rows: v });
    } else if (mode === 'long') {
      const m = { ...mapping };
      if (m.test === -1) m.test = mapping.test;
      const v = validateResultsLong(dr, m, existingKeys, studentsByCode, enabledTests, activeBarmeFn);
      setValidated({ type: 'long', rows: v });
    } else {
      // selected: map raw->raw, date->date, code->code, test not in data
      const m = { code: mapping.code >= 0 ? mapping.code : 0, test: -1, raw: mapping.raw >= 0 ? mapping.raw : 1, date: mapping.date >= 0 ? mapping.date : -1 };
      // build rows with selectedTest injected by treating test column absent; validateResultsLong expects test column. We'll create a synthetic mapping by adding test as a constant via a wrapper.
      const syntheticRows = dr.map(r => {
        const arr = [...r];
        // insert selectedTest into a virtual column at end
        arr.push(selectedTest);
        return arr;
      });
      const testColIdx = syntheticRows[0].length - 1;
      const mm = { code: m.code, test: testColIdx, raw: m.raw, date: m.date };
      const v = validateResultsLong(syntheticRows, mm, existingKeys, studentsByCode, enabledTests, activeBarmeFn);
      setValidated({ type: 'selected', rows: v });
    }
  }

  // flatten validated cells
  const cells = useMemo(() => {
    if (!validated) return [];
    if (validated.type === 'wide') {
      const out = [];
      for (const r of validated.rows) for (const c of (r.cells || [])) out.push(c);
      return out;
    }
    return validated.rows.filter(r => r.status !== 'skipped');
  }, [validated]);

  const counts = useMemo(() => {
    const c = { total: cells.length, valid: 0, warning: 0, error: 0, duplicate: 0 };
    for (const r of cells) {
      if (r.status === 'valid') c.valid++;
      else if (r.status === 'warning') c.warning++;
      else if (r.status === 'error') { c.error++; if (/duplicate|already exists/.test(r.reason)) c.duplicate++; }
    }
    return c;
  }, [cells]);

  async function commit() {
    if (!cells.length) return;
    const validCells = cells.filter(c => c.status === 'valid' || c.status === 'warning')
      .map(c => ({ ...c }));
    if (validCells.length === 0) { flash('لا توجد صفوف صالحة'); return; }
    const report = cells.filter(c => c.status !== 'valid').map(c => ({ row: c.rowIndex + 1, status: c.status, reason: c.reason }));
    const res = await commitResultsBatch(validCells, {
      source: 'clipboard', total: cells.length, warning: counts.warning, error: counts.error,
      duplicate: counts.duplicate, mapping, report, duplicateKeys: []
    });
    setLastBatch(res.batchId);
    flash(`تم استيراد ${res.inserted} نتيجة (raw-only: ${res.rawOnlyCount}) دفعة ${res.batchId.slice(0,8)}`);
    setValidated(null); setText(''); setRows([]);
  }

  async function undo() {
    if (!lastBatch) return;
    const r = await undoResultsBatch(lastBatch);
    if (r.success) { flash(`تم التراجع: ${r.removed} نتيجة`); setLastBatch(null); }
    else flash(r.error);
  }

  // wide test column mapping UI
  function setTestCol(colIdx, testName) {
    setTestColumns(prev => {
      const next = { ...prev };
      if (testName === '') delete next[colIdx]; else next[colIdx] = testName;
      return next;
    });
  }
  // sync testColumns into mapping before validate
  function validateWide() {
    const m = { ...mapping, testColumns };
    // temporarily store
    setMapping(m);
    // call validate logic with testColumns
    const dr = hasHeader && rows.length ? rows.slice(1) : rows;
    const v = validateResultsWide(dr, { code: mapping.code, date: mapping.date, testColumns }, existingKeys, studentsByCode, enabledTests, activeBarmeFn);
    setValidated({ type: 'wide', rows: v });
  }

  const hdr = hasHeader && rows.length ? rows[0] : (rows[0] || []).map((_, i) => `Col ${i + 1}`);

  return (
    <section className="panel">
      <div className="panel-head"><div><h2>استيراد جماعي للنتائج (Excel/TSV/CSV)</h2><p>مطابقة برمز التلميذ. بدون استيفاء. score=null عند غياب BARÈME.</p></div></div>

      <div className="action-row" style={{ marginBottom: 8 }}>
        <label>الوضع<select value={mode} onChange={e => setMode(e.target.value)}>
          <option value="selected">اختبار محدد (code | raw | date)</option>
          <option value="long">طويل (code | test | raw | date)</option>
          <option value="wide">عريض (code | date | test1 | test2...)</option>
        </select></label>
        {mode === 'selected' && (
          <label>الاختبار<select value={selectedTest} onChange={e => setSelectedTest(e.target.value)}>
            {TESTS.map(t => <option key={t}>{t}</option>)}
          </select></label>
        )}
      </div>

      <label>لصق البيانات<textarea value={text} onChange={e => setText(e.target.value)} rows={6} style={{ width: '100%' }}/></label>
      <div className="action-row" style={{ marginTop: 6 }}>
        <button className="btn btn-primary" onClick={doParse}>تحليل</button>
        <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>رفع ملف<input type="file" accept=".csv,.tsv,.txt" onChange={onFile} style={{ display: 'none' }}/></label>
        <label><input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} /> صف عنوان</label>
      </div>

      {rows.length > 0 && mode !== 'wide' && (
        <>
          <h3 style={{ marginTop: 10 }}>ربط الأعمدة</h3>
          <div className="settings-grid">
            {['code', 'raw', 'date'].map(f => (
              <label key={f}>{f === 'code' ? 'الرمز' : f === 'raw' ? 'القيمة' : 'التاريخ'}
                <select value={mapping[f]} onChange={e => setMapping({ ...mapping, [f]: Number(e.target.value) })}>
                  <option value={-1}>— تجاهل/افتراضي —</option>
                  {hdr.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
            ))}
            {mode === 'long' && (
              <label>الاختبار<select value={mapping.test} onChange={e => setMapping({ ...mapping, test: Number(e.target.value) })}>
                <option value={-1}>— تجاهل —</option>
                {hdr.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select></label>
            )}
          </div>
          <div className="action-row" style={{ marginTop: 6 }}>
            <button className="btn btn-primary" onClick={validate}>معاينة/تحقق</button>
          </div>
        </>
      )}

      {rows.length > 0 && mode === 'wide' && (
        <>
          <h3 style={{ marginTop: 10 }}>ربط الأعمدة</h3>
          <div className="settings-grid">
            <label>الرمز<select value={mapping.code} onChange={e => setMapping({ ...mapping, code: Number(e.target.value) })}>
              <option value={-1}>—</option>{hdr.map((h, i) => <option key={i} value={i}>{h}</option>)}
            </select></label>
            <label>التاريخ<select value={mapping.date} onChange={e => setMapping({ ...mapping, date: Number(e.target.value) })}>
              <option value={-1}>— افتراضي اليوم —</option>{hdr.map((h, i) => <option key={i} value={i}>{h}</option>)}
            </select></label>
          </div>
          <h4 style={{ marginTop: 8 }}>أعمدة الاختبارات (ربط كل عمود)</h4>
          <div className="table-wrap">
            <table><thead><tr><th>العمود</th><th>الاختبار</th></tr></thead>
            <tbody>{hdr.map((h, i) => (
              <tr key={i}>
                <td>{h}</td>
                <td><select value={testColumns[i] || ''} onChange={e => setTestCol(i, e.target.value)}>
                  <option value="">— تجاهل —</option>
                  {TESTS.map(t => <option key={t} value={t}>{t}</option>)}
                </select></td>
              </tr>
            ))}</tbody></table>
          </div>
          <div className="action-row" style={{ marginTop: 6 }}>
            <button className="btn btn-primary" onClick={validateWide}>معاينة/تحقق</button>
          </div>
        </>
      )}

      {validated && (
        <>
          <div className="attendance-summary" style={{ marginTop: 10 }}>
            <span>الخلايا: {counts.total}</span>
            <span className="status good">صالحة: {counts.valid}</span>
            <span className="status pending">تحذير: {counts.warning}</span>
            <span className="status bad">خطأ: {counts.error}</span>
            <span>مكرر: {counts.duplicate}</span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 260, overflow: 'auto', marginTop: 6 }}>
            <table><thead><tr><th>#</th><th>الحالة</th><th>الرمز</th><th>الاختبار</th><th>القيمة</th><th>التاريخ</th><th>النتيجة</th><th>BARÈME</th><th>السبب</th></tr></thead>
            <tbody>{cells.map((c, i) => (
              <tr key={i}>
                <td>{c.rowIndex + 1}</td>
                <td className={c.status === 'valid' ? 'status good' : c.status === 'warning' ? 'status pending' : 'status bad'}>{c.status}</td>
                <td>{c.code}</td>
                <td>{c.testName}</td>
                <td>{c.raw}</td>
                <td>{c.date}</td>
                <td>{c.barme ? (c.num + ' → ' + (c.barme ? 'score' : '')) : '—'}</td>
                <td>{c.barme ? (c.barme.name || c.barme.test_type) + ' v' + (c.barme.version || 1) : 'لا يوجد (raw only)'}</td>
                <td>{c.reason || ''}</td>
              </tr>
            ))}</tbody></table>
          </div>
          <div className="action-row" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={commit} disabled={counts.valid + counts.warning === 0}>
              استيراد {counts.valid + counts.warning} نتيجة
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