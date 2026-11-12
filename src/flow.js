// Pengikat aksi UI -> repo (sumber data apa pun).
import { onAction, go, draw } from './router.js';
import { toggleLoginMode } from './screens/login.js';
import { repo } from './data/repo.js';

onAction('start', () => repo.start());
onAction('cancel', () => repo.cancel());
onAction('feed-start', () => repo.startFeed());
onAction('notif', (el) => repo.openNotif(el.dataset.k, el.dataset.id));
onAction('signout', () => repo.signOut());
onAction('login-mode', () => { toggleLoginMode(); draw(); });
export { go };
