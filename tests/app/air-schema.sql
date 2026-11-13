-- Replika skema yang SUDAH ADA di proyek (dibuat pengguna, bukan oleh migrasi kita): tabel + policy untuk role anon.
create table public.monitoring_air (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  suhu double precision, ph double precision, do_mgl double precision,
  status text, pakan_persen int
);
create table public.kontrol_pakan (
  id bigint primary key, perintah_persen int, nomor_perintah bigint default 0,
  hasil text, persen_aktual int, updated_at timestamptz default now()
);
alter table public.monitoring_air enable row level security;
alter table public.kontrol_pakan enable row level security;
create policy "anon select monitoring" on public.monitoring_air for select to anon using (true);
create policy "anon insert monitoring" on public.monitoring_air for insert to anon with check (true);
create policy "anon select kontrol" on public.kontrol_pakan for select to anon using (true);
create policy "anon update kontrol" on public.kontrol_pakan for update to anon using (true) with check (true);
-- keadaan nyata di proyek: anon/authenticated punya semua hak tabel (policy yang membatasi)
grant all on public.monitoring_air, public.kontrol_pakan to anon, authenticated, service_role;
insert into public.kontrol_pakan (id, perintah_persen, nomor_perintah, hasil, persen_aktual) values (1, 0, 0, 'ESP32_ONLINE', 0);
