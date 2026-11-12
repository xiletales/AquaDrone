import symbol from './shrimp-symbol.svg?raw';
import { G, TIPS } from '../state.js';

/** Sprite global berisi <symbol id="sh">, dipakai lewat <use href="#sh">. */
export const spriteHTML = `<svg width="0" height="0" aria-hidden="true">${symbol}</svg>`;
export const shrimp = (w = 36, h = 22) => `<svg width="${w}" height="${h}" viewBox="0 0 124 76" aria-hidden="true"><use href="#sh"/></svg>`;
export const tipCard = (text) =>
  `<button class="tp" data-act="tip"><span class="ti">${shrimp()}</span><span><b>TIPS UDANG</b><span class="tt">${text ?? TIPS[G.tip % TIPS.length]}</span></span></button>`;
