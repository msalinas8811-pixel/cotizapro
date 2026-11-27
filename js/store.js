// CotizaPro — datos guardados en el teléfono (localStorage)
const KEY = 'cotizapro:v1';

const defaults = () => ({
  onboarded: false,
  settings: {
    bizName: '',
    trade: 'Pintura',
    country: 'US',
    state: '',
    phone: '',
    email: '',
    taxRate: 0,          // %
    depositPct: 30,      // %
    clientLang: 'en',    // idioma del cliente: en | es
    appLang: (typeof navigator !== 'undefined' && /^es/i.test(navigator.language || '')) ? 'es' : 'en', // idioma de la app
    validDays: 30,
    terms: 'Price includes labor and materials listed. Any additional work will be quoted separately. Balance due upon completion.',
    paymentLink: '',     // Link de pago de Stripe / Square / PayPal del negocio
    aiEndpoint: '',      // URL opcional del Worker de IA
    logo: '',            // data URL del logo
    // Perfil de la empresa
    owner: '',
    address: '',
    city: '',
    website: '',
    license: '',
    insured: true,
    years: '',
    about: '',
    services: 'Interior painting, Exterior painting, Cabinet painting, Drywall repair, Pressure washing',
    warranty: '2-year warranty on workmanship.',
    hours: 'Mon–Sat 7:00 am – 6:00 pm'
  },
  clients: [],
  quotes: [],
  nextNumber: 1001,
  nextWO: 2001
});

let db = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw);
    const d = defaults();
    return { ...d, ...data, settings: { ...d.settings, ...(data.settings || {}) } };
  } catch (e) {
    return defaults();
  }
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('No se pudo guardar', e); }
}

export const getDB = () => db;
export const settings = () => db.settings;

export function updateSettings(patch) {
  db.settings = { ...db.settings, ...patch };
  save();
}

export function setOnboarded() { db.onboarded = true; save(); }

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ---------- Clientes ---------- */
export const clients = () => db.clients;
export const getClient = (id) => db.clients.find((c) => c.id === id);

export function upsertClient(c) {
  if (c.id) {
    const i = db.clients.findIndex((x) => x.id === c.id);
    if (i >= 0) db.clients[i] = { ...db.clients[i], ...c };
  } else {
    c = { id: uid(), createdAt: Date.now(), ...c };
    db.clients.unshift(c);
  }
  save();
  return c;
}

export function findOrCreateClient(name) {
  const n = (name || '').trim();
  if (!n) return null;
  const found = db.clients.find((c) => c.name.toLowerCase() === n.toLowerCase());
  return found || upsertClient({ name: n, phone: '', email: '', address: '' });
}

/* ---------- Cotizaciones / facturas ---------- */
export const quotes = () => db.quotes;
export const getQuote = (id) => db.quotes.find((q) => q.id === id);

export function newQuote(partial = {}) {
  const s = db.settings;
  const q = {
    id: uid(),
    number: db.nextNumber++,
    clientId: null,
    title: '',
    items: [],
    taxRate: Number(s.taxRate) || 0,
    depositPct: Number(s.depositPct) || 0,
    status: 'draft',
    transcript: '',
    createdAt: Date.now(),
    validUntil: Date.now() + (Number(s.validDays) || 30) * 86400000,
    signature: '',
    payments: [],
    history: [{ t: Date.now(), text: 'Cotización creada' }],
    reminders: true,
    jobAddress: '',
    scope: '',
    startDate: '',
    duration: '',
    exclusions: '',
    wo: null,
    photos: { before: [], after: [] },
    ...partial
  };
  db.quotes.unshift(q);
  save();
  return q;
}

export function updateQuote(id, patch, historyText) {
  const q = getQuote(id);
  if (!q) return null;
  Object.assign(q, patch);
  if (historyText) q.history.push({ t: Date.now(), text: historyText });
  save();
  return q;
}

export function deleteQuote(id) {
  db.quotes = db.quotes.filter((q) => q.id !== id);
  save();
}

export function addPayment(id, amount, method) {
  const q = getQuote(id);
  if (!q) return;
  q.payments.push({ amount: Number(amount), method, t: Date.now() });
  const t = totals(q);
  q.status = t.balance <= 0.005 ? 'paid' : 'invoiced';
  q.history.push({ t: Date.now(), text: `Pago recibido ${money(amount)} (${method})` });
  save();
}

/* ---------- Orden de trabajo y seguimiento ---------- */
export const STAGES = [
  'Orden de trabajo creada',
  'Visita y medidas',
  'Materiales comprados',
  'Trabajo en progreso',
  'Revisión final con el cliente',
  'Trabajo terminado'
];

export function createWorkOrder(id, signature, via) {
  const q = getQuote(id);
  if (!q) return null;
  if (!q.wo) {
    q.wo = {
      number: db.nextWO++,
      createdAt: Date.now(),
      progress: 0,
      stages: STAGES.map((label, i) => ({ label, done: i === 0, t: i === 0 ? Date.now() : null })),
      updates: [{ t: Date.now(), text: 'Orden de trabajo creada. Pronto te contactamos para programar.', pct: 0 }]
    };
    q.history.push({ t: Date.now(), text: `Orden de trabajo #${q.wo.number} creada` });
  }
  if (!['invoiced', 'paid'].includes(q.status)) q.status = 'approved';
  q.signature = signature || q.signature;
  q.approvedAt = q.approvedAt || Date.now();
  q.history.push({ t: Date.now(), text: `Aprobada${signature ? ' y firmada por ' + signature : ''}${via ? ' (' + via + ')' : ''}` });
  save();
  return q;
}

export function setStage(id, idx, done) {
  const q = getQuote(id);
  if (!q?.wo) return;
  const st = q.wo.stages[idx];
  st.done = done;
  st.t = done ? Date.now() : null;
  const auto = Math.round((q.wo.stages.filter((x) => x.done).length - 1) / (q.wo.stages.length - 1) * 100);
  if (done && auto > q.wo.progress) q.wo.progress = auto;
  if (done && idx === q.wo.stages.length - 1) q.wo.progress = 100;
  if (done) q.wo.updates.push({ t: Date.now(), text: st.label, pct: q.wo.progress });
  if (q.wo.progress >= 100 && !q.completedAt) q.completedAt = Date.now();
  save();
}

export function setProgress(id, pct) {
  const q = getQuote(id);
  if (!q?.wo) return;
  q.wo.progress = Math.max(0, Math.min(100, Number(pct) || 0));
  if (q.wo.progress >= 100 && !q.completedAt) q.completedAt = Date.now();
  save();
}

export function addUpdate(id, text) {
  const q = getQuote(id);
  if (!q?.wo || !text.trim()) return;
  q.wo.updates.push({ t: Date.now(), text: text.trim(), pct: q.wo.progress });
  q.history.push({ t: Date.now(), text: 'Avance de obra registrado' });
  save();
}

// Convierte la cotización aprobada en factura (con vencimiento a 7 días)
export function ensureInvoice(id) {
  const q = getQuote(id);
  if (!q) return null;
  if (!q.invoicedAt) {
    q.invoicedAt = Date.now();
    q.dueDate = Date.now() + 7 * 86400000;
    q.history.push({ t: Date.now(), text: 'Factura creada' });
  }
  if (q.status === 'approved' || q.status === 'draft' || q.status === 'sent') q.status = totals(q).balance <= 0.005 ? 'paid' : 'invoiced';
  save();
  return q;
}

/* ---------- Cálculos ---------- */
export function totals(q) {
  const subtotal = q.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const tax = Math.round(subtotal * (Number(q.taxRate) || 0)) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const deposit = Math.round(total * (Number(q.depositPct) || 0)) / 100;
  const paid = (q.payments || []).reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.round((total - paid) * 100) / 100;
  return { subtotal, tax, total, deposit, paid, balance };
}

export function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

export function dateEs(t) {
  const en = db.settings.appLang === 'en';
  return new Date(t).toLocaleDateString(en ? 'en-US' : 'es-US', { day: 'numeric', month: 'short' });
}
export function dateEn(t) {
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---------- Link para el cliente ---------- */
// La cotización viaja dentro del link (no necesita servidor).
export function encodeShare(obj) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeShare(str) {
  try {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch (e) {
    return null;
  }
}

export function resetAll() {
  localStorage.removeItem(KEY);
  db = defaults();
}
