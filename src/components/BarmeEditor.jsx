import React, { useState, useEffect } from 'react';
import { getBarmes, saveBarmes, activateBarme, validateBarme } from '../services/barme.service.js';

export default function BarmeEditor({ flash }) {
  const [barmes, setBarmes] = useState([]);
  const [name, setName] = useState('');
  const [testType, setTestType] = useState('Pompes');
  const [direction, setDirection] = useState('higher');
  const [rows, setRows] = useState([{ raw: '', score: '' }]);
  const [editing, setEditing] = useState(null);

  useEffect(() => { setBarmes(getBarmes()); }, []);

  function refresh() { setBarmes(getBarmes()); }

  function addRow() { setRows([...rows, { raw: '', score: '' }]); }
  function removeRow(i) { setRows(rows.filter((_, idx) => idx !== i)); }
  function updateRow(i, field, val) {
    const next = [...rows];
    next[i] = { ...next[i], [field]: val };
    setRows(next);
  }

  function save() {
    if (!name.trim()) { flash('أدخل اسم BARÈME'); return; }
    const thresholds = rows.map(r => ({ raw: Number(String(r.raw).replace(',', '.')), score: Number(r.score) }))
      .filter(t => !isNaN(t.raw) && !isNaN(t.score));
    if (thresholds.length === 0) { flash('أدخل عتبات صحيحة'); return; }
    const all = getBarmes();
    const rec = {
      id: editing || ('barme-' + Date.now()),
      name: name.trim(),
      test_type: testType,
      institution_id: 'local',
      direction,
      thresholds,
      isActive: false,
      status: 'draft',
      version: editing ? (all.find(b => b.id === editing)?.version || 0) + 1 : 1,
      created_at: new Date().toISOString(),
    };
    // structuredConfiguration for compat
    rec.structuredConfiguration = { higherIsBetter: direction === 'higher', thresholds, categories: [], valueType: 'discrete', scaleType: null };
    rec.analysis = { structuredConfig: rec.structuredConfiguration, ambiguities: {} };
    const idx = all.findIndex(b => b.id === rec.id);
    if (idx >= 0) all[idx] = rec; else all.push(rec);
    saveBarmes(all);
    setEditing(null);
    setName(''); setRows([{ raw: '', score: '' }]);
    refresh();
    flash('تم حفظ BARÈME');
  }

  function activate(id) {
    const r = activateBarme(id);
    if (r && r.success) { refresh(); flash('تم تفعيل BARÈME'); }
    else flash('فشل التفعيل');
  }

  function validate(id) {
    const r = validateBarme(id);
    if (r && r.success) { refresh(); flash('تم التحقق من BARÈME'); }
    else flash((r && r.error) || 'فشل التحقق');
  }

  return (
    <section className="panel">
      <div className="panel-head"><div><h2>محرر BARÈME</h2><p>إنشاء/تفعيل سلم التقييم (بدون استيفاء)</p></div></div>
      <div className="settings-grid">
        <label>الاسم<input value={name} onChange={e => setName(e.target.value)} placeholder="BARÈME Pompes"/></label>
        <label>الاختبار<select value={testType} onChange={e => setTestType(e.target.value)}>
          <option>Pompes</option><option>Abdominaux</option><option>Barre fixe</option><option>Test Navette - Léger 20m</option>
        </select></label>
        <label>الاتجاه<select value={direction} onChange={e => setDirection(e.target.value)}>
          <option value="higher">أعلى = أفضل</option>
          <option value="lower">أقل = أفضل</option>
        </select></label>
      </div>
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table><thead><tr><th>القيمة (raw)</th><th>النتيجة</th><th></th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td><input value={r.raw} onChange={e => updateRow(i, 'raw', e.target.value)} /></td>
            <td><input value={r.score} onChange={e => updateRow(i, 'score', e.target.value)} /></td>
            <td><button className="tiny-btn absent" onClick={() => removeRow(i)}>حذف</button></td>
          </tr>
        ))}</tbody></table>
      </div>
      <div className="action-row" style={{ marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={addRow}>+ عتبة</button>
        <button className="btn btn-primary" onClick={save}>حفظ BARÈME</button>
      </div>

      <h3 style={{ marginTop: 16 }}>BARÈMEs المحفوظة</h3>
      <div className="table-wrap">
        <table><thead><tr><th>الاسم</th><th>الاختبار</th><th>الاتجاه</th><th>العتبات</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>{barmes.map(b => (
          <tr key={b.id}>
            <td>{b.name}</td><td>{b.test_type}</td><td>{b.direction === 'higher' ? 'أعلى أفضل' : 'أقل أفضل'}</td>
            <td>{(b.thresholds || []).length}</td>
            <td>{b.isActive ? 'مفعّل' : (b.status || 'مسودة')}</td>
            <td className="action-row">
              <button className="tiny-btn present" onClick={() => activate(b.id)}>تفعيل</button>
              <button className="tiny-btn" onClick={() => validate(b.id)}>تحقق</button>
              <button className="tiny-btn" onClick={() => { setEditing(b.id); setName(b.name); setTestType(b.test_type); setDirection(b.direction); setRows(b.thresholds.map(t => ({ raw: t.raw, score: t.score }))); }}>تعديل</button>
            </td>
          </tr>
        ))}</tbody></table>
      </div>
    </section>
  );
}