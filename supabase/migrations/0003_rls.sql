-- AQUA-DRONE · 0003 · RLS, hak akses minimum, Realtime, jadwal watchdog

alter table farms                enable row level security;
alter table farm_members         enable row level security;
alter table ponds                enable row level security;
alter table pond_settings        enable row level security;
alter table feed_schedule        enable row level security;
alter table devices              enable row level security;
alter table device_secrets       enable row level security;   -- sengaja TANPA policy
alter table measurement_sessions enable row level security;
alter table measurement_samples  enable row level security;
alter table measurement_results  enable row level security;
alter table feeding_runs         enable row level security;
alter table notifications        enable row level security;

-- ---------- hak tabel (privilese minimum) ----------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on farms, farm_members, ponds, pond_settings, feed_schedule, devices,
                measurement_sessions, measurement_samples, measurement_results, feeding_runs, notifications
  to authenticated;
grant insert on measurement_sessions to authenticated;
grant update on pond_settings, feed_schedule to authenticated;
grant update (read_at) on notifications to authenticated;
-- device_secrets: tidak ada grant sama sekali untuk anon/authenticated.

-- ---------- policy ----------
create policy farms_select on farms for select to authenticated using (is_farm_member(id));
create policy members_select on farm_members for select to authenticated using (is_farm_member(farm_id));
create policy ponds_select on ponds for select to authenticated using (is_farm_member(farm_id));

create policy settings_select on pond_settings for select to authenticated using (is_farm_member(pond_farm(pond_id)));
create policy settings_update on pond_settings for update to authenticated
  using (can_operate(pond_farm(pond_id))) with check (can_operate(pond_farm(pond_id)));

create policy schedule_select on feed_schedule for select to authenticated using (is_farm_member(pond_farm(pond_id)));
create policy schedule_update on feed_schedule for update to authenticated
  using (can_operate(pond_farm(pond_id))) with check (can_operate(pond_farm(pond_id)));

create policy devices_select on devices for select to authenticated using (is_farm_member(pond_farm(pond_id)));

create policy sessions_select on measurement_sessions for select to authenticated using (is_farm_member(pond_farm(pond_id)));
create policy sessions_insert on measurement_sessions for insert to authenticated
  with check (can_operate(pond_farm(pond_id)) and requested_by = auth.uid());

create policy samples_select on measurement_samples for select to authenticated
  using (is_farm_member((select pond_farm(s.pond_id) from measurement_sessions s where s.id = session_id)));
create policy results_select on measurement_results for select to authenticated using (is_farm_member(pond_farm(pond_id)));
create policy feeding_select on feeding_runs for select to authenticated using (is_farm_member(pond_farm(pond_id)));

create policy notif_select on notifications for select to authenticated using (is_farm_member(pond_farm(pond_id)));
create policy notif_update on notifications for update to authenticated
  using (is_farm_member(pond_farm(pond_id))) with check (is_farm_member(pond_farm(pond_id)));

-- ---------- hak eksekusi fungsi ----------
-- RPC & helper untuk pengguna login
grant execute on function is_farm_member(uuid), can_operate(uuid), pond_farm(uuid),
  create_farm_with_pond(text, text), cancel_session(uuid), start_feeding_run(uuid),
  daily_min_do(uuid, int), fmt_id(numeric, int) to authenticated;
-- Logika inti: hanya service_role (Edge Function / pg_cron)
grant execute on function finalize_session(uuid), mark_session_lost(uuid), run_watchdog(),
  ingest_telemetry(uuid, uuid, jsonb), full_portion_kg(uuid),
  classify_do(numeric, uuid), classify_ph(numeric, uuid), classify_temp(numeric, uuid) to service_role;
-- full_portion_kg dipakai klien untuk pratinjau? Tidak: klien menghitung sendiri dari input.

-- ---------- Realtime ----------
alter publication supabase_realtime add table
  measurement_sessions, measurement_samples, measurement_results, feeding_runs, notifications, devices;

-- ---------- watchdog tiap menit (hanya bila pg_cron tersedia) ----------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('aqua-watchdog', '* * * * *', 'select public.run_watchdog()');
  else
    raise notice 'pg_cron tidak tersedia: jadwalkan Edge Function session-watchdog lewat Supabase Cron.';
  end if;
end $$;
