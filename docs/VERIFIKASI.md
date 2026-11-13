# Verifikasi checklist penerimaan

Status: ✅ terverifikasi otomatis · 🟡 terverifikasi sebagian · ⏳ butuh proyek Supabase asli (belum bisa diuji di komputer pengembang ini: tanpa Supabase CLI/Docker).

| # | Item | Status | Bukti / catatan |
|---|---|---|---|
| 1 | 10 layar pada 360 px cocok dengan PNG | ✅ | Perbandingan otomatis posisi tiap teks dan kotak terhadap SVG: selisih ≤ 2 px. Detail ikon, kurva grafik, dan lintasan dicek dengan mata |
| 2 | Teks Indonesia, koma desimal, jam `05.41` | ✅ | Sapuan semua layar: tanpa angka berformat titik (selain jam), `NaN`, `undefined`, atau teks Inggris |
| 3 | Tiga tema bertransisi halus dan mengubah awan/latar | ✅ | `body` transisi 0,6 dtk; awan: putih .2 → .1 (waspada) → `#2a0b0b` .32 (kritis) |
| 4 | Porsi 5,0 / 2,5 / 0 kg, maks. 5 kg, "Hitungan 47,6 kg…" | ✅ | Tes aplikasi + tes database |
| 5 | Alur Beranda → Pengukuran → semua cabang via Mode demo | ✅ | Uji ujung ke ujung di browser (mock) |
| 6 | Layar kunci + ketukan notifikasi | ✅ | Mock dan supabase (tes aplikasi) |
| 7 | Riwayat 2 tab, Pengaturan (input hidup, 2 sheet) | ✅ | Mock dan supabase (simpan debounce 600 ms ke database) |
| 8 | Animasi; mati saat `prefers-reduced-motion` | ✅ | Reduced motion: 0 animasi berjalan, tanpa SMIL |
| 9 | Migrasi bersih dari nol (`supabase db reset`), RLS semua tabel, `device_secrets` tertutup | 🟡 ⏳ | Migrasi + seed berjalan bersih dan RLS diuji di PGlite (75 pemeriksaan). `supabase db reset` sendiri belum dijalankan |
| 10 | Lima skenario simulator menggerakkan aplikasi lewat Realtime | 🟡 ⏳ | Simulator → handler → database diuji (45 pemeriksaan); aplikasi + Realtime diuji dengan klien tiruan (`LISTEN/NOTIFY`). Belum lewat Supabase Realtime asli |
| 11 | Status, porsi, izin terbang dihitung database; notifikasi otomatis dengan teks desain | ✅ | Tes database dan tes aplikasi |
| 12 | `docs/DEVICE-API.md` lengkap | ✅ | Endpoint, curl, payload, error, kunci, deploy |
| 13 | Tanpa `service_role` di frontend/repo | ✅ | Pemindaian `src/`, `index.html`, `dist/`, dan seluruh riwayat git: tidak ada kunci/JWT/kata sandi. `.env.local` diabaikan git |
| 14 | Tanpa error console; Lighthouse Accessibility ≥ 95 | ✅ | Console bersih di semua layar; Lighthouse (seluler, build produksi): Accessibility 100, Performance 100, Best Practices 100 |

## Penyimpangan dari prompt (SVG diutamakan, atau alasan teknis)

Padding atas 30 px; judul layar dalam 20 px; cincin timer r88; lintasan pakan 292 px; kotak saran hijau muda; lebar chip/pil tetap dari SVG (tanpa letter-spacing);
pil KRITIS transparansi .14 (kontras AA); tombol utama mode gelap `#0E7C86`; input 16 px di perangkat sentuh; kriteria "stabil" = rentang 60 dtk
(lihat DECISIONS.md #5); legenda grafik berwarna (SVG: abu-abu semua).

## Elemen di luar desain (dibutuhkan fungsi)

Layar Masuk (+ tautan Daftar/Masuk), tombol "Keluar" di Pengaturan (mode supabase), "← Tutup" di Layar kunci, teks keadaan kosong, status drone offline,
"Penebaran terputus", toast "Pengaturan disimpan".

## Masalah terbuka

* **Kontras teks di atas air (mode terang):** tiga teks kecil (~3,2–3,8:1, target 4,5:1). Memperbaikinya berarti menggelapkan air, yang mengubah tampilan dari PNG.
* **Bundel:** inti 34 KB (14 KB gzip); `@supabase/supabase-js` 228 KB (60 KB gzip) dimuat hanya di mode supabase. Total mentah melebihi "<150 KB" di prompt; dalam gzip di bawahnya.
* **Belum diuji di Supabase asli:** format tipe data PostgREST, filter Realtime, pengaturan Auth (konfirmasi email), `pg_cron`, penerapan Edge Function di Deno.
