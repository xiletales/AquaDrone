-- AQUA-DRONE · 0004 · fungsi untuk Edge Function perangkat (hanya service_role)
-- Default privileges Supabase memberi EXECUTE ke anon/authenticated pada fungsi baru: cabut dulu.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Autentikasi: kunci perangkat (sudah di-hash SHA-256 oleh Edge Function) -> perangkat
create function device_by_key_hash(p_hash text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', d.id, 'pond_id', d.pond_id, 'kind', d.kind, 'name', d.name)
  from device_secrets s join devices d on d.id = s.device_id
  where p_hash ~ '^[0-9a-f]{64}$' and s.key_hash = p_hash
$$;

create function device_heartbeat(p_device uuid, p_battery int, p_telemetry_ok boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_battery is not null and (p_battery < 0 or p_battery > 100) then raise exception 'invalid_payload'; end if;
  update devices set last_seen_at = now(), telemetry_ok = coalesce(p_telemetry_ok, true),
         battery_pct = coalesce(p_battery, battery_pct)
   where id = p_device;
  if not found then raise exception 'device_not_found'; end if;
  return jsonb_build_object('ok', true, 'server_time', now());
end $$;

-- Polling: sesi aktif untuk kolam perangkat + run pakan aktif (bila ada)
create function device_poll(p_device uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d devices; s measurement_sessions; cfg pond_settings; fr feeding_runs; mx int; ses jsonb := null; feed jsonb := null;
begin
  update devices set last_seen_at = now() where id = p_device returning * into d;
  if not found then raise exception 'device_not_found'; end if;
  select * into cfg from pond_settings where pond_id = d.pond_id;
  select * into s from measurement_sessions where pond_id = d.pond_id and status in ('menunggu_drone','berjalan')
   order by requested_at desc limit 1;
  if found then
    select max(t_sec) into mx from measurement_samples where session_id = s.id;
    ses := jsonb_build_object('session_id', s.id, 'session_no', s.session_no, 'status', s.status,
             'sample_interval_sec', cfg.sample_interval_sec, 'measure_minutes', cfg.measure_minutes,
             'resume_after_t_sec', mx);
  end if;
  select * into fr from feeding_runs where pond_id = d.pond_id and status = 'berjalan' order by started_at desc limit 1;
  if found then
    feed := jsonb_build_object('run_id', fr.id, 'target_kg', fr.target_kg, 'dispensed_kg', fr.dispensed_kg, 'pass_total', fr.pass_total);
  end if;
  return jsonb_build_object('session', ses, 'feeding', feed, 'server_time', now());
end $$;

-- Progres penebaran pakan. Run dibuat aplikasi (start_feeding_run); alat hanya memperbarui.
create function device_feed_progress(p_device uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d devices; r feeding_runs; rid uuid; disp numeric; pc int; bat int; alt numeric; gps boolean; fin boolean;
begin
  select * into d from devices where id = p_device;
  if not found then raise exception 'device_not_found'; end if;
  begin
    rid := nullif(p_payload->>'run_id','')::uuid;
    disp := (p_payload->>'dispensed_kg')::numeric;
    pc := nullif(p_payload->>'pass_current','')::int;
    bat := nullif(p_payload->>'battery_pct','')::int;
    alt := nullif(p_payload->>'altitude_m','')::numeric;
    gps := coalesce((p_payload->>'gps_locked')::boolean, false);
    fin := coalesce((p_payload->>'done')::boolean, false);
  exception when others then raise exception 'invalid_payload'; end;
  if disp is null or disp < 0 or disp > 1000 or (bat is not null and (bat < 0 or bat > 100))
     or (alt is not null and (alt < 0 or alt > 500)) or (pc is not null and (pc < 1 or pc > 50)) then
    raise exception 'invalid_payload';
  end if;

  if rid is not null then
    select * into r from feeding_runs where id = rid and pond_id = d.pond_id for update;
  else
    select * into r from feeding_runs where pond_id = d.pond_id and status = 'berjalan' order by started_at desc limit 1 for update;
  end if;
  if not found then raise exception 'run_not_found'; end if;
  if r.status <> 'berjalan' then return jsonb_build_object('accepted', false, 'status', r.status); end if;

  update feeding_runs set
      dispensed_kg = least(target_kg, greatest(dispensed_kg, disp)),         -- tidak pernah turun / melebihi target
      pass_current = least(pass_total, coalesce(pc, pass_current)),
      battery_pct = coalesce(bat, battery_pct), altitude_m = coalesce(alt, altitude_m), gps_locked = gps,
      status = case when fin then 'selesai'::pakan_status else status end,
      ended_at = case when fin then now() else ended_at end
    where id = r.id returning * into r;
  update devices set last_seen_at = now(), telemetry_ok = true, battery_pct = coalesce(bat, battery_pct) where id = p_device;
  return jsonb_build_object('accepted', true, 'status', r.status, 'run_id', r.id, 'dispensed_kg', r.dispensed_kg);
end $$;

revoke all on function device_by_key_hash(text), device_heartbeat(uuid, int, boolean), device_poll(uuid),
  device_feed_progress(uuid, jsonb) from public, anon, authenticated;
grant execute on function device_by_key_hash(text), device_heartbeat(uuid, int, boolean), device_poll(uuid),
  device_feed_progress(uuid, jsonb) to service_role;
