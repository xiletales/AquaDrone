export const IC = {
  back: 'M15 5l-7 7 7 7',
  bell: 'M6 17v-6a6 6 0 0112 0v6l1.5 2h-15zM10 21h4',
  home: 'M4 11l8-7 8 7v9H4zM10 20v-6h4v6',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  set: 'M4 8h10M18 8h2M4 16h2M10 16h10M14 6v4M6 14v4',
  drone: 'M9.5 9.5L5 5M14.5 9.5L19 5M9.5 14.5L5 19M14.5 14.5L19 19M10 10h4v4h-4zM3 5h4M17 5h4M3 19h4M17 19h4',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z',
  warn: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  ok: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8 12l3 3 5-6',
  chev: 'M9 5l7 7-7 7',
  batt: 'M3 8h15v8H3zM20 11v2',
  drop: 'M12 3s6 6 6 10a6 6 0 01-12 0c0-4 6-10 6-10z',
  therm: 'M10 14V5a2 2 0 014 0v9a4 4 0 11-4 0z',
  wave: 'M4 9h16M4 15h16',
  x: 'M6 6l12 12M18 6L6 18',
};
export const icon = (name, size = 22) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${IC[name]}"/></svg>`;
