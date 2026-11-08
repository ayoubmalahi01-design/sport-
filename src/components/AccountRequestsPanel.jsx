import React, { useState, useEffect } from 'react';
import { listAccountRequests, approveAccount, rejectAccount, disableAccount, listInstitutions } from '../services/auth.service.js';
import { canApproveAccounts, isPlatformOwner, canManageInstitutions } from '../lib/perms.js';

export default function AccountRequestsPanel({ profile, flash }) {
  const [requests, setRequests] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(false);

  const role = profile?.role;
  const institutionId = profile?.institution_id;

  async function refresh() {
    setLoading(true);
    const instFilter = isPlatformOwner(role) ? null : institutionId;
    const reqs = await listAccountRequests(instFilter);
    setRequests(reqs);
    if (isPlatformOwner(role)) setInstitutions(await listInstitutions());
    setLoading(false);
  }
  useEffect(() => { refresh(); }, [role, institutionId]);

  async function approve(r) {
    const roleToAssign = r.requested_role === 'institution_admin' ? 'institution_admin' : r.requested_role;
    const perms = [];
    const res = await approveAccount(r.id, r.user_id, r.institution_id, roleToAssign, perms);
    if (res.error) flash('فشل الموافقة: ' + res.error); else { flash('تمت الموافقة'); refresh(); }
  }
  async function reject(r) {
    const reason = window.prompt('سبب الرفض:') || '';
    const res = await rejectAccount(r.id, reason);
    if (res.error) flash('فشل الرفض: ' + res.error); else { flash('تم الرفض'); refresh(); }
  }

  if (!canApproveAccounts(role)) return null;

  return (
    <section className="panel">
      <div className="panel-head"><div><h2>طلبات الحسابات (pending)</h2><p>موافقة/رفض الحسابات المعلّقة</p></div><button className="btn btn-ghost" onClick={refresh}>تحديث</button></div>
      {loading && <p>جارٍ التحميل...</p>}
      {!loading && requests.length === 0 && <div className="empty-state"><p>لا توجد طلبات معلّقة</p></div>}
      {requests.length > 0 && (
        <div className="table-wrap">
          <table><thead><tr><th>الاسم</th><th>البريد</th><th>المؤسسة</th><th>الدور المطلوب</th><th>إجراءات</th></tr></thead>
          <tbody>{requests.map(r => (
            <tr key={r.id}>
              <td>{r.full_name}</td>
              <td>{r.email || r.user_id}</td>
              <td>{r.institution_id}</td>
              <td>{r.requested_role}</td>
              <td className="action-row">
                <button className="tiny-btn present" onClick={() => approve(r)}>موافقة</button>
                <button className="tiny-btn absent" onClick={() => reject(r)}>رفض</button>
              </td>
            </tr>
          ))}</tbody></table>
        </div>
      )}

      {isPlatformOwner(role) && (
        <>
          <h3 style={{ marginTop: 16 }}>المؤسسات (platform owner)</h3>
          <div className="table-wrap">
            <table><thead><tr><th>المعرف</th><th>الاسم</th><th>الحالة</th></tr></thead>
            <tbody>{institutions.map(i => (
              <tr key={i.id}><td>{i.id}</td><td>{i.name}</td><td>{i.status || 'active'}</td></tr>
            ))}</tbody></table>
          </div>
        </>
      )}
    </section>
  );
}