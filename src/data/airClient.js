// Klien Supabase TANPA sesi pengguna (role anon). Policy tabel monitoring_air / kontrol_pakan hanya untuk role `anon`,
// jadi fitur ini tidak memakai klien login (role `authenticated`) milik bagian lain aplikasi. Hanya kunci publishable/anon.
let promise;
/** Tes dapat menyuntik klien tiruan lewat globalThis.__AQUA_AIR_SB__. */
export function getAirClient() {
  if (globalThis.__AQUA_AIR_SB__) return Promise.resolve(globalThis.__AQUA_AIR_SB__);
  promise ||= import('@supabase/supabase-js').then(({ createClient }) => {
    const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw Object.assign(new Error('config'), { code: 'CONFIG' });
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'aqua-air-anon' } });
  });
  return promise;
}
