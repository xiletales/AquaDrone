// Langganan Supabase Realtime (postgres_changes). Tidak ada polling.
const POND_TABLES = ['measurement_sessions', 'measurement_results', 'feeding_runs', 'notifications', 'devices'];

/** Satu channel untuk semua tabel kolam. h = { <tabel>: (payload) => void, status: (s) => void }. */
export function subscribePond(sb, pondId, h) {
  const ch = sb.channel('pond-' + pondId);
  for (const table of POND_TABLES) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `pond_id=eq.${pondId}` }, (p) => h[table]?.(p));
  }
  ch.subscribe((status) => h.status?.(status));
  return () => sb.removeChannel(ch);
}

/** Sampel telemetri satu sesi. */
export function subscribeSamples(sb, sessionId, onSample) {
  const ch = sb.channel('samples-' + sessionId);
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'measurement_samples', filter: `session_id=eq.${sessionId}` }, (p) => onSample(p.new));
  ch.subscribe();
  return () => sb.removeChannel(ch);
}
