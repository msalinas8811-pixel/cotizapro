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
  nextWO: 2001,
  employees: [],
  nextPayroll: 3001,
  nextReceipt: 5001
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

// Formas en que el cliente puede aprobar
export const APPROVAL_METHODS = {
  link: { es: 'Por el link (firma digital)', en: 'Online (digital signature)' },
  phone: { es: 'Por teléfono', en: 'By phone' },
  message: { es: 'Por mensaje (WhatsApp / SMS)', en: 'By message (WhatsApp / SMS)' },
  person: { es: 'En persona (casa del cliente)', en: "In person (at customer's home)" },
  email: { es: 'Por correo', en: 'By email' },
  other: { es: 'Otro', en: 'Other' }
};
export function approvalText(q, lang) {
  const m = q?.approval;
  if (!m) return '';
  const base = (APPROVAL_METHODS[m.method] || APPROVAL_METHODS.other)[lang === 'en' ? 'en' : 'es'];
  return m.note ? `${base} – ${m.note}` : base;
}

// Crear la clave del canal privado por donde llegan las aprobaciones de los clientes
export function syncTopic() {
  if (!db.settings.syncTopic) {
    const r = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
    db.settings.syncTopic = 'cotizapro-' + r;
    save();
  }
  return db.settings.syncTopic;
}

export function createWorkOrder(id, signature, via, method, note) {
  const q = getQuote(id);
  if (!q) return null;
  const firstApproval = !q.approvedAt;
  if (firstApproval || method) q.approval = { method: method || 'link', note: note || '', at: Date.now() };
  if (!q.wo) {
    q.wo = {
      number: db.nextWO++,
      createdAt: Date.now(),
      progress: 0,
      crew: [],
      stages: STAGES.map((label, i) => ({ label, done: i === 0, t: i === 0 ? Date.now() : null })),
      updates: [{ t: Date.now(), text: 'Orden de trabajo creada. Pronto te contactamos para programar.', pct: 0 }]
    };
    q.history.push({ t: Date.now(), text: `Orden de trabajo #${q.wo.number} creada` });
  }
  if (!['invoiced', 'paid'].includes(q.status)) q.status = 'approved';
  q.signature = signature || q.signature;
  q.approvedAt = q.approvedAt || Date.now();
  if (firstApproval || method) q.history.push({ t: Date.now(), text: `Aprobada${signature ? ' por ' + signature : ''} · ${approvalText(q, 'es')}` });
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
  if (q.wo.progress >= 100 && q.wo.crew?.length && !q.payroll) createPayroll(q.id);
  save();
}

export function setProgress(id, pct) {
  const q = getQuote(id);
  if (!q?.wo) return;
  q.wo.progress = Math.max(0, Math.min(100, Number(pct) || 0));
  if (q.wo.progress >= 100 && !q.completedAt) q.completedAt = Date.now();
  if (q.wo.progress >= 100 && q.wo.crew?.length && !q.payroll) createPayroll(q.id);
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

/* ---------- Empleados ---------- */
export const employees = () => db.employees || (db.employees = []);
export const getEmployee = (id) => employees().find((e) => e.id === id);

export function upsertEmployee(e) {
  if (e.id) {
    const i = employees().findIndex((x) => x.id === e.id);
    if (i >= 0) db.employees[i] = { ...db.employees[i], ...e };
  } else {
    e = { id: uid(), createdAt: Date.now(), active: true, ...e };
    employees().push(e);
  }
  save();
  return e;
}

// Equipo asignado a una orden de trabajo
export function assignEmployee(qid, empId, amount, note) {
  const q = getQuote(qid);
  if (!q?.wo) return;
  q.wo.crew = q.wo.crew || [];
  if (q.wo.crew.some((c) => c.empId === empId)) return;
  const e = getEmployee(empId);
  q.wo.crew.push({ empId, amount: Number(amount) || 0, note: note || '', at: Date.now() });
  q.history.push({ t: Date.now(), text: `Asignado a ${e?.name || 'empleado'}` });
  syncPayroll(q);
  save();
}

export function updateAssignment(qid, empId, patch) {
  const q = getQuote(qid);
  const c = q?.wo?.crew?.find((x) => x.empId === empId);
  if (!c) return;
  Object.assign(c, patch);
  syncPayroll(q);
  save();
}

export function unassignEmployee(qid, empId) {
  const q = getQuote(qid);
  if (!q?.wo?.crew) return;
  if (q.payroll?.lines.some((l) => l.empId === empId && l.paid)) return false;
  q.wo.crew = q.wo.crew.filter((c) => c.empId !== empId);
  syncPayroll(q);
  save();
  return true;
}

export const laborCost = (q) => (q?.wo?.crew || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);

/* ---------- Planilla de pago ---------- */
export function createPayroll(qid) {
  const q = getQuote(qid);
  if (!q?.wo?.crew?.length) return null;
  if (!q.payroll) {
    q.payroll = { number: db.nextPayroll++, createdAt: Date.now(), lines: [] };
    q.history.push({ t: Date.now(), text: `Planilla de pago #${q.payroll.number} creada` });
  }
  syncPayroll(q, true);
  save();
  return q.payroll;
}

// Mantiene la planilla igual al equipo asignado (sin tocar pagos ya hechos)
function syncPayroll(q, force) {
  if (!q.payroll && !force) return;
  if (!q.payroll) return;
  const crew = q.wo?.crew || [];
  const lines = q.payroll.lines;
  for (const c of crew) {
    const e = getEmployee(c.empId);
    const l = lines.find((x) => x.empId === c.empId);
    if (!l) lines.push({ empId: c.empId, name: e?.name || '', role: e?.role || '', amount: Number(c.amount) || 0, paid: false });
    else if (!l.paid) Object.assign(l, { name: e?.name || l.name, role: e?.role || l.role, amount: Number(c.amount) || 0 });
  }
  q.payroll.lines = lines.filter((l) => l.paid || crew.some((c) => c.empId === l.empId));
}

export function payPayrollLine(qid, empId, method) {
  const q = getQuote(qid);
  const l = q?.payroll?.lines.find((x) => x.empId === empId);
  if (!l || l.paid) return null;
  Object.assign(l, { paid: true, paidAt: Date.now(), method, receipt: db.nextReceipt++ });
  q.history.push({ t: Date.now(), text: `Pago a ${l.name}: ${money(l.amount)} (${method})` });
  save();
  return l;
}

export function payrollTotals(p) {
  const total = (p?.lines || []).reduce((s, l) => s + l.amount, 0);
  const paid = (p?.lines || []).filter((l) => l.paid).reduce((s, l) => s + l.amount, 0);
  return { total, paid, pending: Math.round((total - paid) * 100) / 100 };
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
