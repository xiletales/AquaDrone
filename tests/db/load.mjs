// Memuat migrasi + seed ke Postgres WASM (PGlite) dengan stub skema `auth` & peran Supabase.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
const here = new URL('.', import.meta.url).pathname, root = new URL('../../supabase/', import.meta.url).pathname;
export const IDS = {
  A: '00000000-0000-0000-0000-0000000000a1', B: '00000000-0000-0000-0000-0000000000a2',
  POND: '00000000-0000-0000-0000-0000000000b1', DRONE: '00000000-0000-0000-0000-0000000000d1',
};
export async function boot({ seed = true } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(fs.readFileSync(here + 'stub.sql', 'utf8'));
  for (const f of fs.readdirSync(root + 'migrations').sort()) await db.exec(fs.readFileSync(root + 'migrations/' + f, 'utf8'));
  if (seed) await db.exec(fs.readFileSync(root + 'seed.sql', 'utf8'));
  return db;
}
/** Jalankan fn sebagai pengguna login (RLS berlaku) / service_role, di dalam transaksi. */
export const asUser = (db, uid, fn) => db.transaction(async (tx) => {
  await tx.exec(`set local role authenticated; select set_config('request.jwt.claim.sub','${uid}',true)`);
  return fn(tx);
});
export const asService = (db, fn) => db.transaction(async (tx) => { await tx.exec('set local role service_role'); return fn(tx); });
