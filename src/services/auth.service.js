// Authentication service — Supabase Auth + profile resolution.
// Never trust user_metadata for authorization; role/institution come from profiles table.
import { getSupabase } from '../lib/supabaseClient.js';

export const isAuthAvailable = () => !!getSupabase();

export async function getSession() {
  const sb = getSupabase();
  if (!sb) return { session: null, user: null };
  try {
    const { data } = await sb.auth.getSession();
    return { session: data?.session || null, user: data?.session?.user || null };
  } catch {
    return { session: null, user: null };
  }
}

export async function getProfile(userId) {
  const sb = getSupabase();
  if (!sb || !userId) return null;
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('id, institution_id, full_name, role, status, permissions')
      .eq('id', userId)
      .single();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

export async function signUpRequest(email, password, fullName, institutionId, requestedRole) {
  const sb = getSupabase();
  if (!sb) return { user: null, error: 'Supabase غير مُعد' };
  try {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return { user: null, error: error.message };
    const userId = data.user?.id;
    if (!userId) return { user: null, error: 'فشل إنشاء الحساب' };
    // Insert a pending account request (RLS allows self-insert)
    const { error: reqErr } = await sb.from('account_requests').insert({
      user_id: userId,
      institution_id: institutionId || null,
      requested_role: requestedRole || 'coach',
      full_name: fullName || email,
      status: 'pending',
    });
    if (reqErr) return { user: data.user, error: 'تم إنشاء الحساب لكن فشل طلب الانضمام: ' + reqErr.message };
    return { user: data.user, error: null };
  } catch (e) {
    return { user: null, error: String(e?.message || e) };
  }
}

export async function listInstitutions() {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data } = await sb.from('institutions').select('id, name, status').order('name');
    return data || [];
  } catch { return []; }
}

export async function listAccountRequests(institutionId) {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    let q = sb.from('account_requests').select('*').eq('status', 'pending');
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data } = await q.order('created_at', { ascending: false });
    return data || [];
  } catch { return []; }
}

export async function approveAccount(requestId, userId, institutionId, role, permissions) {
  const sb = getSupabase();
  if (!sb) return { error: 'Supabase غير مُعد' };
  try {
    // Upsert profile (admin RLS allows)
    const { error: pErr } = await sb.from('profiles').upsert({
      id: userId,
      institution_id: institutionId,
      full_name: (await sb.from('account_requests').select('full_name').eq('id', requestId).single()).data?.full_name || 'مستخدم',
      role,
      status: 'approved',
      permissions: permissions || [],
    });
    if (pErr) return { error: pErr.message };
    const { error: rErr } = await sb.from('account_requests').update({
      status: 'approved', reviewed_at: new Date().toISOString(),
    }).eq('id', requestId);
    if (rErr) return { error: rErr.message };
    // audit
    await sb.from('audit_log').insert({
      institution_id: institutionId, actor_id: (await getSession()).user?.id,
      action: 'account_approved', entity_type: 'profile', entity_id: userId,
      new_value: { role, permissions }, reason: 'approved by admin',
    });
    return { error: null };
  } catch (e) { return { error: String(e?.message || e) }; }
}

export async function rejectAccount(requestId, reason) {
  const sb = getSupabase();
  if (!sb) return { error: 'Supabase غير مُعد' };
  try {
    const { data: req } = await sb.from('account_requests').select('user_id, institution_id').eq('id', requestId).single();
    const { error } = await sb.from('account_requests').update({
      status: 'rejected', reviewed_at: new Date().toISOString(), reason: reason || '',
    }).eq('id', requestId);
    if (error) return { error: error.message };
    if (req?.user_id) {
      await sb.from('profiles').update({ status: 'rejected' }).eq('id', req.user_id);
    }
    await sb.from('audit_log').insert({
      institution_id: req?.institution_id, actor_id: (await getSession()).user?.id,
      action: 'account_rejected', entity_type: 'profile', entity_id: req?.user_id,
      reason: reason || '',
    });
    return { error: null };
  } catch (e) { return { error: String(e?.message || e) }; }
}

export async function disableAccount(userId, institutionId, reason) {
  const sb = getSupabase();
  if (!sb) return { error: 'Supabase غير مُعد' };
  try {
    const { error } = await sb.from('profiles').update({ status: 'disabled' }).eq('id', userId);
    if (error) return { error: error.message };
    await sb.from('audit_log').insert({
      institution_id: institutionId, actor_id: (await getSession()).user?.id,
      action: 'account_disabled', entity_type: 'profile', entity_id: userId, reason: reason || '',
    });
    return { error: null };
  } catch (e) { return { error: String(e?.message || e) }; }
}

export async function signIn(email, password) {
  const sb = getSupabase();
  if (!sb) return { user: null, profile: null, error: 'Supabase غير مُعد' };
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { user: null, profile: null, error: error.message };
    const profile = await getProfile(data.user.id);
    if (!profile) return { user: data.user, profile: null, error: 'الملف الشخصي غير موجود — تواصل مع المسؤول' };
    if (profile.status && profile.status !== 'approved') return { user: data.user, profile, error: 'الحساب غير مفعّل (' + profile.status + ')' };
    if (!profile.role || !profile.institution_id) return { user: data.user, profile, error: 'دور أو مؤسسة غير محددة' };
    return { user: data.user, profile, error: null };
  } catch (e) {
    return { user: null, profile: null, error: String(e?.message || e) };
  }
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  try { await sb.auth.signOut(); } catch {}
}

export async function requestPasswordReset(email, redirectTo) {
  const sb = getSupabase();
  if (!sb) return { error: 'Supabase غير مُعد' };
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

export async function updatePassword(newPassword) {
  const sb = getSupabase();
  if (!sb) return { error: 'Supabase غير مُعد' };
  try {
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

export function onAuthStateChange(cb) {
  const sb = getSupabase();
  if (!sb) return () => {};
  const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
    cb(session?.user || null);
  });
  return () => subscription?.unsubscribe();
}