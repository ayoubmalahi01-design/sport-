import React, { useState, useEffect } from 'react';
import { getConflicts, getQuarantine } from '../services/sync.service.js';

export default function ConflictCenter({ flash }) {
  const [conflicts, setConflicts] = useState([]);
  const [quarantine, setQuarantine] = useState([]);
  useEffect(() => {
    getConflicts().then(setConflicts).catch(() => {});
    getQuarantine().then(setQuarantine).catch(() => {});
  }, []);
  return (
    <section className="panel">
      <div className="panel-head"><div><h2>مركز التعارضات / الحجر</h2><p>الكتابة المرفوضة من الخادم محفوظة للمراجعة (لا حذف صامت)</p></div></div>
      <h3>تعارضات ({conflicts.length})</h3>
      <div className="table-wrap" style={{ maxHeight: 200, overflow: 'auto' }}>
        <table><thead><tr><th>id</th><th>السبب</th><th>البيانات</th></tr></thead>
        <tbody>{conflicts.length ? conflicts.map(c => <tr key={c.id}><td>{c.id}</td><td>{c.reason || '—'}</td><td><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(c)}</pre></td></tr>) : <tr><td colSpan={3}>لا توجد تعارضات</td></tr>}</tbody></table>
      </div>
      <h3 style={{ marginTop: 12 }}>محجور ({quarantine.length})</h3>
      <div className="table-wrap" style={{ maxHeight: 200, overflow: 'auto' }}>
        <table><thead><tr><th>id</th><th>السبب</th></tr></thead>
        <tbody>{quarantine.length ? quarantine.map(q => <tr key={q.id}><td>{q.id}</td><td>{q.reason || '—'}</td></tr>) : <tr><td colSpan={2}>لا توجد عناصر محجورة</td></tr>}</tbody></table>
      </div>
    </section>
  );
}