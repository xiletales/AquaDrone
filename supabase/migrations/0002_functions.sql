-- AQUA-DRONE · 0002 · logika inti di database (status, porsi, izin terbang, notifikasi)

-- ---------- util ----------
create function fmt_id(v numeric, d int default 1) returns text
language sql immutable as $$
  select replace(to_char(round(v, d), 'FM999999990.' || repeat('0', d)), '.', ',')
$$;

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger pond_settings_touch before update on pond_settings for each row execute function touch_updated_at();
create trigger feeding_runs_touch  before update on feeding_runs  for each row execute function touch_updated_at();

-- ---------- klasifikasi ----------
create function classify_do(v numeric, p_pond uuid) returns status_kolam
language sql stable security definer set search_path = public as $$
  select (case when v < s.do_critical then 'kritis' when v < s.do_ok then 'waspada' else 'aman' end)::status_kolam
  from pond_settings s where s.pond_id = p_pond
$$;
create function classify_ph(v numeric, p_pond uuid) returns status_kolam
language sql stable security definer set search_path = public as $$
  select (case when v < s.ph_bad_min or v > s.ph_bad_max then 'kritis'
               when v < s.ph_ok_min  or v > s.ph_ok_max  then 'waspada' else 'aman' end)::status_kolam
  from pond_settings s where s.pond_id = p_pond
$$;
create function classify_temp(v numeric, p_pond uuid) returns status_kolam
language sql stable security definer set search_path = public as $$
  select (case when v < s.temp_bad_min or v > s.temp_bad_max then 'kritis'
               when v < s.temp_ok_min  or v > s.temp_ok_max  then 'waspada' else 'aman' end)::status_kolam
  from pond_settings s where s.pond_id = p_pond
$$;

create function full_portion_kg(p_pond uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select least(max_portion_kg, population * avg_weight_g / 1000 * feeding_rate_pct / 100 / sessions_per_day)
  from pond_settings where pond_id = p_pond
$$;

-- ---------- sesi pengukuran ----------
-- Dipakai saat klien membuat sesi: paksa nilai awal, nomor sesi otomatis, batalkan sesi aktif lama.
create function session_defaults() returns trigger language plpgsql security definer set search_path = public as $$
declare ses int; n int;
begin
  select sessions_per_day into ses from pond_settings where pond_id = new.pond_id;
  select count(*) into n from measurement_results
   where pond_id = new.pond_id
     and (measured_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date;
  new.session_no := least(coalesce(ses, 4), n + 1);
  new.status := 'menunggu_drone';
  new.requested_at := now();
  new.started_at := null; new.ended_at := null; new.stopped_at_sec := null; new.packets_received := 0;
  update measurement_sessions set status = 'dibatalkan', ended_at = now()
   where pond_id = new.pond_id and status in ('menunggu_drone','berjalan');
  return new;
end $$;
create trigger measurement_sessions_defaults before insert on measurement_sessions
  for each row execute function session_defaults();

create function finalize_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s measurement_sessions; pn text; mx int;
  a_do numeric; a_ph numeric; a_t numeric;
  st_do status_kolam; st_ph status_kolam; st_t status_kolam; ov status_kolam;
  pct int; kg numeric; body text;
begin
  select * into s from measurement_sessions where id = p_session for update;
  if not found then raise exception 'session_not_found'; end if;
  if s.status not in ('menunggu_drone','berjalan') then return; end if;

  select max(t_sec) into mx from measurement_samples where session_id = p_session;
  if mx is null then raise exception 'no_samples'; end if;

  -- rata-rata jendela stabil = 60 detik terakhir; dibulatkan 1 desimal agar status = angka yang tampil
  select round(avg(do_mgl), 1), round(avg(ph), 1), round(avg(temp_c), 1)
    into a_do, a_ph, a_t
    from measurement_samples where session_id = p_session and t_sec >= mx - 60;

  st_do := classify_do(a_do, s.pond_id); st_ph := classify_ph(a_ph, s.pond_id); st_t := classify_temp(a_t, s.pond_id);
  ov := greatest(st_do, st_ph, st_t);
  pct := case ov when 'aman' then 100 when 'waspada' then 50 else 0 end;
  kg := round(full_portion_kg(s.pond_id) * pct / 100, 2);

  insert into measurement_results (session_id, pond_id, do_mgl, ph, temp_c, do_status, ph_status, temp_status,
                                   overall, portion_pct, portion_kg, flight_allowed)
  values (p_session, s.pond_id, a_do, a_ph, a_t, st_do, st_ph, st_t, ov, pct, kg, ov <> 'kritis')
  on conflict (session_id) do nothing;

  update measurement_sessions
     set status = 'selesai', ended_at = now(), started_at = coalesce(started_at, now()),
         packets_received = (select count(*) from measurement_samples where session_id = p_session)
   where id = p_session;

  select name into pn from ponds where id = s.pond_id;
  body := case ov
    when 'kritis'  then 'DO ' || fmt_id(a_do) || ' mg/L. Penerbangan terkunci. Nyalakan aerator.'
    when 'waspada' then 'DO ' || fmt_id(a_do) || ' mg/L. Porsi pakan ' || pct || '% (' || fmt_id(kg) || ' kg).'
    else 'Boleh menebar pakan ' || pct || '% (' || fmt_id(kg) || ' kg).' end;
  insert into notifications (pond_id, result_session_id, level, title, body)
  values (s.pond_id, p_session, ov, pn || ' ' || ov::text, body);
end $$;

create function mark_session_lost(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mx int;
begin
  select max(t_sec) into mx from measurement_samples where session_id = p_session;
  update measurement_sessions
     set status = 'data_terputus', ended_at = now(), stopped_at_sec = coalesce(mx, 0),
         packets_received = (select count(*) from measurement_samples where session_id = p_session)
   where id = p_session and status = 'berjalan';   -- tanpa hasil / status kolam
end $$;

-- Telemetri dari alat (dipanggil Edge Function device-telemetry dengan service_role). Atomik + idempoten.
create function ingest_telemetry(p_device uuid, p_session uuid, p_samples jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d devices; s measurement_sessions; cfg pond_settings; e jsonb;
  t int; v_do numeric; v_ph numeric; v_t numeric; bat int;
  mx int; cur measurement_samples; finalized boolean := false; stable boolean := false;
begin
  select * into d from devices where id = p_device;
  if not found then raise exception 'device_not_found'; end if;
  select * into s from measurement_sessions where id = p_session for update;
  if not found or s.pond_id <> d.pond_id then raise exception 'session_not_found'; end if;
  if jsonb_typeof(p_samples) <> 'array' or jsonb_array_length(p_samples) = 0 or jsonb_array_length(p_samples) > 200 then
    raise exception 'invalid_samples';
  end if;
  if s.status not in ('menunggu_drone','berjalan') then
    return jsonb_build_object('accepted', false, 'status', s.status);   -- sesi sudah ditutup; alat harus berhenti
  end if;
  select * into cfg from pond_settings where pond_id = s.pond_id;

  for e in select * from jsonb_array_elements(p_samples) loop
    begin
      t := (e->>'t_sec')::int; v_do := (e->>'do_mgl')::numeric; v_ph := (e->>'ph')::numeric; v_t := (e->>'temp_c')::numeric;
      bat := nullif(e->>'battery_pct','')::int;
    exception when others then raise exception 'invalid_sample'; end;
    if t is null or v_do is null or v_ph is null or v_t is null
       or t < 0 or t > 3600 or v_do < 0 or v_do > 30 or v_ph < 0 or v_ph > 14 or v_t < -5 or v_t > 60
       or (bat is not null and (bat < 0 or bat > 100)) then
      raise exception 'invalid_sample';
    end if;
    insert into measurement_samples (session_id, t_sec, do_mgl, ph, temp_c, battery_pct)
    values (p_session, t, v_do, v_ph, v_t, bat)
    on conflict (session_id, t_sec) do update
      set do_mgl = excluded.do_mgl, ph = excluded.ph, temp_c = excluded.temp_c, battery_pct = excluded.battery_pct;
  end loop;

  select * into cur from measurement_samples where session_id = p_session order by t_sec desc limit 1;
  update devices set last_seen_at = now(), telemetry_ok = true, battery_pct = coalesce(cur.battery_pct, battery_pct) where id = p_device;
  update measurement_sessions
     set packets_received = (select count(*) from measurement_samples where session_id = p_session),
         status = 'berjalan', started_at = coalesce(started_at, now())
   where id = p_session;

  mx := cur.t_sec;
  -- stabil = selama 60 dtk terakhir rentang nilai (maks − min) tiap parameter ≤ ambang perubahan 1 menit
  -- (DO ≤ 0,1 · pH ≤ 0,05 · suhu ≤ 0,1) dan data sudah mencakup ≥ 60 dtk. Rentang (bukan selisih dua titik)
  -- dipakai supaya osilasi yang kebetulan sefase tidak dianggap stabil.
  select (max(do_mgl) - min(do_mgl) <= 0.1) and (max(ph) - min(ph) <= 0.05) and (max(temp_c) - min(temp_c) <= 0.1)
         and exists (select 1 from measurement_samples x where x.session_id = p_session and x.t_sec <= mx - 60)
    into stable
    from measurement_samples where session_id = p_session and t_sec >= mx - 60;
  if stable or mx >= cfg.measure_minutes * 60 then
    perform finalize_session(p_session);
    finalized := true;
  end if;
  return jsonb_build_object('accepted', true, 'status', (select status from measurement_sessions where id = p_session),
                            'finalized', finalized, 'packets_received', (select packets_received from measurement_sessions where id = p_session));
end $$;

-- Watchdog (dipanggil pg_cron / Edge Function session-watchdog tiap menit)
create function run_watchdog() returns jsonb
language plpgsql security definer set search_path = public as $$
declare lost int := 0; devs int := 0; feeds int := 0; r record;
begin
  for r in select s.id from measurement_sessions s
            where s.status = 'berjalan'
              and coalesce((select max(created_at) from measurement_samples m where m.session_id = s.id), s.started_at) < now() - interval '30 seconds'
  loop perform mark_session_lost(r.id); lost := lost + 1; end loop;
  update devices set telemetry_ok = false where telemetry_ok and (last_seen_at is null or last_seen_at < now() - interval '60 seconds');
  get diagnostics devs = row_count;
  update feeding_runs set status = 'terputus', ended_at = now() where status = 'berjalan' and updated_at < now() - interval '60 seconds';
  get diagnostics feeds = row_count;
  return jsonb_build_object('sessions_lost', lost, 'devices_offline', devs, 'feeding_lost', feeds);
end $$;

-- ---------- RPC untuk aplikasi (dipanggil pengguna login) ----------
create function pond_farm(p_pond uuid) returns uuid language sql stable security definer set search_path = public as $$
  select farm_id from ponds where id = p_pond $$;
create function is_farm_member(farm uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from farm_members where farm_id = farm and user_id = auth.uid()) $$;
create function can_operate(farm uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from farm_members where farm_id = farm and user_id = auth.uid() and role in ('owner','operator')) $$;

create function create_farm_with_pond(p_farm_name text default 'Tambak Saya', p_pond_name text default 'Kolam A1') returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); f uuid; p uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select pd.id into p from ponds pd join farm_members m on m.farm_id = pd.farm_id
   where m.user_id = uid order by pd.created_at limit 1;
  if found then return p; end if;                                   -- idempoten
  insert into farms (name) values (coalesce(nullif(trim(p_farm_name), ''), 'Tambak Saya')) returning id into f;
  insert into farm_members (farm_id, user_id, role) values (f, uid, 'owner');
  insert into ponds (farm_id, name) values (f, coalesce(nullif(trim(p_pond_name), ''), 'Kolam A1')) returning id into p;
  insert into pond_settings (pond_id) values (p);
  insert into feed_schedule (pond_id, session_no, time_of_day)
    values (p, 1, '05:30'), (p, 2, '09:30'), (p, 3, '13:30'), (p, 4, '17:30');
  return p;
end $$;

create function cancel_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s measurement_sessions;
begin
  select * into s from measurement_sessions where id = p_session;
  if not found or not can_operate(pond_farm(s.pond_id)) then raise exception 'forbidden'; end if;
  update measurement_sessions set status = 'dibatalkan', ended_at = now()
   where id = p_session and status in ('menunggu_drone','berjalan');
end $$;

-- Tombol "Pantau penebaran pakan": membuat (atau mengembalikan) run aktif untuk sesi berhasil yang boleh terbang.
create function start_feeding_run(p_session uuid) returns feeding_runs
language plpgsql security definer set search_path = public as $$
declare r measurement_results; run feeding_runs; bat int;
begin
  select * into r from measurement_results where session_id = p_session;
  if not found or not can_operate(pond_farm(r.pond_id)) then raise exception 'forbidden'; end if;
  if not r.flight_allowed or r.portion_kg <= 0 then raise exception 'flight_locked'; end if;
  select * into run from feeding_runs where session_id = p_session order by started_at desc limit 1;
  if found then return run; end if;
  select battery_pct into bat from devices where pond_id = r.pond_id and kind = 'drone' order by created_at limit 1;
  insert into feeding_runs (pond_id, session_id, target_kg, battery_pct) values (r.pond_id, p_session, r.portion_kg, bat)
  returning * into run;
  return run;
end $$;

-- DO terendah per hari (zona waktu WIB), termasuk hari tanpa data (min_do = null)
create function daily_min_do(p_pond uuid, p_days int default 7) returns table (day date, min_do numeric, do_status status_kolam)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_farm_member(pond_farm(p_pond)) then raise exception 'forbidden'; end if;
  return query
    select d.day, d.m, case when d.m is null then null else classify_do(d.m, p_pond) end
    from (select g::date as day, (select min(r.do_mgl) from measurement_results r
                      where r.pond_id = p_pond and (r.measured_at at time zone 'Asia/Jakarta')::date = g::date) as m
    from generate_series((now() at time zone 'Asia/Jakarta')::date - (greatest(p_days,1) - 1),
                         (now() at time zone 'Asia/Jakarta')::date, interval '1 day') g) d
    order by 1;
end $$;
