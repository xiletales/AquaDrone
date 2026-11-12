import { register, go } from '../router.js';
import { $ } from '../state.js';
import { repo } from '../data/repo.js';

let mode = 'in';   // 'in' = Masuk, 'up' = Daftar
let error = '';
const view = () => `<div class="hd login-hd"><span class="lg"><img src="/logo.png" alt="Logo AQUA-DRONE"></span><div class="hx"><small>Akuakultur presisi · Tambak udang vaname</small><h1>AQUA-DRONE</h1></div></div>
<form class="cd lform" id="lf" novalidate>
<label class="fl">Email<input id="em" type="email" inputmode="email" autocomplete="email" required></label>
<label class="fl">Kata sandi<input id="pw" type="password" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" minlength="6" required></label>
<div class="sb err" id="er" role="alert" ${error ? '' : 'hidden'}>${error}</div>
<button class="bp" type="submit" id="lb">${mode === 'in' ? 'Masuk' : 'Daftar'}</button></form>
<button class="bl" data-act="login-mode">${mode === 'in' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}</button>`;

register('login', {
  view,
  mount: () => {
    const form = $('lf');
    const onSubmit = async (e) => {
      e.preventDefault();
      const email = $('em').value.trim(), pw = $('pw').value;
      if (!email || !pw) { show('Isi email dan kata sandi'); return; }
      $('lb').disabled = true;
      try { go(await (mode === 'in' ? repo.signIn(email, pw) : repo.signUp(email, pw))); }
      catch (err) { show(err.message || 'Gagal masuk. Coba lagi.'); $('lb').disabled = false; }
    };
    const show = (m) => { error = m; $('er').textContent = m; $('er').hidden = !m; };
    form.addEventListener('submit', onSubmit);
    return () => form.removeEventListener('submit', onSubmit);
  },
});
export const toggleLoginMode = () => { mode = mode === 'in' ? 'up' : 'in'; error = ''; };
