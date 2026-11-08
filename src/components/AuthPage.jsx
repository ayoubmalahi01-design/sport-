import React, { useState, useEffect } from 'react';
import { isAuthAvailable, signIn, requestPasswordReset, updatePassword, signUpRequest, listInstitutions } from '../services/auth.service.js';

export default function AuthPage({ onAuthed, flash }) {
  const [mode, setMode] = useState('login'); // login | reset | update | signup
  const [fullName, setFullName] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [requestedRole, setRequestedRole] = useState('coach');
  const [institutions, setInstitutions] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const available = isAuthAvailable();
  useEffect(() => { if (available) listInstitutions().then(setInstitutions).catch(() => {}); }, [available]);

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    const res = await signIn(email.trim(), password);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    if (!res.profile) { setError('الملف الشخصي غير موجود — تواصل مع المسؤول'); return; }
    onAuthed(res.user, res.profile);
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    const res = await signUpRequest(email.trim(), password, fullName.trim(), institutionId, requestedRole);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setInfo('تم إرسال طلب الحساب. بانتظار موافقة المسؤول. يمكنك تسجيل الدخول بعد الموافقة.');
    setMode('login');
  }

  async function handleReset(e) {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    const res = await requestPasswordReset(email.trim(), window.location.origin);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setInfo('تم إرسال رابط إعادة تعيين كلمة المرور إلى البريد (إن وُجد).');
  }

  async function handleUpdate(e) {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    const res = await updatePassword(newPassword);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setInfo('تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.');
    setMode('login');
  }

  // Password recovery: Supabase sets session from URL hash; allow updating password
  const isRecovery = typeof window !== 'undefined' && window.location.hash.includes('type=recovery');

  return (
    <div className="app-shell" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <section className="panel" style={{ maxWidth: 420, width: '100%' }}>
        <div className="panel-head"><div><h2>SPORT PERFORMANCE — تسجيل الدخول</h2><p>أدخل بيانات حسابك (مسؤول أو مدرب)</p></div></div>

        {!available && (
          <div className="privacy-banner" style={{ marginBottom: 10 }}>
            <span>Supabase غير مُعد. وضع المصادقة غير متاح. Configure VITE_SUPABASE_URL/ANON_KEY في .env.</span>
          </div>
        )}

        {isRecovery && mode !== 'update' && (
          <div className="action-row" style={{ marginBottom: 8 }}>
            <button className="btn btn-ghost" onClick={() => setMode('update')}>تعيين كلمة مرور جديدة</button>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <label>البريد الإلكتروني<input type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={!available || loading} /></label>
            <label>كلمة المرور<input type="password" value={password} onChange={e => setPassword(e.target.value)} required disabled={!available || loading} /></label>
            {error && <div className="status bad" style={{ marginTop: 6 }}>{error}</div>}
            {info && <div className="status good" style={{ marginTop: 6 }}>{info}</div>}
            <div className="action-row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={!available || loading}>{loading ? 'جارٍ...' : 'دخول'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setMode('reset'); setError(''); setInfo(''); }} disabled={!available || loading}>نسيت كلمة المرور؟</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setMode('signup'); setError(''); setInfo(''); }} disabled={!available || loading}>طلب حساب جديد</button>
            </div>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignup}>
            <label>الاسم الكامل<input value={fullName} onChange={e => setFullName(e.target.value)} required disabled={!available || loading} /></label>
            <label>البريد الإلكتروني<input type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={!available || loading} /></label>
            <label>كلمة المرور<input type="password" value={password} onChange={e => setPassword(e.target.value)} required disabled={!available || loading} /></label>
            <label>المؤسسة<select value={institutionId} onChange={e => setInstitutionId(e.target.value)} required disabled={!available || loading}>
              <option value="">— اختر المؤسسة —</option>
              {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select></label>
            <label>نوع الحساب<select value={requestedRole} onChange={e => setRequestedRole(e.target.value)} disabled={!available || loading}>
              <option value="coach">مدرب</option>
              <option value="institution_staff">موظف إدارة</option>
            </select></label>
            {error && <div className="status bad" style={{ marginTop: 6 }}>{error}</div>}
            {info && <div className="status good" style={{ marginTop: 6 }}>{info}</div>}
            <div className="action-row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={!available || loading}>{loading ? 'جارٍ...' : 'إرسال طلب'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>رجوع</button>
            </div>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleReset}>
            <label>البريد الإلكتروني<input type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={!available || loading} /></label>
            {error && <div className="status bad" style={{ marginTop: 6 }}>{error}</div>}
            {info && <div className="status good" style={{ marginTop: 6 }}>{info}</div>}
            <div className="action-row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={!available || loading}>{loading ? 'جارٍ...' : 'إرسال رابط'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>رجوع</button>
            </div>
          </form>
        )}

        {mode === 'update' && (
          <form onSubmit={handleUpdate}>
            <label>كلمة المرور الجديدة<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required disabled={!available || loading} /></label>
            {error && <div className="status bad" style={{ marginTop: 6 }}>{error}</div>}
            {info && <div className="status good" style={{ marginTop: 6 }}>{info}</div>}
            <div className="action-row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={!available || loading}>{loading ? 'جارٍ...' : 'تحديث'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>رجوع</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
