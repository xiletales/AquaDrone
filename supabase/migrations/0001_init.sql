-- AQUA-DRONE · 0001 · skema dasar
create extension if not exists pgcrypto;

create type status_kolam  as enum ('aman','waspada','kritis');   -- urutan = tingkat keparahan
create type sesi_status   as enum ('menunggu_drone','berjalan','selesai','data_terputus','dibatalkan');
create type pakan_status  as enum ('berjalan','selesai','terputus','dibatalkan');
create type peran         as enum ('owner','operator','viewer');

create table farms (                       -- tambak
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table farm_members (
  farm_id uuid references farms on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role peran not null default 'operator',
  primary key (farm_id, user_id)
);
create table ponds (                       -- kolam
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references farms on delete cascade,
  name text not null,                       -- "Kolam A1"
  species text not null default 'vaname',
  created_at timestamptz not null default now()
);
create table pond_settings (               -- layar Pengaturan
  pond_id uuid primary key references ponds on delete cascade,
  population int not null default 425000,          -- Populasi hidup (ekor)
  avg_weight_g numeric not null default 10.37,     -- Bobot rata-rata (g)
  feeding_rate_pct numeric not null default 4.32,  -- Feeding rate (%/hari)
  sessions_per_day int not null default 4 check (sessions_per_day > 0),
  max_portion_kg numeric not null default 5,       -- batas maks. per sesi
  do_ok numeric not null default 4,   do_critical numeric not null default 3,
  ph_ok_min numeric not null default 7.5, ph_ok_max numeric not null default 8.5,
  ph_bad_min numeric not null default 7,  ph_bad_max numeric not null default 9,
  temp_ok_min numeric not null default 28, temp_ok_max numeric not null default 32,
  temp_bad_min numeric not null default 26, temp_bad_max numeric not null default 34,
  measure_minutes int not null default 10,
  packet_target_pct int not null default 95,        -- "target ≥ 95%"
  sample_interval_sec int not null default 5,       -- 600/5 = 120 paket
  updated_at timestamptz not null default now()
);
create table feed_schedule (               -- Jadwal sesi pakan
  pond_id uuid references ponds on delete cascade,
  session_no int not null,
  time_of_day time not null,                        -- 05:30, 09:30, 13:30, 17:30
  primary key (pond_id, session_no)
);
create table devices (                     -- drone / konsol
  id uuid primary key default gen_random_uuid(),
  pond_id uuid not null references ponds on delete cascade,
  kind text not null check (kind in ('drone','konsol')),
  name text not null,                               -- "Drone amfibi"
  battery_pct int, telemetry_ok boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create table device_secrets (              -- TANPA policy RLS = tidak bisa dibaca klien
  device_id uuid primary key references devices on delete cascade,
  key_hash text not null                            -- sha256 dari kunci perangkat
);
create table measurement_sessions (        -- layar Pengukuran / Menunggu / Terputus
  id uuid primary key default gen_random_uuid(),
  pond_id uuid not null references ponds on delete cascade,
  session_no int not null,                          -- "Sesi 1 dari 4"
  status sesi_status not null default 'menunggu_drone',
  requested_by uuid references auth.users default auth.uid(),
  requested_at timestamptz not null default now(),
  started_at timestamptz, ended_at timestamptz,
  stopped_at_sec int,                               -- "Berhenti di menit 06:12" = 372
  packets_expected int not null default 120,
  packets_received int not null default 0
);
create table measurement_samples (         -- telemetri mentah per ~5 detik
  id bigint generated always as identity primary key,
  session_id uuid not null references measurement_sessions on delete cascade,
  t_sec int not null,
  do_mgl numeric not null, ph numeric not null, temp_c numeric not null,
  battery_pct int,
  created_at timestamptz not null default now(),
  unique (session_id, t_sec)                        -- idempoten: kirim ulang aman
);
create table measurement_results (         -- layar Hasil + Riwayat + Beranda
  session_id uuid primary key references measurement_sessions on delete cascade,
  pond_id uuid not null references ponds on delete cascade,
  measured_at timestamptz not null default now(),
  do_mgl numeric not null, ph numeric not null, temp_c numeric not null,
  do_status status_kolam not null, ph_status status_kolam not null, temp_status status_kolam not null,
  overall status_kolam not null,
  portion_pct int not null,                         -- 100 / 50 / 0
  portion_kg numeric not null,
  flight_allowed boolean not null                   -- Terbuka / Terkunci
);
create table feeding_runs (                -- layar Penebaran pakan
  id uuid primary key default gen_random_uuid(),
  pond_id uuid not null references ponds on delete cascade,
  session_id uuid references measurement_sessions,
  status pakan_status not null default 'berjalan',
  target_kg numeric not null, dispensed_kg numeric not null default 0,
  pass_current int not null default 1, pass_total int not null default 5,
  battery_pct int, altitude_m numeric, gps_locked boolean not null default false,
  started_at timestamptz not null default now(), ended_at timestamptz,
  updated_at timestamptz not null default now()
);
create table notifications (               -- layar Layar kunci
  id uuid primary key default gen_random_uuid(),
  pond_id uuid not null references ponds on delete cascade,
  result_session_id uuid references measurement_sessions,
  level status_kolam not null,
  title text not null,                              -- "Kolam A1 kritis"
  body text not null,                               -- "DO 2,6 mg/L. Penerbangan terkunci. Nyalakan aerator."
  created_at timestamptz not null default now(), read_at timestamptz
);
create index on measurement_sessions (pond_id, requested_at desc);
create index on measurement_results  (pond_id, measured_at desc);
create index on notifications        (pond_id, created_at desc);

-- tambahan (lihat docs/DECISIONS.md)
create index on ponds (farm_id);
create index on devices (pond_id);
create index on feeding_runs (pond_id, started_at desc);
create index on farm_members (user_id);
-- paling banyak satu sesi aktif per kolam (dijaga trigger di 0002)
create unique index one_active_session_per_pond on measurement_sessions (pond_id)
  where status in ('menunggu_drone','berjalan');
