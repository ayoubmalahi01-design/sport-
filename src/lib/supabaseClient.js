// Supabase client — OPTIONAL, lazy, never required to open the app.
// Reads env vars; if missing/invalid, the app runs in local-only mode.
import { createClient } from '@supabase/supabase-js';

const EXPECTED_PROJECT = 'vyhmdgpiprwqjbakxypb';

function readConfig() {
  const url = (import.meta.env && import.meta.env.VITE_SUPABASE_URL) || '';
  const key = (import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || '';
  const urlValid = !!url && url !== 'your_supabase_project_url_here' && url.includes('supabase.co');
  const keyValid = !!key && key !== 'your_supabase_anon_key';
  const projectMatch = url.includes(EXPECTED_PROJECT);
  return { url, key, urlValid, keyValid, projectMatch };
}

export const isSupabaseConfigured = () => {
  const c = readConfig();
  return c.urlValid && c.keyValid && c.projectMatch;
};

let _client = null;
export const getSupabase = () => {
  if (_client) return _client;
  const c = readConfig();
  if (!c.urlValid || !c.keyValid || !c.projectMatch) return null;
  _client = createClient(c.url, c.key, {
    auth: { autoSignIn: false, persistSession: true, detectSessionInUrl: true, storage: window.localStorage }
  });
  return _client;
};

// Back-compat: `supabase` may be null when unconfigured.
export const supabase = getSupabase();

export const verifyConfig = () => {
  const c = readConfig();
  return {
    urlValid: c.urlValid,
    keyValid: c.keyValid,
    projectReference: c.urlValid ? c.url.replace('https://', '') : 'not configured',
    projectMatch: c.projectMatch,
    mode: (c.urlValid && c.keyValid && c.projectMatch) ? 'supabase_connected' : 'localStorage_fallback'
  };
};

export const getCurrentUserId = async () => {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data: { user } } = await sb.auth.getUser();
    return user?.id || null;
  } catch { return null; }
};

export const getCurrentInstitutionId = async () => {
  const sb = getSupabase();
  if (!sb) return null;
  const userId = await getCurrentUserId();
  if (!userId) return null;
  try {
    const { data } = await sb.from('profiles').select('institution_id').eq('id', userId).single();
    return data?.institution_id || null;
  } catch { return null; }
};

export const getCurrentRole = async () => {
  const sb = getSupabase();
  if (!sb) return null;
  const userId = await getCurrentUserId();
  if (!userId) return null;
  try {
    const { data } = await sb.from('profiles').select('role').eq('id', userId).single();
    return data?.role || null;
  } catch { return null; }
};

export const signIn = async (email, password) => {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const sb = getSupabase();
  if (!sb) return;
  try { await sb.auth.signOut(); } catch {}
};

export const withInstitutionScope = async (qb) => {
  const institutionId = await getCurrentInstitutionId();
  if (institutionId) return qb.eq('institution_id', institutionId);
  return qb;
};

export default getSupabase();