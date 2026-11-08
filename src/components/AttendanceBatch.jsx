import React, { useState } from 'react';

export default function AttendanceBatch({ students, attendanceDate, setAttendance, flash }) {
  const [text, setText] = useState('');
  const [lastIds, setLastIds] = useState([]);

  function apply() {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { flash('أدخل بيانات'); return; }
    const records = JSON.parse(localStorage.getItem('sp_attendance') || '[]');
    const added = [];
    for (const line of lines) {
      const parts = line.split(/[\t,;]/).map(p => p.trim());
      const code = parts[0];
      const status = parts[1] || 'حاضر';
      const reason = parts[2] || '';
      const stu = students.find(s => s.id === code);
      if (!stu) { flash('رمز غير موجود: ' + code); continue; }
      const rec = { id: Date.now() + Math.random(), studentId: code, date: attendanceDate, status, reason, recordType: 'attendance', by: 'مدير المؤسسة' };
      records.unshift(rec);
      added.push(rec.id);
    }
    localStorage.setItem('sp_attendance', JSON.stringify(records));
    setAttendance(records);
    setLastIds(added);
    setText('');
    flash(`تم تسجيل ${added.length} حضور/غياب`);
  }

  function undo() {
    if (lastIds.length === 0) return;
    const set = new Set(lastIds);
    const records = JSON.parse(localStorage.getItem('sp_attendance') || '[]').filter(r => !set.has(r.id));
    localStorage.setItem('sp_attendance', JSON.stringify(records));
    setAttendance(records);
    setLastIds([]);
    flash('تم التراجع');
  }

  return (
    <section className="panel">
      <div className="panel-head"><div><h2>تسجيل حضور جماعي</h2><p>سطر لكل تلميذ: رمز [tab/فاصلة] حالة [tab/فاصلة] سبب. مثال: SP-001 حاضر</p></div></div>
      <label><textarea value={text} onChange={e => setText(e.target.value)} rows={6} style={{ width: '100%' }} placeholder="SP-001 حاضر&#10;SP-002 غائب مرض"/></label>
      <div className="action-row" style={{ marginTop: 6 }}>
        <button className="btn btn-primary" onClick={apply}>تطبيق</button>
        {lastIds.length > 0 && <button className="btn btn-danger" onClick={undo}>تراجع ({lastIds.length})</button>}
      </div>
    </section>
  );
}