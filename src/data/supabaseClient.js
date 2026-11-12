// Klien Supabase (anon/publishable key + sesi pengguna). service_role TIDAK PERNAH dipakai di sini.
import { createClient } from '@supabase/supabase-js';

let client;
/** Tes dapat menyuntik klien tiruan lewat globalThis.__AQUA_SB__. */
export function getClient() {
  if (globalThis.__AQUA_SB__) return globalThis.__AQUA_SB__;
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi (.env.local)');
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  }
  return client;
}
