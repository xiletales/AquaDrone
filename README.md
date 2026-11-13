# AQUA-DRONE

Aplikasi web mobile-first untuk **pemantauan kualitas air dan kendali drone di tambak udang vaname**.
Vite + JavaScript vanilla (tanpa framework UI/CSS) dengan backend Supabase (Postgres + Auth + Realtime + Edge Functions).
Tampilan mengikuti desain di `design/` (SVG/PNG). Bahasa UI: Indonesia.

## Menjalankan (mode mock, tanpa backend)

```bash
npm install
npm run dev          # http://localhost:5173
```

Mode **mock** (default) memakai data tiruan di klien dan menampilkan **Mode demo** (panel samping di desktop, kartu di Pengaturan di
ponsel) untuk memilih hasil pengukuran berikutnya: Waspada, Kritis, Aman, Data terputus, Drone belum terhubung.

```bash
npm run build        # hasil di dist/
npm run preview
```

Butuh Node ≥ 22.6 (skrip `.ts` dijalankan langsung oleh Node).

## Menghubungkan ke Supabase (mode supabase)

1. Pasang CLI dan tautkan proyek:
   ```bash
   brew install supabase/tap/supabase
   supabase login
   supabase link --project-ref <ref-proyek>
   ```
2. Terapkan skema, fungsi, RLS, dan Realtime (`supabase/migrations/0001…0004`) lalu deploy fungsi perangkat:
   ```bash
   supabase db push
   supabase functions deploy device-heartbeat device-poll device-telemetry device-feed-progress session-watchdog
   ```
   **Jangan** menjalankan `supabase/seed.sql` di proyek nyata (membuat pengguna demo). Seed hanya untuk lokal (`supabase db reset`).
3. Isi `.env.local` (diabaikan git; lihat `.env.example`):
   ```
   VITE_DATA_SOURCE=supabase
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable/anon key>
   ```
   Frontend hanya memakai kunci publishable/anon. `service_role` dan kata sandi database **tidak pernah** dipakai di frontend atau repo.
4. Untuk pengembangan, matikan "Confirm email" di Supabase (Authentication → Providers → Email), lalu daftar lewat layar Masuk.
   Pengguna baru otomatis dibuatkan tambak dan "Kolam A1".
5. Watchdog sesi: `0003_rls.sql` menjadwalkan `run_watchdog()` tiap menit lewat pg_cron bila tersedia. Bila tidak, buat jadwal Supabase Cron
   (tiap menit) yang memanggil `POST /functions/v1/session-watchdog` dengan `Authorization: Bearer <service_role>`.

## Perangkat (drone / konsol)

Perangkat mengirim data lewat Edge Function dengan kunci `x-device-key`. Lihat **[docs/DEVICE-API.md](docs/DEVICE-API.md)** (endpoint, contoh curl, payload, kode error).

```bash
# .env (lokal, jangan di-commit): SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY
npm run device:key -- --new --pond <pond_id> --kind drone --name "Drone amfibi"   # kunci dicetak SEKALI
export DEVICE_KEY=adk_…  FUNCTIONS_URL=https://<ref>.supabase.co/functions/v1
npm run device:sim -- aman      # aman | waspada | kritis | lost | wait | feed   (opsi: --speed 20)
```

## Tes

```bash
npm test            # = test:db + test:device + test:app
```

| Rangkaian | Isi |
|---|---|
| `npm run test:db` | Migrasi + seed di Postgres WASM (PGlite): RLS, hak akses, klasifikasi, porsi, status, notifikasi, watchdog |
| `npm run test:device` | Handler Edge Function asli + `simulate-device.ts` asli: 401/405/413/422, lima skenario, pakan |
| `npm run test:app` | `repo.supabase.js` + layar (jsdom) dengan klien Supabase tiruan: alur lengkap, Realtime, pemulihan sesi, Pengaturan, Riwayat |

Semua tes berjalan lokal tanpa Supabase. Lihat **[docs/VERIFIKASI.md](docs/VERIFIKASI.md)** untuk status checklist dan hal yang belum bisa diuji tanpa proyek asli.

## Struktur

```
design/            acuan desain (jangan diubah)
src/               main.js · state.js · router.js · flow.js · demo.js
  screens/         home · measure · wait · lost · result · feed · history · settings · lock · login
  components/      icons · gauge · shrimp · ui
  background/      scene.js (latar animasi)
  data/            repo.js (antarmuka) · repo.mock.js · repo.supabase.js · supabaseClient.js · realtime.js · types.js
  styles/          tokens · base · components · screens · background
supabase/          migrations/ · functions/ · config.toml · seed.sql
scripts/           create-device-key.ts · simulate-device.ts
tests/             db/ · device/ · app/
docs/              DEVICE-API.md · DECISIONS.md · VERIFIKASI.md · FASE-0.md
```

## Keputusan desain & keamanan

Status kolam (Aman/Waspada/Kritis), porsi pakan, dan izin terbang **dihitung di database**, bukan di frontend (mode supabase).
RLS aktif di semua tabel dengan hak akses minimum; `device_secrets` tidak bisa dibaca klien. Alasan tiap keputusan yang tidak tertulis
di spesifikasi ada di **[docs/DECISIONS.md](docs/DECISIONS.md)**.
