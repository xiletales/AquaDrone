import { LABEL } from '../state.js';

// [min, max, gradien]; skala visual sesuai spesifikasi.
export const GR = {
  do: [2, 8, 'linear-gradient(90deg,#E5736C 16.7%,#F2C14E 16.7% 33.3%,#5CC391 33.3%)'],
  ph: [0, 14, 'linear-gradient(90deg,#E5736C 50%,#F2C14E 50% 53.6%,#5CC391 53.6% 60.7%,#F2C14E 60.7% 64.3%,#E5736C 64.3%)'],
  t:  [20, 36, 'linear-gradient(90deg,#E5736C 37.5%,#F2C14E 37.5% 50%,#5CC391 50% 75%,#F2C14E 75% 87.5%,#E5736C 87.5%)'],
};
export const gauge = (key, v) => {
  const [a, b, bg] = GR[key];
  if (v == null) return `<div class="gb" style="background:${bg};opacity:.45"></div>`;
  const pos = Math.max(3, Math.min(97, ((v - a) / (b - a)) * 100));
  return `<div class="gb" style="background:${bg}"><i style="left:${pos}%"></i></div>`;
};
export const chip = (st) => `<b class="ch c${st}">${LABEL[st]}</b>`;
