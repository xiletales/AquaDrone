// Latar belakang animasi (SVG 1440x900): matahari/bulan, awan, drone, bakau, air, udang, gelembung.
import { $ } from '../state.js';

const R = (a, b) => a + Math.random() * (b - a);

const defs = `<defs>
<radialGradient id="gl"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="wt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient></defs>`;

const trees = (y, h, o) => {
  let d = `M0 620L0 ${y}`;
  for (let x = 0; x < 1440; x += 36) d += `Q${x + 18} ${y - R(10, h) * 2} ${x + 36} ${y}`;
  return `<path d="${d}L1440 620Z" fill="#000" opacity="${o}"/>`;
};
const wave = (y, a, o, t, dir) => {
  let d = `M0 ${y}q90 -${a} 180 0`;
  for (let i = 0; i < 15; i++) d += 't180 0';
  return `<path class="wv" style="animation-duration:${t}s;animation-direction:${dir}" d="${d}V900H0Z" fill="#fff" opacity="${o}"/>`;
};
const shr = (x, y, w, h, delay = 0) =>
  `<g class="sw" style="animation-delay:-${delay}s"><use href="#sh" x="${x}" y="${y}" width="${w}" height="${h}"/></g>`;

export function initScene() {
  const hour = new Date().getHours();
  document.body.dataset.day = hour >= 6 && hour < 18 ? 1 : 0;
  let stars = '';
  for (let i = 0; i < 46; i++)
    stars += `<circle cx="${R(0, 1440).toFixed(0)}" cy="${R(10, 420).toFixed(0)}" r="${R(0.8, 2).toFixed(1)}" opacity="${R(0.3, 0.9).toFixed(2)}"/>`;
  let bubbles = '';
  for (let i = 0; i < 16; i++)
    bubbles += `<circle class="bu" cx="${R(40, 1400).toFixed(0)}" cy="880" r="${R(3, 8).toFixed(1)}" style="animation-duration:${R(6, 12).toFixed(1)}s;animation-delay:-${R(0, 10).toFixed(1)}s"/>`;

  $('bg').innerHTML = defs +
    `<g class="stars" fill="#fff">${stars}</g>
<g class="sun"><circle cx="1150" cy="190" r="180" fill="url(#gl)"/><circle cx="1150" cy="190" r="56" fill="#FFF3C4" opacity=".9"/></g>
<g class="moon"><circle cx="1150" cy="190" r="150" fill="url(#gl)" opacity=".6"/><circle cx="1150" cy="190" r="44" fill="#F4F1E6"/><circle cx="1138" cy="182" r="8" fill="#D9D4C3"/><circle cx="1162" cy="204" r="5" fill="#D9D4C3"/></g>
<g class="cl"><ellipse cx="260" cy="150" rx="110" ry="26"/><ellipse cx="330" cy="128" rx="70" ry="30"/><ellipse cx="200" cy="136" rx="60" ry="24"/></g>
<g class="cl c2"><ellipse cx="760" cy="270" rx="130" ry="28"/><ellipse cx="830" cy="246" rx="80" ry="32"/></g>
<g class="dn"><path d="M-30 4H-330" stroke="#fff" stroke-dasharray="4 9" opacity=".35"/><rect x="-18" y="-6" width="36" height="13" rx="6" fill="#fff" opacity=".9"/><path class="rt" d="M-38 -11h22M16 -11h22" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M-27 -11v5M27 -11v5" stroke="#fff" stroke-width="2"/><path d="M-7 7h14l-4 11h-6z" fill="#fff" opacity=".75"/></g>
${trees(590, 34, 0.14)}${trees(602, 28, 0.2)}
<rect y="600" width="1440" height="300" fill="url(#wt)"/>
${wave(612, 14, 0.1, 9, 'normal')}${wave(660, 18, 0.08, 13, 'reverse')}${wave(712, 22, 0.1, 17, 'normal')}
<g opacity=".2">${shr(140, 760, 90, 50)}${shr(640, 820, 70, 39, 6)}${shr(1060, 780, 100, 56, 11)}</g>
<g>${bubbles}</g>`;
}
