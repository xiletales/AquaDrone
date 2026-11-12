import { boot } from './load.mjs';
process.chdir(new URL('.', import.meta.url).pathname);
const db = await boot();
const A='00000000-0000-0000-0000-0000000000a1', B='00000000-0000-0000-0000-0000000000a2', POND='00000000-0000-0000-0000-0000000000b1', DRONE='00000000-0000-0000-0000-0000000000d1';
let pass=0, fail=0; const ok=(n,c,x='')=>{c?pass++:fail++; console.log((c?'PASS':'FAIL')+' '+n+(c?'':' -> '+x));};
const as=async(uid,fn)=>{ await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false)`); try{return await fn();} finally{ await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false)`);} };
const asSvc=async(fn)=>{ await db.exec(`set role service_role`); try{return await fn();} finally{ await db.exec(`reset role`);} };
const err=async(p)=>{ try{ await p; return null;}catch(e){return e.message;} };
const q=async(s)=>(await db.query(s)).rows;
// 1. RLS aktif di semua tabel
const nr=await q(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity`);
ok('RLS aktif di semua tabel', nr.length===0, JSON.stringify(nr));
// 2. isolasi pengguna
await db.exec(`insert into auth.users(id,email) values('${B}','b@x.test')`);
const pondB = await as(B, async()=> (await q(`select create_farm_with_pond('Tambak B','Kolam B1') id`))[0].id);
ok('create_farm_with_pond membuat kolam', !!pondB);
ok('create_farm_with_pond idempoten', await as(B, async()=> (await q(`select create_farm_with_pond() id`))[0].id)===pondB);
const setB = await as(B, async()=> q(`select * from pond_settings`)); ok('B melihat 1 pengaturan sendiri', setB.length===1 && setB[0].pond_id===pondB);
ok('B tidak melihat hasil kolam A', (await as(B, async()=> q(`select * from measurement_results`))).length===0);
ok('B tidak melihat notifikasi A', (await as(B, async()=> q(`select * from notifications`))).length===0);
ok('A tidak melihat kolam B', (await as(A, async()=> q(`select id from ponds`))).every(r=>r.id!==pondB));
ok('B tak bisa buat sesi di kolam A', !!(await as(B, ()=>err(db.query(`insert into measurement_sessions(pond_id,session_no) values('${POND}',1)`)))));
ok('B tak bisa ubah pengaturan A (0 baris)', (await as(B, async()=>{ const r=await db.query(`update pond_settings set population=1 where pond_id='${POND}'`); return r.affectedRows; }))===0);
ok('daily_min_do ditolak untuk non-anggota', !!(await as(B, ()=>err(db.query(`select * from daily_min_do('${POND}',7)`)))));
// 3. klien tak boleh menulis tabel terlindungi
for (const [n,s] of [
  ['insert measurement_results', `insert into measurement_results(session_id,pond_id,do_mgl,ph,temp_c,do_status,ph_status,temp_status,overall,portion_pct,portion_kg,flight_allowed) select id,pond_id,4,8,30,'aman','aman','aman','aman',100,5,true from measurement_sessions limit 1`],
  ['insert measurement_samples', `insert into measurement_samples(session_id,t_sec,do_mgl,ph,temp_c) select id,1,4,8,30 from measurement_sessions limit 1`],
  ['insert feeding_runs', `insert into feeding_runs(pond_id,target_kg) values('${POND}',1)`],
  ['insert devices', `insert into devices(pond_id,kind,name) values('${POND}','drone','x')`],
  ['insert notifications', `insert into notifications(pond_id,level,title,body) values('${POND}','aman','x','y')`],
  ['update notifications.title', `update notifications set title='x'`],
  ['update measurement_results', `update measurement_results set do_mgl=9`],
  ['select device_secrets', `select * from device_secrets`],
  ['insert device_secrets', `insert into device_secrets(device_id,key_hash) values('${DRONE}','x')`],
  ['panggil finalize_session', `select finalize_session(gen_random_uuid())`],
  ['panggil ingest_telemetry', `select ingest_telemetry('${DRONE}',gen_random_uuid(),'[]')`],
  ['panggil run_watchdog', `select run_watchdog()`],
]) ok('klien ditolak: '+n, !!(await as(A, ()=>err(db.query(s)))));
ok('anon tak bisa baca ponds', !!(await (async()=>{await db.exec('set role anon'); const e=await err(db.query('select * from ponds')); await db.exec('reset role'); return e;})()));
ok('klien boleh update notifications.read_at', (await as(A, async()=>{ const r=await db.query(`update notifications set read_at=now() where title='Kolam A1 aman'`); return r.affectedRows; }))===1);
ok('klien boleh update pengaturan sendiri', (await as(A, async()=>{ const r=await db.query(`update pond_settings set population=425000 where pond_id='${POND}'`); return r.affectedRows; }))===1);
// 4. klasifikasi & porsi
const cls=async(f,v)=> (await q(`select ${f}(${v},'${POND}') s`))[0].s;
const cases=[['classify_do',2.99,'kritis'],['classify_do',3,'waspada'],['classify_do',3.9,'waspada'],['classify_do',4,'aman'],
 ['classify_ph',6.99,'kritis'],['classify_ph',7,'waspada'],['classify_ph',7.49,'waspada'],['classify_ph',7.5,'aman'],['classify_ph',8.5,'aman'],['classify_ph',8.6,'waspada'],['classify_ph',9,'waspada'],['classify_ph',9.1,'kritis'],
 ['classify_temp',25.9,'kritis'],['classify_temp',26,'waspada'],['classify_temp',27.9,'waspada'],['classify_temp',28,'aman'],['classify_temp',32,'aman'],['classify_temp',32.1,'waspada'],['classify_temp',34,'waspada'],['classify_temp',34.1,'kritis']];
for (const [f,v,e] of cases) ok(`${f}(${v})=${e}`, (await cls(f,v))===e);
ok('full_portion_kg = 5 (dibatasi)', Number((await q(`select full_portion_kg('${POND}') p`))[0].p)===5);
await db.exec(`update pond_settings set population=50000, feeding_rate_pct=2 where pond_id='${POND}'`);
ok('full_portion_kg tanpa batas', Math.abs(Number((await q(`select full_portion_kg('${POND}') p`))[0].p)-(50000*10.37/1000*0.02/4))<1e-9);
await db.exec(`update pond_settings set population=425000, feeding_rate_pct=4.32 where pond_id='${POND}'`);
// riwayat
const hist=await as(A, async()=> q(`select to_char(day,'MM-DD') d, min_do from daily_min_do('${POND}',7)`));
ok('daily_min_do 7 hari = data desain ', hist.length===7 && [4.5,4.2,4.8,4.0,3.8,4.4].every((v,i)=>Number(hist[i].min_do)===v) && Number(hist[6].min_do)===3.6, JSON.stringify(hist));
const today=await as(A, async()=> q(`select to_char(measured_at at time zone 'Asia/Jakarta','HH24.MI') jam, do_mgl, portion_pct, overall from measurement_results where (measured_at at time zone 'Asia/Jakarta')::date=(now() at time zone 'Asia/Jakarta')::date and session_id in (select id from measurement_sessions where status='selesai') order by measured_at limit 4`));
console.log('   hari ini (seed):', JSON.stringify(today));
// 5. skenario perangkat (service_role)
async function runScenario(name, gen, opts={}){
  await db.exec(`delete from measurement_sessions where pond_id='${POND}' and status in ('menunggu_drone','berjalan')`);
  const sid = await as(A, async()=> (await q(`insert into measurement_sessions(pond_id,session_no) values('${POND}',1) returning id`))[0].id);
  let last=null;
  for (let t=0;t<=600;t+=5){ const s=gen(t); if(!s) break;
    last = await asSvc(async()=> (await q(`select ingest_telemetry('${DRONE}','${sid}','${JSON.stringify([{t_sec:t,...s,battery_pct:80}])}'::jsonb) r`))[0].r);
    if (last.finalized) break; }
  return {sid,last};
}
const osc=(t,base,amp,th)=> base + amp*Math.max(0,1-(t/600)/th)*Math.sin(t/9);
const gen=(d,p,tt)=>(t)=>({do_mgl:+osc(t,d,.5,.65).toFixed(2),ph:+osc(t,p,.15,.55).toFixed(2),temp_c:+osc(t,tt,1.2,.7).toFixed(2)});
for (const [name,d,p,tt,ov,kg,fl,body] of [['aman',4.1,7.9,29.8,'aman',5,true,'Boleh menebar pakan 100% (5,0 kg).'],['waspada',3.6,7.8,29.4,'waspada',2.5,true,'DO 3,6 mg/L. Porsi pakan 50% (2,5 kg).'],['kritis',2.6,7.7,29.1,'kritis',0,false,'DO 2,6 mg/L. Penerbangan terkunci. Nyalakan aerator.']]) {
  const {sid,last}=await runScenario(name, gen(d,p,tt));
  const r=(await q(`select * from measurement_results where session_id='${sid}'`))[0];
  const n=(await q(`select * from notifications where result_session_id='${sid}'`))[0];
  const ses=(await q(`select * from measurement_sessions where id='${sid}'`))[0];
  ok(`skenario ${name}: selesai & hasil`, last.finalized && r && r.overall===ov && Number(r.portion_kg)===kg && r.flight_allowed===fl, JSON.stringify([last,r]));
  ok(`skenario ${name}: nilai ${d}/${p}/${tt}`, Math.abs(r.do_mgl-d)<=0.1 && Math.abs(r.ph-p)<=0.1 && Math.abs(r.temp_c-tt)<=0.2, JSON.stringify(r));
  ok(`skenario ${name}: notifikasi persis`, n && n.title===`Kolam A1 ${ov}` && n.body===body && n.level===ov, JSON.stringify(n));
  ok(`skenario ${name}: sesi selesai, paket`, ses.status==='selesai' && ses.packets_received>=20, JSON.stringify(ses));
  console.log(`   ${name}: berhenti di t=${(await q(`select max(t_sec) m from measurement_samples where session_id='${sid}'`))[0].m}s, paket=${ses.packets_received}`);
}
// idempoten + sesi tertutup
const sidX=(await q(`select session_id s from measurement_results order by measured_at desc limit 1`))[0].s;
const late=await asSvc(async()=>(await q(`select ingest_telemetry('${DRONE}','${sidX}','[{"t_sec":999,"do_mgl":4,"ph":8,"temp_c":30}]'::jsonb) r`))[0].r);
ok('kirim ke sesi tertutup -> accepted:false', late.accepted===false, JSON.stringify(late));
// input tidak valid
{ const sid=await as(A, async()=> (await q(`insert into measurement_sessions(pond_id,session_no) values('${POND}',1) returning id`))[0].id);
  ok('sampel invalid (ph 20) ditolak', !!(await asSvc(()=>err(db.query(`select ingest_telemetry('${DRONE}','${sid}','[{"t_sec":0,"do_mgl":4,"ph":20,"temp_c":30}]'::jsonb)`)))));
  ok('sampel teks ditolak', !!(await asSvc(()=>err(db.query(`select ingest_telemetry('${DRONE}','${sid}','[{"t_sec":"a","do_mgl":4,"ph":8,"temp_c":30}]'::jsonb)`)))));
  const a1=await asSvc(async()=>(await q(`select ingest_telemetry('${DRONE}','${sid}','[{"t_sec":0,"do_mgl":4,"ph":8,"temp_c":30},{"t_sec":5,"do_mgl":4,"ph":8,"temp_c":30}]'::jsonb) r`))[0].r);
  const a2=await asSvc(async()=>(await q(`select ingest_telemetry('${DRONE}','${sid}','[{"t_sec":5,"do_mgl":4,"ph":8,"temp_c":30}]'::jsonb) r`))[0].r);
  ok('kirim ulang idempoten (2 paket)', a1.packets_received===2 && a2.packets_received===2 && a2.status==='berjalan', JSON.stringify([a1,a2]));
  // watchdog: sampel terakhir > 30 dtk -> data terputus
  await db.exec(`update measurement_samples set created_at=now()-interval '45 seconds' where session_id='${sid}'`);
  await db.exec(`update devices set last_seen_at=now()-interval '90 seconds'`);
  const w=await asSvc(async()=>(await q(`select run_watchdog() r`))[0].r);
  const sx=(await q(`select * from measurement_sessions where id='${sid}'`))[0];
  ok('watchdog: sesi -> data_terputus tanpa hasil', sx.status==='data_terputus' && sx.stopped_at_sec===5 && (await q(`select 1 from measurement_results where session_id='${sid}'`)).length===0, JSON.stringify([w,sx]));
  ok('watchdog: perangkat offline', w.devices_offline>=1 && (await q(`select telemetry_ok from devices where id='${DRONE}'`))[0].telemetry_ok===false, JSON.stringify(w));
}
// lost di detik 372 -> stopped_at_sec 372
{ const sid=await as(A, async()=> (await q(`insert into measurement_sessions(pond_id,session_no) values('${POND}',1) returning id`))[0].id);
  for(let t=0;t<=372;t+=12) await asSvc(()=>db.query(`select ingest_telemetry('${DRONE}','${sid}','[{"t_sec":${t},"do_mgl":${(4.1+.5*Math.sin(t/9)).toFixed(2)},"ph":${(7.9+.15*Math.sin(t/9)).toFixed(2)},"temp_c":${(29.8+1.2*Math.sin(t/9)).toFixed(2)}}]'::jsonb)`));
  await db.exec(`update measurement_samples set created_at=now()-interval '40 seconds' where session_id='${sid}'`);
  await asSvc(()=>db.query(`select run_watchdog()`));
  ok('lost: stopped_at_sec=372', (await q(`select stopped_at_sec s from measurement_sessions where id='${sid}'`))[0].s===372); }
// sesi baru membatalkan yang lama; nomor sesi; cancel; start_feeding_run
{ const s1=await as(A, async()=> (await q(`insert into measurement_sessions(pond_id,session_no) values('${POND}',3) returning id`))[0].id);
  const s2=await as(A, async()=> (await q(`insert into measurement_sessions(pond_id,session_no,status) values('${POND}',3,'selesai') returning id, session_no, status`))[0]);
  ok('sesi lama dibatalkan otomatis', (await q(`select status from measurement_sessions where id='${s1}'`))[0].status==='dibatalkan');
  ok('status & nomor sesi dipaksa trigger', s2.status==='menunggu_drone' && s2.session_no>=1 && s2.session_no<=4, JSON.stringify(s2));
  await as(A, ()=>db.query(`select cancel_session('${s2.id}')`));
  ok('cancel_session', (await q(`select status from measurement_sessions where id='${s2.id}'`))[0].status==='dibatalkan');
  ok('B tak bisa cancel sesi A', !!(await as(B, ()=>err(db.query(`select cancel_session('${s2.id}')`)))));
  const wsid=(await q(`select session_id s from measurement_results where overall='waspada' order by measured_at desc limit 1`))[0].s;
  const run=await as(A, async()=> (await q(`select * from start_feeding_run('${wsid}')`))[0]);
  ok('start_feeding_run target=2,5 kg', Number(run.target_kg)===2.5 && run.status==='berjalan', JSON.stringify(run));
  ok('start_feeding_run idempoten', (await as(A, async()=> (await q(`select id from start_feeding_run('${wsid}')`))[0].id))===run.id);
  const ksid=(await q(`select session_id s from measurement_results where overall='kritis' limit 1`))[0].s;
  ok('start_feeding_run ditolak saat kritis', !!(await as(A, ()=>err(db.query(`select * from start_feeding_run('${ksid}')`)))));
  await db.exec(`alter table feeding_runs disable trigger feeding_runs_touch; update feeding_runs set updated_at=now()-interval '2 minutes' where id='${run.id}'; alter table feeding_runs enable trigger feeding_runs_touch`);
  const w=await asSvc(async()=>(await q(`select run_watchdog() r`))[0].r);
  ok('watchdog: feeding terputus', (await q(`select status from feeding_runs where id='${run.id}'`))[0].status==='terputus', JSON.stringify(w)); }
console.log(`\nTOTAL: ${pass} lulus, ${fail} gagal`); process.exit(fail?1:0);
