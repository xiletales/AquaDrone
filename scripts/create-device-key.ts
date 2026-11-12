// Membuat kunci perangkat acak (32 byte), menyimpan HASH-nya di device_secrets, dan mencetak kunci asli SEKALI SAJA.
//
//   Kunci untuk perangkat yang sudah ada (atau ganti kunci lama = rotasi):
//     node --env-file=.env scripts/create-device-key.ts <device_id>
//   Buat perangkat baru + kunci:
//     node --env-file=.env scripts/create-device-key.ts --new --pond <pond_id> --kind drone --name "Drone amfibi"
//
// .env (lokal, JANGAN di-commit) harus berisi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error('Set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY (mis. di .env lokal).'); process.exit(1); }
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

let deviceId = args.find((a) => /^[0-9a-f-]{36}$/i.test(a));
if (args.includes('--new')) {
  const pond = flag('pond'), kind = flag('kind') ?? 'drone', name = flag('name') ?? (kind === 'konsol' ? 'Konsol' : 'Drone amfibi');
  if (!pond || !['drone', 'konsol'].includes(kind)) { console.error('Butuh --pond <uuid> dan --kind drone|konsol'); process.exit(1); }
  const { data, error } = await db.from('devices').insert({ pond_id: pond, kind, name }).select('id').single();
  if (error) { console.error('Gagal membuat perangkat:', error.message); process.exit(1); }
  deviceId = data.id;
}
if (!deviceId) { console.error('Beri <device_id> atau --new --pond <id>.'); process.exit(1); }

const key = 'adk_' + randomBytes(32).toString('hex');
const key_hash = createHash('sha256').update(key).digest('hex');
const { error } = await db.from('device_secrets').upsert({ device_id: deviceId, key_hash }, { onConflict: 'device_id' });
if (error) { console.error('Gagal menyimpan kunci:', error.message); process.exit(1); }

console.log(`\nPerangkat : ${deviceId}\nKunci     : ${key}\n`);
console.log('Simpan kunci ini sekarang di perangkat. Kunci TIDAK bisa ditampilkan lagi (hanya hash-nya yang tersimpan).');
console.log('Menjalankan skrip ini lagi untuk perangkat yang sama mengganti kunci lama (kunci lama langsung tidak berlaku).');
