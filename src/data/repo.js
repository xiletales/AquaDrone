// Lapisan data: layar hanya memanggil `repo.*`. Implementasi dipilih lewat VITE_DATA_SOURCE (mock | supabase).
import { MOCK } from '../state.js';

/** Antarmuka (diisi oleh repo.mock.js atau repo.supabase.js). Semua metode aman dipanggil sebelum diisi. */
export const repo = {
  /** @returns {Promise<'home'|'login'|'wait'|'measure'>} layar awal */
  init: async () => 'home',
  signIn: async () => {}, signUp: async () => {}, signOut: async () => {},
  start() {}, cancel() {}, startFeed() {},
  saveSettings() {}, loadHistory: async () => {}, openNotif() {}, markAllRead() {},
  mountMeasure() {}, mountWait() {}, mountFeed() {},
  needsAuth: false,
};

export async function loadRepo() {
  const mod = MOCK ? await import('./repo.mock.js') : await import('./repo.supabase.js');
  Object.assign(repo, mod.default);
  return repo;
}
