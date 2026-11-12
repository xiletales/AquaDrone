-- AQUA-DRONE · seed lokal (HANYA untuk pengembangan). Pengguna demo: demo@aquadrone.test / demo-aqua-123
-- Riwayat hari ini + 7 hari persis seperti desain.

do $$
declare
  uid uuid := '00000000-0000-0000-0000-0000000000a1';
  farm uuid := '00000000-0000-0000-0000-0000000000f1';
  pond uuid := '00000000-0000-0000-0000-0000000000b1';
  today date := (now() at time zone 'Asia/Jakarta')::date;
  sid uuid; i int; d date; v numeric; tm time; ov status_kolam; kg numeric; pct int;
  hist numeric[] := array[4.5, 4.2, 4.8, 4.0, 3.8, 4.4];   -- 6 hari sebelum hari ini
  times time[] := array['05:30','09:30','13:30','17:30'];
  dos numeric[] := array[3.6, 5.2, 5.6, 4.4];
begin
  -- trigger sesi memaksa status awal; untuk data riwayat kita matikan sementara
  alter table measurement_sessions disable trigger measurement_sessions_defaults;

  -- pengguna demo (login email + kata sandi)
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo@aquadrone.test',
          crypt('demo-aqua-123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
  on conflict (id) do nothing;
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', 'demo@aquadrone.test'), 'email', now(), now(), now())
  on conflict do nothing;

  insert into farms (id, name) values (farm, 'Tambak Contoh');
  insert into farm_members (farm_id, user_id, role) values (farm, uid, 'owner');
  insert into ponds (id, farm_id, name) values (pond, farm, 'Kolam A1');
  insert into pond_settings (pond_id) values (pond);
  insert into feed_schedule (pond_id, session_no, time_of_day)
    values (pond, 1, '05:30'), (pond, 2, '09:30'), (pond, 3, '13:30'), (pond, 4, '17:30');
  insert into devices (id, pond_id, kind, name, battery_pct, telemetry_ok, last_seen_at) values
    ('00000000-0000-0000-0000-0000000000d1', pond, 'drone',  'Drone amfibi', 82, true, now()),
    ('00000000-0000-0000-0000-0000000000d2', pond, 'konsol', 'Konsol',       null, true, now());

  -- hari ini: 05.30 · 09.30 · 13.30 · 17.30
  for i in 1..4 loop
    v := dos[i]; tm := times[i];
    ov := classify_do(v, pond); pct := case ov when 'aman' then 100 when 'waspada' then 50 else 0 end;
    kg := full_portion_kg(pond) * pct / 100;
    insert into measurement_sessions (id, pond_id, session_no, status, requested_by, requested_at, started_at, ended_at, packets_received)
    values (gen_random_uuid(), pond, i, 'selesai', uid,
            ((today + tm) at time zone 'Asia/Jakarta'), ((today + tm) at time zone 'Asia/Jakarta'),
            ((today + tm + interval '11 minutes') at time zone 'Asia/Jakarta'), 120)
    returning id into sid;
    insert into measurement_results (session_id, pond_id, measured_at, do_mgl, ph, temp_c, do_status, ph_status, temp_status, overall, portion_pct, portion_kg, flight_allowed)
    values (sid, pond, ((today + tm + interval '11 minutes') at time zone 'Asia/Jakarta'), v, case when i = 1 then 7.8 else 7.9 end,
            case when i = 1 then 29.4 else 29.8 end, ov, 'aman', 'aman', ov, pct, kg, true);
  end loop;
  -- 6 hari sebelumnya: satu pengukuran 05.30 per hari
  for i in 1..6 loop
    d := today - (7 - i); v := hist[i];
    ov := classify_do(v, pond); pct := case ov when 'aman' then 100 when 'waspada' then 50 else 0 end;
    insert into measurement_sessions (id, pond_id, session_no, status, requested_by, requested_at, started_at, ended_at, packets_received)
    values (gen_random_uuid(), pond, 1, 'selesai', uid, ((d + time '05:30') at time zone 'Asia/Jakarta'),
            ((d + time '05:30') at time zone 'Asia/Jakarta'), ((d + time '05:40') at time zone 'Asia/Jakarta'), 120)
    returning id into sid;
    insert into measurement_results (session_id, pond_id, measured_at, do_mgl, ph, temp_c, do_status, ph_status, temp_status, overall, portion_pct, portion_kg, flight_allowed)
    values (sid, pond, ((d + time '05:40') at time zone 'Asia/Jakarta'), v, 7.9, 29.8, ov, 'aman', 'aman', ov, pct, full_portion_kg(pond) * pct / 100, true);
  end loop;

  -- notifikasi seperti layar kunci
  insert into notifications (pond_id, level, title, body, created_at) values
    (pond, 'kritis',  'Kolam A1 kritis',  'DO 2,6 mg/L. Penerbangan terkunci. Nyalakan aerator.', now()),
    (pond, 'waspada', 'Kolam A1 waspada', 'DO 3,6 mg/L. Porsi pakan 50% (2,5 kg).', now() - interval '2 minutes'),
    (pond, 'aman',    'Kolam A1 aman',    'Boleh menebar pakan 100% (5,0 kg).', now() - interval '4 minutes');

  alter table measurement_sessions enable trigger measurement_sessions_defaults;
end $$;
