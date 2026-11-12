# API Perangkat AQUA-DRONE

Dokumen ini cukup untuk memprogram drone / konsol tanpa membaca kode. Perangkat **tidak** memakai akun pengguna;
ia mengirim HTTPS ke Edge Function dengan kunci perangkat di header `x-device-key`.

**Base URL:** `https://qqscduksespazovwxlgu.supabase.co/functions/v1` (ganti dengan proyek Anda)

| Endpoint | Metode | Tujuan | Frekuensi |
|---|---|---|---|
| `/device-heartbeat` | POST | Lapor hidup, baterai, status telemetri | tiap ±15 dtk |
| `/device-poll` | GET | Tanya ada sesi pengukuran / run pakan aktif | tiap 2–5 dtk saat menunggu |
| `/device-telemetry` | POST | Kirim sampel DO, pH, suhu | tiap `sample_interval_sec` (5 dtk) |
| `/device-feed-progress` | POST | Lapor progres penebaran pakan | ±tiap 0,3–5 dtk saat menebar |

Header wajib: `x-device-key: adk_<64 hex>` dan (untuk POST) `content-type: application/json`.
Tidak perlu header `Authorization` / `apikey`.

## 1. Membuat kunci perangkat

Kunci acak 32 byte; database hanya menyimpan **hash SHA-256**-nya. Kunci asli dicetak **sekali** — simpan di perangkat.

```bash
# .env lokal (jangan di-commit): SUPABASE_URL=... dan SUPABASE_SERVICE_ROLE_KEY=...
npm run device:key -- --new --pond <pond_id> --kind drone --name "Drone amfibi"   # perangkat baru + kunci
npm run device:key -- <device_id>                                                  # kunci untuk perangkat yang ada
```
Menjalankan ulang untuk perangkat yang sama **mengganti** kunci (rotasi); kunci lama langsung ditolak.
Kunci yang bocor: jalankan ulang perintah itu. Jangan menaruh kunci di repositori, aplikasi web, atau log.

## 2. Alur normal sebuah sesi

```
perangkat                         Supabase                       aplikasi
   | -- heartbeat (tiap 15 dtk) -->|                                |
   | -- poll ---------------------->| (belum ada sesi) session:null  |
   |                               |<---- "Mulai pengukuran" -------| sesi menunggu_drone  (Layar "Menunggu drone")
   | -- poll ---------------------->| session:{session_id,...}       |
   | -- telemetry t=0 ------------->| sesi -> berjalan               | (Layar Pengukuran)
   | -- telemetry t=5,10,... ------>|                                |
   | -- telemetry t=… ------------->| stabil / 10 menit -> finalize  | hasil + notifikasi (Layar Hasil)
   | <- {finalized:true} -----------|                                |
```
* Status kolam, porsi pakan, dan izin terbang **dihitung database**; perangkat tidak perlu menghitungnya.
* Sesi selesai bila dalam 60 dtk terakhir rentang (maks−min) DO ≤ 0,1 · pH ≤ 0,05 · suhu ≤ 0,1, **atau** `t_sec ≥ measure_minutes×60` (600).
* Bila sampel berhenti > 30 dtk, watchdog menandai sesi `data_terputus` (tanpa hasil).

## 3. Endpoint

### POST /device-heartbeat
```bash
curl -X POST "$BASE/device-heartbeat" -H "x-device-key: $KEY" -H "content-type: application/json" \
  -d '{"battery_pct":82,"telemetry_ok":true}'
```
`battery_pct` (integer 0–100, opsional) · `telemetry_ok` (boolean, opsional, default `true`).
Respons `200`: `{"ok":true,"server_time":"2026-10-24T05:41:00.123+00:00"}`

### GET /device-poll
```bash
curl "$BASE/device-poll" -H "x-device-key: $KEY"
```
Respons `200`:
```json
{
  "session": { "session_id": "uuid", "session_no": 1, "status": "menunggu_drone",
               "sample_interval_sec": 5, "measure_minutes": 10, "resume_after_t_sec": null },
  "feeding": { "run_id": "uuid", "target_kg": 2.5, "dispensed_kg": 0, "pass_total": 5 },
  "server_time": "…"
}
```
`session` = `null` bila tidak ada sesi aktif; `feeding` = `null` bila tidak ada run pakan aktif.
`resume_after_t_sec` terisi bila sesi sudah berjalan (mis. alat restart): lanjutkan dari `resume_after_t_sec + interval`.

### POST /device-telemetry
Satu sampel:
```bash
curl -X POST "$BASE/device-telemetry" -H "x-device-key: $KEY" -H "content-type: application/json" \
  -d '{"session_id":"<uuid>","t_sec":0,"do_mgl":4.1,"ph":7.9,"temp_c":29.8,"battery_pct":82}'
```
Batch (maks. 200) — dua bentuk setara:
```json
{ "session_id": "<uuid>", "samples": [ {"t_sec":0,"do_mgl":4.1,"ph":7.9,"temp_c":29.8}, {"t_sec":5,"do_mgl":4.1,"ph":7.9,"temp_c":29.8} ] }
[ {"session_id":"<uuid>","t_sec":0,"do_mgl":4.1,"ph":7.9,"temp_c":29.8}, {"session_id":"<uuid>","t_sec":5,"do_mgl":4.1,"ph":7.9,"temp_c":29.8} ]
```
Aturan: `t_sec` integer detik sejak sesi mulai (0–3600) · DO 0–30 mg/L · pH 0–14 · suhu −5–60 °C · `battery_pct` 0–100 (opsional).
**Idempoten:** mengirim ulang `t_sec` yang sama menimpa nilai lama dan tidak menambah hitungan paket, jadi aman di-retry.
Respons `200`:
```json
{ "accepted": true, "status": "berjalan", "finalized": false, "packets_received": 13 }
```
* `finalized: true` → hasil sudah dihitung; **berhenti mengirim**.
* `accepted: false` (+ `status: "selesai" | "data_terputus" | "dibatalkan"`) → sesi sudah ditutup; **berhenti mengirim** dan kembali polling.

### POST /device-feed-progress
Run pakan dibuat **aplikasi** (tombol "Pantau penebaran pakan"); alat hanya memperbarui. Ambil `run_id` dari `device-poll`.
```bash
curl -X POST "$BASE/device-feed-progress" -H "x-device-key: $KEY" -H "content-type: application/json" \
  -d '{"run_id":"<uuid>","dispensed_kg":1.5,"pass_current":3,"battery_pct":61,"altitude_m":2.1,"gps_locked":true}'
```
`dispensed_kg` (wajib, ≥ 0) · `pass_current` (1–`pass_total`) · `battery_pct` · `altitude_m` (0–500) · `gps_locked` · `done` (`true` = selesai) · `run_id` (opsional; tanpa itu dipakai run aktif).
`dispensed_kg` tidak pernah turun dan dipotong di target. Respons `200`: `{"accepted":true,"status":"berjalan","run_id":"…","dispensed_kg":1.5}`;
`accepted:false` bila run sudah `selesai`/`terputus`. Tanpa update > 60 dtk, run ditandai `terputus`.

## 4. Kode error

Semua error berbentuk `{"error":"<kode>"}` (kadang + `"detail"`).

| HTTP | `error` | Arti / tindakan |
|---|---|---|
| 401 | `unauthorized` | Header kunci tidak ada, formatnya salah, atau kunci tidak dikenal/sudah diganti |
| 405 | `method_not_allowed` | Salah metode HTTP |
| 400 | `invalid_json` | Body bukan JSON |
| 413 | `body_too_large` | Body > 64 KB |
| 422 | `invalid_payload` / `invalid_sample` / `invalid_samples` | Field salah tipe atau di luar rentang; periksa `detail` |
| 404 | `session_not_found` | `session_id` bukan sesi kolam perangkat ini |
| 404 | `run_not_found` | Tidak ada run pakan aktif / `run_id` salah |
| 404 | `device_not_found` | Perangkat sudah dihapus |
| 500 | `internal` | Kesalahan server; coba lagi dengan jeda (backoff) |

Saran perangkat lunak: retry hanya untuk 5xx/jaringan (jeda 1→2→4 dtk, maks. 30 dtk); jangan retry 4xx tanpa memperbaiki permintaan.

## 5. Pengujian tanpa perangkat keras

```bash
export DEVICE_KEY=adk_…   FUNCTIONS_URL=https://<ref>.supabase.co/functions/v1
npm run device:sim -- aman      # juga: waspada | kritis | lost | wait | feed
npm run device:sim -- waspada --speed 20    # 20 detik-simulasi per detik-nyata
```
Tekan "Mulai pengukuran" di aplikasi (mode supabase), lalu jalankan simulator. Skenario: `aman`/`waspada`/`kritis` mengirim data sampai hasil keluar;
`lost` berhenti di detik 372; `wait` hanya heartbeat+poll (tidak mengirim data); `feed` menebar pakan untuk run aktif.

## 6. Deploy (sekali)

```bash
supabase functions deploy device-heartbeat device-poll device-telemetry device-feed-progress session-watchdog
```
`supabase/config.toml` sudah menetapkan `verify_jwt = false` untuk kelimanya (perangkat tidak punya JWT).
**Watchdog:** `0003_rls.sql` menjadwalkan `run_watchdog()` tiap menit lewat pg_cron bila tersedia. Bila tidak, buat jadwal
Supabase Cron (tiap menit) yang memanggil `POST /session-watchdog` dengan `Authorization: Bearer <service_role>` — fungsi menolak (401) selain itu.
