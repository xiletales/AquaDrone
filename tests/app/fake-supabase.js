// Klien Supabase tiruan di atas PGlite: query dijalankan sebagai role `authenticated` (RLS berlaku),
// rpc memanggil fungsi sungguhan, Realtime lewat LISTEN/NOTIFY. Hanya sebagian kecil API yang dipakai aplikasi.
import { asUser } from '../db/load.mjs';

const TYPES = { 20: 'int', 1700: 'num', 1114: 'ts', 1184: 'ts', 1082: 'date' };
const conv = (res) => res.rows.map((r) => {
  const o = {};
  res.fields.forEach((f) => {
    let v = r[f.name]; const t = TYPES[f.dataTypeID];
    if (v != null) {
      if (t === 'int' || t === 'num') v = Number(v);
      else if (t === 'ts') v = v instanceof Date ? v.toISOString() : v;
      else if (t === 'date') v = v instanceof Date ? v.toISOString().slice(0, 10) : v;
    }
    o[f.name] = v;
  });
  return o;
});
const lit = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const ident = (s) => '"' + s.replace(/"/g, '') + '"';

export async function installRealtime(db, tables = ['measurement_sessions', 'measurement_samples', 'measurement_results', 'feeding_runs', 'notifications', 'devices']) {
  await db.exec(`create function rt_notify() returns trigger language plpgsql as $$
    begin perform pg_notify('rt', json_build_object('table', TG_TABLE_NAME, 'type', TG_OP, 'new', to_jsonb(NEW), 'old', to_jsonb(OLD))::text); return null; end $$;`);
  await db.exec(`create or replace function rt_notify() returns trigger language plpgsql as $$
    begin perform pg_notify('rt', json_build_object('table', TG_TABLE_NAME, 'type', TG_OP, 'new', to_jsonb(NEW), 'old', to_jsonb(OLD))::text); return null; end $$;`).catch(() => {});
  for (const t of tables)
    await db.exec(`create trigger rt_${t} after insert or update on ${t} for each row execute function rt_notify()`);
}

export function createFakeClient(db, { onError, anon = false } = {}) {
  let session = null; const authCbs = []; const channels = new Set(); let unlisten = null;
  const run = (sql) => {
    if (anon) return db.transaction(async (tx) => { await tx.exec('set local role anon'); return tx.query(sql); }).then((r) => ({ data: conv(r), error: null }), (e) => ({ data: null, error: { message: e.message } }));
    const uid = session?.user.id;
    if (!uid) return Promise.resolve({ data: null, error: { message: 'JWT required' } });
    return asUser(db, uid, async (tx) => tx.query(sql)).then((r) => ({ data: conv(r), error: null }), (e) => ({ data: null, error: { message: e.message } }));
  };
  const ensureListen = async () => {
    if (unlisten) return;
    unlisten = await db.listen('rt', (payload) => {
      const m = JSON.parse(payload);
      for (const ch of channels) for (const l of ch.listeners) {
        if (l.table !== m.table) continue;
        if (l.event !== '*' && l.event !== m.type) continue;
        if (l.filter) { const [, col, val] = l.filter.match(/^(\w+)=eq\.(.+)$/); if (String(m.new?.[col]) !== val) continue; }
        setTimeout(() => l.cb({ eventType: m.type, new: m.new, old: m.old, table: m.table }), 0);
      }
    });
  };
  const from = (table) => {
    const st = { table, op: 'select', cols: '*', wh: [], order: null, limit: null, single: null, values: null, ret: false };
    const b = {
      select(cols = '*') { if (st.op === 'insert' || st.op === 'update') st.ret = true; else st.cols = cols; return b; },
      insert(v) { st.op = 'insert'; st.values = v; return b; },
      update(v) { st.op = 'update'; st.values = v; return b; },
      eq(c, v) { st.wh.push(`${ident(c)} = ${lit(v)}`); return b; },
      gte(c, v) { st.wh.push(`${ident(c)} >= ${lit(v)}`); return b; },
      in(c, arr) { st.wh.push(`${ident(c)} in (${arr.map(lit).join(',')})`); return b; },
      order(c, o = {}) { st.order = `${ident(c)} ${o.ascending === false ? 'desc' : 'asc'}`; return b; },
      limit(n) { st.limit = n; return b; },
      maybeSingle() { st.single = 'maybe'; return b; },
      single() { st.single = 'one'; return b; },
      then(res, rej) { return exec().then(res, rej); },
    };
    const exec = async () => {
      const where = st.wh.length ? ' where ' + st.wh.join(' and ') : '';
      let sql;
      if (st.op === 'select') sql = `select ${st.cols} from ${ident(st.table)}${where}${st.order ? ' order by ' + st.order : ''}${st.limit ? ' limit ' + st.limit : ''}`;
      else if (st.op === 'insert') { const ks = Object.keys(st.values); sql = `insert into ${ident(st.table)} (${ks.map(ident).join(',')}) values (${ks.map((k) => lit(st.values[k])).join(',')}) returning *`; }
      else sql = `update ${ident(st.table)} set ${Object.entries(st.values).map(([k, v]) => `${ident(k)} = ${lit(v)}`).join(', ')}${where} returning *`;
      const r = await run(sql);
      if (r.error) { onError?.(r.error); return { data: null, error: r.error }; }
      if (st.op !== 'select' && !st.ret) return { data: null, error: null };
      if (st.single) {
        if (r.data.length > 1 || (st.single === 'one' && r.data.length === 0)) return { data: null, error: { message: 'single row expected' } };
        return { data: r.data[0] ?? null, error: null };
      }
      return r;
    };
    return b;
  };
  const rpc = async (name, args = {}) => {
    const ks = Object.keys(args);
    const r = await run(`select * from ${name}(${ks.map((k) => `${k} => ${lit(typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])}`).join(', ')})`);
    if (r.error) return r;
    // fungsi skalar -> nilai; fungsi tabel/composite -> baris
    const rows = r.data;
    if (rows.length === 1 && Object.keys(rows[0]).length === 1 && Object.keys(rows[0])[0] === name) return { data: rows[0][name], error: null };
    return { data: name === 'start_feeding_run' ? rows[0] : rows, error: null };
  };
  const auth = {
    async getSession() { return { data: { session }, error: null }; },
    async signInWithPassword({ email, password }) {
      const r = await db.query(`select id, email from auth.users where email = $1 and encrypted_password = crypt($2, encrypted_password)`, [email, password]);
      if (!r.rows.length) return { data: {}, error: { message: 'Invalid login credentials' } };
      session = { user: { id: r.rows[0].id, email }, access_token: 'x' };
      authCbs.forEach((cb) => cb('SIGNED_IN', session));
      return { data: { user: session.user, session }, error: null };
    },
    async signUp({ email, password }) {
      if ((await db.query(`select 1 from auth.users where email = $1`, [email])).rows.length) return { data: {}, error: { message: 'User already registered' } };
      if (password.length < 6) return { data: {}, error: { message: 'Password should be at least 6 characters' } };
      const id = crypto.randomUUID();
      await db.query(`insert into auth.users(id, email, encrypted_password) values ($1, $2, crypt($3, gen_salt('bf')))`, [id, email, password]);
      session = { user: { id, email }, access_token: 'x' };
      return { data: { user: session.user, session }, error: null };
    },
    async signOut() { session = null; authCbs.forEach((cb) => cb('SIGNED_OUT', null)); return { error: null }; },
    onAuthStateChange(cb) { authCbs.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
  };
  const channel = (name) => {
    const ch = { name, listeners: [],
      on(_t, opts, cb) { ch.listeners.push({ table: opts.table, event: opts.event, filter: opts.filter, cb }); return ch; },
      subscribe(cb) { channels.add(ch); ensureListen().then(() => cb?.('SUBSCRIBED')); return ch; } };
    return ch;
  };
  return { auth, from, rpc, channel, removeChannel(ch) { channels.delete(ch); }, _channels: channels,
    async _close() { await unlisten?.(); } };
}
