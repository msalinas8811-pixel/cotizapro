// Íconos de línea (SVG) usados en la app
const s = (d, w = 22, sw = 2) =>
  `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const I = {
  back: s('<path d="M15 18l-6-6 6-6"/>'),
  chev: s('<path d="M9 18l6-6-6-6"/>', 18),
  plus: s('<path d="M12 5v14M5 12h14"/>', 24, 2.4),
  mic: (w = 26, color = 'currentColor') =>
    `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>`,
  home: s('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>', 24),
  users: s('<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21a6 6 0 0 0-4-5.6"/>', 24),
  file: s('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h7M9 17h5"/>', 24),
  fileCheck: s('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 14l2 2 4-4"/>', 38),
  gear: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 24),
  send: s('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>', 20, 2.2),
  check: s('<path d="M20 6L9 17l-5-5"/>', 20, 2.4),
  card: s('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>', 20, 2.2),
  pen: s('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', 22),
  search: s('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 20),
  trash: s('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>', 18),
  share: s('<path d="M4 12v8h16v-8"/><path d="M12 3v13"/><path d="M7 8l5-5 5 5"/>', 20),
  bell: s('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>', 20),
  print: s('<path d="M6 9V2h12v7"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v8H6z"/>', 20),
  eye: s('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 20),
  whatsapp: s('<path d="M3 21l1.7-5A9 9 0 1 1 8 19.3z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.5-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z"/>', 20),
  sms: s('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', 20),
  copy: s('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', 20)
};
