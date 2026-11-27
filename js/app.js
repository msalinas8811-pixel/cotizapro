// CotizaPro — app principal (router + pantallas)
import * as S from './store.js';
import { parseDictation } from './parser.js';
import { I } from './icons.js';
import { shareInvoicePdf, shareReceiptPdf } from './pdf.js';
import { COUNTRIES, US_STATES, countryName, stateCode } from './geo.js';
import { tr, translateDOM, watch } from './i18n.js';
import { addPhotos, deletePhotos, photoURL, photoFiles } from './photos.js';
const UI = () => S.settings().appLang || 'es';

let $app = document.getElementById('app');
const $tab = document.getElementById('tabbar');
const $toast = document.getElementById('toast');

/* ---------- Utilidades ---------- */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const go = (hash) => { location.hash = hash; };
const initials = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const COLORS = ['#67E8F9', '#C4B5FD', '#FDBA74', '#6EE7B7', '#A5F3FC', '#F9A8D4'];
const colorFor = (s) => COLORS[[...(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const digits = (p) => (p || '').replace(/\D/g, '');
const usPhone = (p) => { const d = digits(p); return d.length === 10 ? '1' + d : d; };

const confirmT = (m) => confirm(UI() === 'en' ? tr(m) : m);
const promptT = (m, v) => prompt(UI() === 'en' ? tr(m) : m, v);
let toastTimer;
function toast(msg) {
  $toast.textContent = UI() === 'en' ? tr(msg) : msg;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, 2600);
}

const STATUS = {
  draft: ['Borrador', 'gray'],
  sent: ['Enviada', 'cyan'],
  approved: ['Aprobada', 'green'],
  invoiced: ['Facturada', 'violet'],
  paid: ['Pagada', 'green'],
  overdue: ['Pago vencido', 'orange']
};
function statusOf(q) {
  if (q.status === 'invoiced' && q.dueDate && Date.now() > q.dueDate && S.totals(q).balance > 0) return 'overdue';
  return q.status;
}
const chip = (q) => {
  if (q.wo && q.status !== 'paid' && statusOf(q) !== 'overdue') {
    return q.wo.progress >= 100 ? '<span class="chip green">Obra terminada</span>' : `<span class="chip cyan">En obra · ${q.wo.progress}%</span>`;
  }
  const [t, c] = STATUS[statusOf(q)] || STATUS.draft;
  return `<span class="chip ${c}">${t}</span>`;
};
const hrefFor = (q) => (q.wo ? '#/wo/' + q.id : ['invoiced', 'paid'].includes(q.status) ? '#/invoice/' + q.id : '#/doc/' + q.id);

function topbar(title, back = '#/home', right = '<div class="ghost"></div>') {
  return `<div class="topbar">
    <a class="icon-btn" href="${back}" aria-label="Volver">${I.back}</a>
    <span class="title">${esc(title)}</span>${right}</div>`;
}

function setTabs(active) {
  if (!active) { $tab.hidden = true; $app.classList.add('no-tabs'); return; }
  $app.classList.remove('no-tabs');
  $tab.hidden = false;
  const t = (k, href, label, icon, cls = '') =>
    `<a href="${href}" class="${cls}" aria-label="${label}" ${active === k ? 'aria-current="page"' : ''}>${icon}</a>`;
  $tab.innerHTML =
    t('home', '#/home', 'Inicio', I.home) +
    t('clients', '#/clients', 'Clientes', I.users) +
    t('new', '#/quote-form', 'Cotizar servicio', I.plus, 'add') +
    t('works', '#/works', 'Obras y cotizaciones', I.file) +
    t('profile', '#/profile', 'Perfil de la empresa', I.building);
}

const clientName = (q) => S.getClient(q.clientId)?.name || 'Sin cliente';

function quoteRow(q, href) {
  const t = S.totals(q);
  const amount = ['invoiced', 'approved'].includes(q.status) && t.paid ? t.balance : t.total;
  return `<a class="item g" href="${href || hrefFor(q)}">
    <div class="col" style="flex-grow:1">
      <span style="font-size:15px;font-weight:600">${esc(clientName(q))}</span>
      <span class="small muted">${esc(q.title || 'Cotización')} · #${q.number}</span>
    </div>
    <div class="col" style="align-items:flex-end;gap:5px">
      <span style="font-size:15px;font-weight:700">${S.money(amount)}</span>${chip(q)}
    </div></a>`;
}

/* ---------- Link para el cliente ---------- */
function bizInfo(full) {
  const s = S.settings();
  const b = { n: s.bizName, p: s.phone, e: s.email, st: [s.state, (s.country || 'US') !== 'US' ? countryName(s.country) : ''].filter(Boolean).join(', '), owner: s.owner, addr: [s.address, s.city, s.state, (s.country || 'US') !== 'US' ? countryName(s.country) : ''].filter(Boolean).join(', '),
    web: s.website, lic: s.license, ins: !!s.insured, warranty: s.warranty, logo: s.logo && s.logo.length < 24000 ? s.logo : '' };
  if (full) Object.assign(b, { years: s.years, about: s.about, hours: s.hours, services: (s.services || '').split(',').map((x) => x.trim()).filter(Boolean) });
  return b;
}
const appBase = () => location.href.split('#')[0];

function sharePayload(q, kind) {
  const s = S.settings();
  const c = S.getClient(q.clientId);
  const t = S.totals(q);
  return {
    v: 2,
    kind, // estimate | invoice
    base: appBase(),
    b: bizInfo(false),
    q: {
      id: q.id, n: q.number, title: q.title, client: c?.name || '', addr: c?.address || '', cphone: c?.phone || '', cemail: c?.email || '',
      job: q.jobAddress || c?.address || '', scope: q.scope, start: q.startDate, dur: q.duration, excl: q.exclusions,
      items: q.items.map((i) => ({ en: i.en, es: i.es, note: i.note, qty: Number(i.qty), price: Number(i.price) })),
      tax: Number(q.taxRate), dep: Number(q.depositPct), valid: q.validUntil, created: q.createdAt,
      paid: t.paid, due: q.dueDate || null, terms: s.terms, pay: s.paymentLink, lang: s.clientLang, wo: q.wo?.number || null
    }
  };
}
function shareUrl(q, kind = 'estimate') {
  return `${appBase()}#/c/${S.encodeShare(sharePayload(q, kind))}`;
}

function shareMessage(q, kind) {
  const s = S.settings();
  const c = S.getClient(q.clientId);
  const t = S.totals(q);
  const url = shareUrl(q, kind);
  const first = (c?.name || '').split(' ')[0];
  const en = s.clientLang !== 'es';
  if (kind === 'invoice') {
    return en
      ? `Hi ${first}, here is your invoice #${q.number} from ${s.bizName}. Balance due: ${S.money(t.balance)}. View and pay here: ${url}`
      : `Hola ${first}, aquí está tu factura #${q.number} de ${s.bizName}. Saldo: ${S.money(t.balance)}. Ver y pagar aquí: ${url}`;
  }
  return en
    ? `Hi ${first}, here is your estimate #${q.number} from ${s.bizName} for ${S.money(t.total)}. You can review and approve it here: ${url}`
    : `Hola ${first}, aquí está tu cotización #${q.number} de ${s.bizName} por ${S.money(t.total)}. Puedes revisarla y aprobarla aquí: ${url}`;
}

function openShare(q, kind) {
  const c = S.getClient(q.clientId);
  const msg = shareMessage(q, kind);
  const sheet = document.createElement('div');
  sheet.className = 'sheet-wrap';
  sheet.style.cssText = 'position:fixed;inset:0;z-index:30;background:rgba(5,8,18,0.6);display:flex;align-items:flex-end;justify-content:center';
  sheet.innerHTML = `<div class="g card" role="dialog" aria-label="Enviar" style="width:min(480px,100%);border-radius:26px 26px 0 0;padding:20px 20px calc(24px + env(safe-area-inset-bottom,0px));background:rgba(20,26,48,0.92)">
    <h2>Enviar ${kind === 'invoice' ? 'factura' : 'cotización'} #${q.number}</h2>
    <p class="small muted">${c?.phone ? 'Al ' + esc(c.phone) : 'Agrega el teléfono del cliente para enviar directo.'}</p>
    <button class="btn green" data-s="wa">${I.whatsapp} WhatsApp</button>
    <button class="btn secondary" data-s="sms">${I.sms} Mensaje de texto (SMS)</button>
    ${navigator.share ? `<button class="btn secondary" data-s="native">${I.share} Más opciones</button>` : ''}
    <button class="btn secondary" data-s="copy">${I.copy} Copiar link</button>
    <button class="link-btn" data-s="close" style="align-self:center">Cancelar</button></div>`;
  document.body.appendChild(sheet);
  const close = () => sheet.remove();
  const mark = () => {
    if (kind === 'estimate' && q.status === 'draft') S.updateQuote(q.id, { status: 'sent' }, 'Cotización enviada al cliente');
    if (kind === 'invoice') S.updateQuote(q.id, {}, 'Factura enviada al cliente');
  };
  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-s]');
    if (e.target === sheet) return close();
    if (!b) return;
    const k = b.dataset.s;
    if (k === 'close') return close();
    if (k === 'wa') { window.open(`https://wa.me/${usPhone(c?.phone)}?text=${encodeURIComponent(msg)}`, '_blank'); mark(); }
    if (k === 'sms') { location.href = `sms:${digits(c?.phone)}?&body=${encodeURIComponent(msg)}`; mark(); }
    if (k === 'native') { try { await navigator.share({ title: S.settings().bizName, text: msg }); mark(); } catch (err) { return; } }
    if (k === 'copy') {
      try { await navigator.clipboard.writeText(shareUrl(q, kind)); toast('Link copiado'); mark(); } catch (err) { promptT('Copia este link:', shareUrl(q, kind)); mark(); }
    }
    close();
    route();
  });
}


/* ---------- País y estado ---------- */
function stateFieldHTML(country, state) {
  if (country === 'US') {
    const code = stateCode(state);
    return `<label for="st">Estado</label><select id="st"><option value="">Elige el estado…</option>${US_STATES.map(([c, n]) => `<option value="${c}" ${c === code ? 'selected' : ''}>${n} (${c})</option>`).join('')}</select>`;
  }
  return `<label for="st">Estado / departamento / provincia</label><input id="st" value="${esc(stateCode(state) ? '' : state)}" placeholder="Opcional">`;
}
function locationHTML(s) {
  const country = s.country || 'US';
  return `<div class="field"><label for="co">País</label><select id="co">${COUNTRIES.map(([c, n]) => `<option value="${c}" ${c === country ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="field" id="stwrap">${stateFieldHTML(country, s.state)}</div>`;
}
function bindLocation() {
  const co = $app.querySelector('#co');
  co.addEventListener('change', () => { $app.querySelector('#stwrap').innerHTML = stateFieldHTML(co.value, ''); });
}
const readLocation = () => ({ country: $app.querySelector('#co').value, state: $app.querySelector('#st').value.trim() });

/* ================= PANTALLAS ================= */

function viewWelcome() {
  setTabs(null);
  $app.innerHTML = `
    <div class="row" style="justify-content:flex-end"><button class="chip gray" id="applang" data-noi18n style="border:1px solid var(--glass-border);padding:8px 14px;font-size:13px;cursor:pointer;color:#fff">${UI() === 'en' ? 'Español' : 'English'}</button></div>
    <div class="hero-logo g">${S.settings().logo ? `<img class="logo-img" src="${esc(S.settings().logo)}" alt="">` : `<div style="color:#0A0F1F">${I.fileCheck}</div>`}</div>
    <div class="col" style="gap:10px;text-align:center;margin-top:10px">
      <span class="label" style="letter-spacing:0.12em">CotizaPro</span>
      <h1 style="font-size:34px;line-height:1.12">Cotiza en español.<br>Cobra en inglés.</h1>
      <p class="muted" style="font-size:15px;line-height:1.5">Dicta el trabajo con tu voz y tu cliente recibe una cotización profesional lista para firmar y pagar.</p>
    </div>
    <div class="card tight g">
      <div class="setting"><span style="display:flex;gap:12px;align-items:center"><span style="color:var(--cyan)">${I.mic(22)}</span>Cotizaciones por voz en 30 segundos</span></div>
      <div class="setting"><span style="display:flex;gap:12px;align-items:center"><span style="color:var(--violet)">${I.pen}</span>El cliente firma desde su teléfono</span></div>
      <div class="setting"><span style="display:flex;gap:12px;align-items:center"><span style="color:var(--green)">${I.card}</span>Cobra anticipos y saldos con tarjeta</span></div>
    </div>
    <div class="spacer"></div>
    <a class="btn primary" href="#/register">Crear cuenta gratis</a>
    <p class="small muted" style="text-align:center">Tus datos se guardan en tu teléfono.</p>`;
  applang.onclick = () => {
    const en = UI() !== 'en';
    S.updateSettings({ appLang: en ? 'en' : 'es', clientLang: en ? 'en' : S.settings().clientLang });
    route();
  };
}

let regStep = 1;
let regTrade = 'Pintura';
function viewRegister() {
  setTabs(null);
  const s = S.settings();
  const trades = ['Pintura', 'Limpieza', 'Jardinería', 'Handyman', 'Remodelación', 'Otro'];
  if (regStep === 1) {
    regTrade = s.trade || regTrade;
    $app.innerHTML = `
      <div class="topbar"><a class="icon-btn" href="#/welcome" aria-label="Volver">${I.back}</a>
        <div class="steps" aria-label="Paso 1 de 2"><span class="on"></span><span></span></div><div class="ghost"></div></div>
      <div class="col" style="gap:4px"><h1>Cuéntanos de tu negocio</h1><span class="muted" style="font-size:14px">Así aparecerá en tus cotizaciones.</span></div>
      <form id="f" class="list" style="gap:14px">
        <div class="field"><label for="biz">Nombre del negocio</label><input id="biz" required placeholder="Ej. Carlos Painting LLC" value="${esc(s.bizName)}"></div>
        <div class="field"><span class="flabel">¿A qué te dedicas?</span>
          <div class="pills">${trades.map((t) => `<button type="button" class="pill" data-trade="${t}" aria-pressed="${t === regTrade}">${t}</button>`).join('')}</div></div>
        ${locationHTML(s)}
        <div class="field"><label for="ph">Teléfono / WhatsApp</label><input id="ph" type="tel" placeholder="(555) 000-0000" value="${esc(s.phone)}"></div>
        <div class="field"><label for="em">Correo</label><input id="em" type="email" placeholder="tu@correo.com" value="${esc(s.email)}"></div>
        <button class="btn primary" type="submit" style="margin-top:8px">Continuar</button>
      </form>`;
    $app.querySelectorAll('[data-trade]').forEach((b) => b.addEventListener('click', () => {
      regTrade = b.dataset.trade;
      $app.querySelectorAll('[data-trade]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    bindLocation();
    $app.querySelector('#f').addEventListener('submit', (e) => {
      e.preventDefault();
      S.updateSettings({ bizName: biz.value.trim(), trade: regTrade, ...readLocation(), phone: ph.value.trim(), email: em.value.trim() });
      regStep = 2; route();
    });
  } else {
    $app.innerHTML = `
      <div class="topbar"><button class="icon-btn" id="bk" aria-label="Volver">${I.back}</button>
        <div class="steps" aria-label="Paso 2 de 2"><span class="on"></span><span class="on"></span></div><div class="ghost"></div></div>
      <div class="col" style="gap:4px"><h1>Últimos detalles</h1><span class="muted" style="font-size:14px">Puedes cambiar todo después en Ajustes.</span></div>
      <form id="f" class="list" style="gap:14px">
        <div class="field"><span class="flabel">Logo (opcional)</span>
          <label class="item g" for="logo" style="cursor:pointer"><span class="avatar" id="lp" style="background:var(--grad);border-radius:14px;overflow:hidden">${s.logo ? `<img class="logo-img" src="${esc(s.logo)}" alt="">` : initials(s.bizName)}</span><span>Subir logo</span></label>
          <input id="logo" type="file" accept="image/*" class="vh"></div>
        <div class="grid2">
          <div class="field"><label for="tax">Impuesto (%)</label><input id="tax" type="number" step="0.01" min="0" placeholder="Ej. 8.25" value="${s.taxRate || ''}"></div>
          <div class="field"><label for="dep">Anticipo (%)</label><input id="dep" type="number" min="0" max="100" value="${s.depositPct}"></div>
        </div>
        <div class="field"><label for="pay">Link de pago (opcional)</label><input id="pay" type="url" placeholder="https://buy.stripe.com/..." value="${esc(s.paymentLink)}">
          <span class="small muted">Tu link de Stripe, Square o PayPal. El cliente lo verá en el botón "Pay".</span></div>
        <button class="btn primary" type="submit" style="margin-top:8px">Empezar a cotizar</button>
      </form>`;
    bk.onclick = () => { regStep = 1; route(); };
    bindLogo($app.querySelector('#logo'), $app.querySelector('#lp'));
    $app.querySelector('#f').addEventListener('submit', (e) => {
      e.preventDefault();
      S.updateSettings({ taxRate: Number(tax.value) || 0, depositPct: Number(dep.value) || 0, paymentLink: pay.value.trim() });
      S.setOnboarded();
      regStep = 1;
      go('#/home');
    });
  }
}

function bindLogo(input, preview) {
  input.addEventListener('change', () => {
    const f = input.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const size = 160;
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const r = Math.max(size / img.width, size / img.height);
      const w = img.width * r, h = img.height * r;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      const data = c.toDataURL('image/jpeg', 0.8);
      S.updateSettings({ logo: data });
      preview.innerHTML = `<img class="logo-img" src="${data}" alt="">`;
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  });
}

function viewHome() {
  setTabs('home');
  const s = S.settings();
  const qs = S.quotes();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const owed = qs.filter((q) => ['approved', 'invoiced'].includes(q.status)).reduce((a, q) => a + Math.max(0, S.totals(q).balance), 0);
  const owedN = qs.filter((q) => ['approved', 'invoiced'].includes(q.status) && S.totals(q).balance > 0).length;
  const paidMonth = qs.reduce((a, q) => a + (q.payments || []).filter((p) => p.t >= monthStart).reduce((x, p) => x + p.amount, 0), 0);
  const pending = qs.filter((q) => q.status !== 'paid').slice(0, 6);
  const payPending = qs.filter((q) => q.payroll).reduce((s, q) => s + S.payrollTotals(q.payroll).pending, 0);
  const month = now.toLocaleDateString(UI() === 'en' ? 'en-US' : 'es-US', { month: 'short' });
  $app.innerHTML = `
    <div class="row">
      <div class="col"><span class="muted" style="font-size:14px">Hola</span><span class="display" style="font-size:24px;font-weight:700">${esc(s.bizName || 'Mi negocio')}</span></div>
      <a class="icon-btn" href="#/profile" aria-label="Perfil de la empresa" style="overflow:hidden;font-family:'Space Grotesk';font-weight:700">${s.logo ? `<img class="logo-img" src="${esc(s.logo)}" alt="">` : initials(s.bizName)}</a>
    </div>
    <div class="grid2">
      <div class="card g"><span class="small muted">Por cobrar</span><span class="big">${S.money(owed)}</span><span class="small" style="color:var(--orange)">${owedN} pendiente${owedN === 1 ? '' : 's'}</span></div>
      <div class="card g"><span class="small muted">Cobrado en ${month}</span><span class="big">${S.money(paidMonth)}</span><span class="small" style="color:var(--green)">${qs.filter((q) => q.status === 'paid').length} pagadas</span></div>
    </div>
    <a href="#/quote-form" class="item g" style="padding:18px;gap:14px;background:linear-gradient(135deg,rgba(34,211,238,0.30),rgba(167,139,250,0.30))">
      <span style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.92);display:flex;align-items:center;justify-content:center;flex-shrink:0">${I.mic(26, '#0A0F1F')}</span>
      <span class="col"><span class="display" style="font-size:18px;font-weight:700">Cotizar servicio</span><span style="font-size:13px;color:rgba(255,255,255,0.84)">Formulario o dictado por voz</span></span>
    </a>
    <div class="grid2">
      <a href="#/employees" class="item g" style="flex-direction:column;align-items:flex-start;gap:6px"><span style="color:var(--cyan)">${I.users}</span><span style="font-weight:600">Empleados</span><span class="small muted">${S.employees().filter((e) => e.active !== false).length} activos</span></a>
      <a href="#/payrolls" class="item g" style="flex-direction:column;align-items:flex-start;gap:6px"><span style="color:var(--green)">${I.card}</span><span style="font-weight:600">Planillas</span><span class="small muted">${payPending ? 'Por pagar ' + S.money(payPending) : 'Al día'}</span></a>
    </div>
    <div class="row"><h2>Pendientes</h2><a href="#/works" style="font-size:13px">Ver todo</a></div>
    <div class="list">${pending.length ? pending.map((q) => quoteRow(q)).join('') : `<div class="empty g card"><span>Aún no tienes cotizaciones.</span><br><span>Toca Cotizar servicio para hacer tu primera cotización.</span></div>`}</div>`;
}

let rec = null;
let draftText = '';
function viewNew() {
  setTabs('new');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  $app.innerHTML = `
    ${topbar('Nueva cotización')}
    <div class="mic-wrap">
      <div class="mic-halo"><button class="mic" id="mic" aria-label="Empezar a dictar">${I.mic(34, '#0A0F1F')}</button></div>
      <span class="small muted" id="micst">${SR ? 'Toca el micrófono y describe el trabajo' : 'Tu navegador no permite dictado: escribe el trabajo abajo'}</span>
    </div>
    <div class="card g">
      <label class="label" for="tx">Lo que dijiste</label>
      <textarea id="tx" placeholder="Ej. Pintar 3 cuartos, dos manos, incluye la pintura. Reparar unas grietas. Cliente Jennifer Smith, en Houston.">${esc(draftText)}</textarea>
    </div>
    <button class="btn primary" id="gen">${I.send} Generar cotización en inglés</button>
    <button class="btn secondary" id="manual">Escribir partidas a mano</button>
    <p class="small muted" style="text-align:center">Los precios son sugeridos: revísalos antes de enviar.</p>`;
  const tx = $app.querySelector('#tx');
  const mic = $app.querySelector('#mic');
  const st = $app.querySelector('#micst');
  tx.addEventListener('input', () => { draftText = tx.value; });

  if (SR) {
    mic.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = UI() === 'en' ? 'en-US' : 'es-US';
      rec.continuous = true;
      rec.interimResults = true;
      const base = tx.value ? tx.value.trim() + ' ' : '';
      let finalText = '';
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
          else interim += e.results[i][0].transcript;
        }
        tx.value = base + finalText + interim;
        draftText = tx.value;
      };
      rec.onstart = () => { mic.classList.add('on'); mic.setAttribute('aria-label', 'Detener dictado'); st.textContent = 'Escuchando… toca para terminar'; };
      rec.onend = () => { mic.classList.remove('on'); mic.setAttribute('aria-label', 'Empezar a dictar'); st.textContent = 'Listo. Puedes corregir el texto.'; rec = null; };
      rec.onerror = (e) => { st.textContent = e.error === 'not-allowed' ? 'Permite el micrófono para dictar' : 'No te escuché bien, intenta otra vez'; };
      rec.start();
    });
  } else {
    mic.disabled = true;
    mic.style.opacity = 0.5;
  }

  $app.querySelector('#gen').addEventListener('click', async (e) => {
    const text = tx.value.trim();
    if (!text) { toast('Dicta o escribe el trabajo primero'); return; }
    if (rec) rec.stop();
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = 'Generando…';
    const s = S.settings();
    const r = await parseDictation(text, { aiEndpoint: s.aiEndpoint, trade: s.trade, state: s.state });
    const c = S.findOrCreateClient(r.client);
    if (c && r.city && !c.address) S.upsertClient({ id: c.id, address: r.city });
    const q = S.newQuote({ clientId: c?.id || null, title: r.title || '', items: r.items, transcript: text });
    draftText = '';
    toast(r.source === 'ai' ? 'Cotización generada con IA' : 'Borrador listo: revisa precios');
    go('#/quote-form/' + q.id);
  });
  $app.querySelector('#manual').addEventListener('click', () => {
    go('#/quote-form');
  });
}

function lineHTML(it, i) {
  return `<div class="line">
    <div class="row"><label class="vh" for="en${i}">Descripción en inglés</label>
      <input id="en${i}" data-f="en" placeholder="Description (English)" value="${esc(it.en)}" style="font-weight:600">
      <button class="icon-btn" data-rm aria-label="Quitar partida" style="width:40px;height:40px">${I.trash}</button></div>
    <label class="vh" for="es${i}">Descripción en español</label>
    <input id="es${i}" data-f="es" placeholder="Descripción en español (para ti)" value="${esc(it.es)}" style="min-height:40px;font-size:13px">
    <label class="vh" for="no${i}">Detalle</label>
    <input id="no${i}" data-f="note" placeholder="Detail, e.g. 2 coats" value="${esc(it.note)}" style="min-height:40px;font-size:13px">
    <div class="row">
      <div class="field qty"><label for="q${i}" class="small muted">Cant.</label><input id="q${i}" data-f="qty" type="number" min="0" step="0.5" value="${it.qty}"></div>
      <div class="field price"><label for="p${i}" class="small muted">Precio c/u ($)</label><input id="p${i}" data-f="price" type="number" min="0" step="1" value="${it.price}"></div>
    </div></div>`;
}

function totalsHTML(q) {
  const t = S.totals(q);
  return `<div class="list" style="gap:8px">
    <div class="row small muted" style="font-size:13px"><span>Subtotal</span><span>${S.money(t.subtotal)}</span></div>
    <div class="row small muted" style="font-size:13px"><span>Tax (${q.taxRate}%)</span><span>${S.money(t.tax)}</span></div>
    <div class="row"><span style="font-weight:600">Total</span><span class="big">${S.money(t.total)}</span></div>
    ${q.depositPct ? `<div class="row small" style="padding:10px 12px;border-radius:14px;background:rgba(34,211,238,0.16);font-size:13px"><span>Anticipo (${q.depositPct}%)</span><span style="font-weight:700;color:var(--cyan-soft)">${S.money(t.deposit)}</span></div>` : ''}
  </div>`;
}

function historyHTML(q) {
  const colors = ['var(--cyan)', 'var(--violet)', 'var(--green)'];
  return `<div class="card g"><span class="label v">Historial</span>
    ${[...q.history].reverse().slice(0, 8).map((h, i) => `<div class="row" style="justify-content:flex-start"><span class="dot" style="background:${colors[i % 3]}"></span><span style="font-size:14px;flex-grow:1">${esc(h.text)}</span><span class="small muted">${S.dateEs(h.t)}</span></div>`).join('')}</div>`;
}

async function sendInvoicePdf(q, btn) {
  S.ensureInvoice(q.id);
  const s = S.settings();
  const c = S.getClient(q.clientId);
  const t = S.totals(q);
  const first = (c?.name || '').split(' ')[0];
  const msg = s.clientLang === 'es'
    ? `Hola ${first}, adjunto la factura #${q.number} de ${s.bizName}. ${t.balance > 0 ? 'Saldo: ' + S.money(t.balance) + '.' : '¡Pagada completa, gracias!'}`
    : `Hi ${first}, attached is invoice #${q.number} from ${s.bizName}. ${t.balance > 0 ? 'Balance due: ' + S.money(t.balance) + '.' : 'Paid in full, thank you!'}`;
  const label = btn.innerHTML;
  btn.disabled = true; btn.textContent = 'Generando PDF…';
  try {
    const r = await shareInvoicePdf(q, msg);
    if (r !== 'cancelled') {
      S.updateQuote(q.id, {}, r === 'shared' ? 'Factura PDF enviada al cliente' : 'Factura PDF descargada');
      toast(r === 'shared' ? 'Factura enviada' : 'PDF descargado: envíalo por WhatsApp');
    }
  } catch (e) {
    toast(e.message || 'No se pudo crear el PDF');
  }
  btn.disabled = false; btn.innerHTML = label;
}

function viewInvoice(id) {
  const q = S.getQuote(id);
  if (!q) return go('#/home');
  setTabs(null);
  if (q.status === 'approved' && !q.invoicedAt) S.ensureInvoice(q.id);
  const t = S.totals(q);
  const pct = t.total ? Math.min(100, Math.round((t.paid / t.total) * 100)) : 0;
  const c = S.getClient(q.clientId);
  const suggested = t.paid === 0 && t.deposit ? t.deposit : t.balance;
  $app.innerHTML = `
    ${topbar('Factura #' + q.number, q.wo ? '#/wo/' + q.id : '#/works', `<a class="icon-btn" href="#/quote-form/${q.id}" aria-label="Editar cotización">${I.pen}</a>`)}
    <div class="card g" style="padding:18px;gap:12px">
      <div class="row"><span style="font-size:15px;font-weight:600">${esc(c?.name || 'Sin cliente')}</span>${q.signature ? `<span class="chip green">${I.check.replace('width="20" height="20"', 'width="12" height="12"')} Aprobada y firmada</span>` : chip(q)}</div>
      <div class="col"><span class="small muted">${t.balance <= 0 ? 'Pagada completa' : 'Saldo pendiente'}</span><span class="huge">${S.money(Math.max(0, t.balance))}</span></div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="row small muted"><span>Cobrado ${S.money(t.paid)}</span><span>Total ${S.money(t.total)}</span></div>
      ${q.dueDate && t.balance > 0 ? `<span class="small" style="color:${Date.now() > q.dueDate ? 'var(--orange)' : 'var(--muted)'}">Vence ${S.dateEs(q.dueDate)}</span>` : ''}
    </div>
    ${t.balance > 0 ? `
    <form class="card g" id="payf">
      <span class="label">Registrar pago recibido</span>
      <div class="grid2">
        <div class="field"><label for="amt">Monto ($)</label><input id="amt" type="number" min="0" step="0.01" value="${suggested}"></div>
        <div class="field"><label for="mth">Método</label><select id="mth"><option>Tarjeta</option><option>Zelle</option><option>Efectivo</option><option>Cheque</option><option>Otro</option></select></div>
      </div>
      <button class="btn secondary" type="submit">${I.check} Guardar pago</button>
    </form>` : ''}
    <div class="card g row">
      <label for="rem" class="col" style="cursor:pointer"><span style="font-size:14px;font-weight:600">Recordatorio de pago</span><span class="small muted">Te avisamos para mandarle un mensaje al cliente antes de la fecha</span></label>
      <input id="rem" type="checkbox" ${q.reminders ? 'checked' : ''}>
    </div>
    ${historyHTML(q)}
    <div class="list no-print">
      ${t.balance > 0 ? `<button class="btn green" id="sendinv">${I.card} Enviar factura y link de pago</button>
      <button class="btn secondary" id="remind">${I.bell} Enviar recordatorio ahora</button>` : ''}
      <button class="btn ${t.balance > 0 ? 'secondary' : 'green'}" id="invpdf">${I.print} Factura en PDF para el cliente</button>
    </div>`;
  const pf = $app.querySelector('#payf');
  if (pf) pf.addEventListener('submit', (e) => {
    e.preventDefault();
    const a = Number(amt.value);
    if (!a || a <= 0) { toast('Escribe el monto'); return; }
    S.addPayment(q.id, a, mth.value);
    toast('Pago guardado');
    route();
  });
  rem.onchange = () => S.updateQuote(q.id, { reminders: rem.checked });
  invpdf.onclick = () => sendInvoicePdf(q, invpdf);
  const si = $app.querySelector('#sendinv');
  if (si) si.onclick = () => {
    if (q.status === 'approved') S.updateQuote(q.id, { status: 'invoiced' });
    openShare(q, 'invoice');
  };
  const rm = $app.querySelector('#remind');
  if (rm) rm.onclick = () => {
    const s = S.settings();
    const first = (c?.name || '').split(' ')[0];
    const msg = s.clientLang === 'es'
      ? `Hola ${first}, te recordamos el saldo de ${S.money(t.balance)} de la factura #${q.number} de ${s.bizName}. Puedes pagar aquí: ${shareUrl(q, 'invoice')}`
      : `Hi ${first}, friendly reminder: invoice #${q.number} from ${s.bizName} has a balance of ${S.money(t.balance)}. You can pay here: ${shareUrl(q, 'invoice')}`;
    window.open(`https://wa.me/${usPhone(c?.phone)}?text=${encodeURIComponent(msg)}`, '_blank');
    S.updateQuote(q.id, {}, 'Recordatorio enviado');
    route();
  };
}

let cliFilter = 'all';
let cliQuery = '';
function viewClients() {
  setTabs('clients');
  const qs = S.quotes();
  const info = (c) => {
    const mine = qs.filter((q) => q.clientId === c.id);
    const bal = mine.filter((q) => ['approved', 'invoiced'].includes(q.status)).reduce((a, q) => a + Math.max(0, S.totals(q).balance), 0);
    const billed = mine.reduce((a, q) => a + S.totals(q).total, 0);
    const overdue = mine.some((q) => statusOf(q) === 'overdue');
    const last = Math.max(c.createdAt || 0, ...mine.map((q) => q.createdAt));
    return { bal, billed, overdue, last, open: mine.filter((q) => ['draft', 'sent'].includes(q.status)).length };
  };
  let list = S.clients().map((c) => ({ c, ...info(c) }));
  const withBal = list.filter((x) => x.bal > 0).length;
  if (cliQuery) list = list.filter((x) => (x.c.name + ' ' + (x.c.address || '')).toLowerCase().includes(cliQuery.toLowerCase()));
  if (cliFilter === 'bal') list = list.filter((x) => x.bal > 0);
  if (cliFilter === 'recent') list = list.sort((a, b) => b.last - a.last).slice(0, 10);
  const pill = (k, label) => `<button class="pill" data-f="${k}" aria-pressed="${cliFilter === k}">${label}</button>`;
  $app.innerHTML = `
    <div class="row"><h1>Clientes</h1><a class="icon-btn primary" href="#/client/new" aria-label="Agregar cliente">${I.plus}</a></div>
    <div class="g row" style="border-radius:16px;padding:0 14px;min-height:50px;justify-content:flex-start"><span class="muted">${I.search}</span>
      <label for="qsearch" class="vh">Buscar cliente</label>
      <input id="qsearch" type="search" placeholder="Buscar por nombre o dirección" value="${esc(cliQuery)}" style="border:none;background:transparent;padding:0"></div>
    <div class="pills">${pill('all', 'Todos · ' + S.clients().length)}${pill('bal', 'Con saldo · ' + withBal)}${pill('recent', 'Recientes')}</div>
    <div class="list">${list.length ? list.map(({ c, bal, billed, overdue, open }) => `
      <a class="item g" href="#/client/${c.id}">
        <span class="avatar" style="background:${colorFor(c.name)}">${esc(initials(c.name))}</span>
        <span class="col" style="flex-grow:1"><span style="font-size:15px;font-weight:600">${esc(c.name)}</span>
          <span class="small" style="color:${overdue ? 'var(--orange-soft)' : 'var(--muted)'}">${c.address ? `<span data-noi18n>${esc(c.address)} · </span>` : ''}<span>${overdue ? 'pago vencido' : bal > 0 ? 'saldo ' + S.money(bal) : open ? open + ' cotización abierta' : billed ? 'al día' : 'sin trabajos'}</span></span></span>
        <span style="font-size:14px;font-weight:700">${S.money(billed)}</span></a>`).join('') : '<div class="empty g card">Todavía no hay clientes. Se agregan solos cuando dictas "cliente…" o puedes tocar +.</div>'}</div>`;
  const qsEl = $app.querySelector('#qsearch');
  qsEl.addEventListener('input', () => { cliQuery = qsEl.value; const pos = qsEl.selectionStart; route(); const n = $app.querySelector('#qsearch'); n.focus(); n.setSelectionRange(pos, pos); });
  $app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { cliFilter = b.dataset.f; route(); });
}

function viewClient(id) {
  setTabs(null);
  const isNew = id === 'new';
  const c = isNew ? { name: '', phone: '', email: '', address: '' } : S.getClient(id);
  if (!c) return go('#/clients');
  const mine = isNew ? [] : S.quotes().filter((q) => q.clientId === c.id);
  $app.innerHTML = `
    ${topbar(isNew ? 'Nuevo cliente' : c.name, '#/clients')}
    <form class="card g" id="cf">
      <div class="field"><label for="cn">Nombre</label><input id="cn" required value="${esc(c.name)}" placeholder="Nombre y apellido"></div>
      <div class="grid2">
        <div class="field"><label for="cp">Teléfono</label><input id="cp" type="tel" value="${esc(c.phone)}" placeholder="(555) 000-0000"></div>
        <div class="field"><label for="ce">Correo</label><input id="ce" type="email" value="${esc(c.email)}" placeholder="correo@..."></div>
      </div>
      <div class="field"><label for="ca">Dirección o ciudad</label><input id="ca" value="${esc(c.address)}" placeholder="Ej. 120 Main St, Houston"></div>
      <button class="btn primary" type="submit">${isNew ? 'Guardar cliente' : 'Guardar cambios'}</button>
    </form>
    ${isNew ? '' : `<button class="btn secondary" id="nq">${I.plus} Nueva cotización para ${esc(c.name.split(' ')[0])}</button>
    <h2>Trabajos</h2><div class="list">${mine.length ? mine.map((q) => quoteRow(q)).join('') : '<div class="empty g card">Sin trabajos todavía.</div>'}</div>`}`;
  cf.addEventListener('submit', (e) => {
    e.preventDefault();
    const saved = S.upsertClient({ ...(isNew ? {} : { id: c.id }), name: cn.value.trim(), phone: cp.value.trim(), email: ce.value.trim(), address: ca.value.trim() });
    toast('Cliente guardado');
    go(isNew ? '#/client/' + saved.id : '#/clients');
  });
  const nq = $app.querySelector('#nq');
  if (nq) nq.onclick = () => go('#/quote-form/new/' + c.id);
}

function viewSettings() {
  setTabs(null);
  const s = S.settings();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const used = S.quotes().filter((q) => q.createdAt >= monthStart).length;
  $app.innerHTML = `
    ${topbar('Editar perfil y ajustes', '#/profile')}
    <div class="card g" style="flex-direction:row;align-items:center;gap:14px">
      <label for="logo" class="avatar" id="lp" style="width:60px;height:60px;border-radius:18px;background:var(--grad);cursor:pointer;overflow:hidden;font-family:'Space Grotesk';font-size:20px" aria-label="Cambiar logo">${s.logo ? `<img class="logo-img" src="${esc(s.logo)}" alt="">` : esc(initials(s.bizName))}</label>
      <input id="logo" type="file" accept="image/*" class="vh">
      <div class="col" style="flex-grow:1"><span style="font-size:16px;font-weight:700">${esc(s.bizName || 'Mi negocio')}</span><span class="small muted">${esc([s.state, s.phone].filter(Boolean).join(' · '))}</span></div>
    </div>
    <form id="sf" class="list">
      <div class="card g">
        <span class="label">Negocio</span>
        <div class="field"><label for="biz">Nombre</label><input id="biz" value="${esc(s.bizName)}"></div>
        ${locationHTML(s)}
        <div class="field"><label for="ph">Teléfono / WhatsApp</label><input id="ph" type="tel" value="${esc(s.phone)}"></div>
        <div class="field"><label for="em">Correo</label><input id="em" type="email" value="${esc(s.email)}"></div>
        <div class="field"><label for="ow">Dueño / responsable</label><input id="ow" value="${esc(s.owner)}" placeholder="Ej. Carlos Martínez"></div>
        <div class="field"><label for="ad">Dirección</label><input id="ad" value="${esc(s.address)}" placeholder="Ej. 4520 Main St"></div>
        <div class="grid2">
          <div class="field"><label for="cy">Ciudad y código postal</label><input id="cy" value="${esc(s.city)}" placeholder="Ej. Houston 77002"></div>
          <div class="field"><label for="yr">Años de experiencia</label><input id="yr" type="number" min="0" value="${esc(s.years)}"></div>
        </div>
        <div class="field"><label for="wb">Sitio web o redes</label><input id="wb" value="${esc(s.website)}" placeholder="www.minegocio.com"></div>
        <div class="grid2">
          <div class="field"><label for="lc">Licencia #</label><input id="lc" value="${esc(s.license)}" placeholder="Opcional"></div>
          <div class="field"><span class="flabel">Asegurado</span><label class="row g" style="min-height:50px;border-radius:14px;padding:0 14px;cursor:pointer"><span style="font-size:14px">Tengo seguro</span><input id="ins" type="checkbox" ${s.insured ? 'checked' : ''}></label></div>
        </div>
      </div>
      <div class="card g">
        <span class="label">Perfil público</span>
        <div class="field"><label for="ab">Sobre la empresa</label><textarea id="ab" placeholder="Ej. Family-owned painting company serving Houston since 2012.">${esc(s.about)}</textarea></div>
        <div class="field"><label for="sv">Servicios (separados por coma)</label><textarea id="sv">${esc(s.services)}</textarea></div>
        <div class="field"><label for="wa">Garantía</label><input id="wa" value="${esc(s.warranty)}"></div>
        <div class="field"><label for="hr">Horario</label><input id="hr" value="${esc(s.hours)}"></div>
      </div>
      <div class="card tight g">
        <div class="setting"><label for="tax" style="font-size:14px">Impuesto (sales tax) %</label><input id="tax" type="number" step="0.01" min="0" value="${s.taxRate}"></div>
        <div class="setting"><label for="dep" style="font-size:14px">Anticipo predeterminado %</label><input id="dep" type="number" min="0" max="100" value="${s.depositPct}"></div>
        <div class="setting"><label for="vd" style="font-size:14px">Validez de cotización (días)</label><input id="vd" type="number" min="1" value="${s.validDays}"></div>
        <div class="setting"><span style="font-size:14px">Idioma de la app</span>
          <div class="seg" role="group" aria-label="Idioma de la app" data-noi18n><button type="button" data-applang="es" aria-pressed="${UI() !== 'en'}">Español</button><button type="button" data-applang="en" aria-pressed="${UI() === 'en'}">English</button></div></div>
        <div class="setting"><span style="font-size:14px">Idioma para el cliente</span>
          <div class="seg" role="group" aria-label="Idioma para el cliente"><button type="button" data-lang="en" aria-pressed="${s.clientLang !== 'es'}">Inglés</button><button type="button" data-lang="es" aria-pressed="${s.clientLang === 'es'}">Español</button></div></div>
      </div>
      <div class="card g">
        <div class="field"><label for="terms">Términos y garantía (los ve el cliente)</label><textarea id="terms">${esc(s.terms)}</textarea></div>
        <div class="field"><label for="pay">Link de pago con tarjeta</label><input id="pay" type="url" placeholder="https://buy.stripe.com/..." value="${esc(s.paymentLink)}">
          <span class="small muted">Crea un link de pago en Stripe, Square o PayPal y pégalo aquí.</span></div>
        <div class="field"><label for="ai">Servidor de IA (opcional)</label><input id="ai" type="url" placeholder="https://cotizapro-ai.tu-cuenta.workers.dev" value="${esc(s.aiEndpoint)}">
          <span class="small muted">Sin esto, la app usa su generador local.</span></div>
      </div>
      <button class="btn primary" type="submit">Guardar ajustes</button>
    </form>
    <div class="card g" style="background:linear-gradient(135deg,rgba(34,211,238,0.24),rgba(167,139,250,0.28))">
      <div class="row"><span class="display" style="font-size:17px;font-weight:700">Plan Gratis</span><span class="chip cyan">${used} de 3 este mes</span></div>
      <span class="small" style="color:rgba(255,255,255,0.84)">Plan Pro: cotizaciones ilimitadas, cobros y logo por $12/mes (próximamente).</span>
    </div>
    <div class="list">
      <button class="btn secondary" id="exp">Exportar respaldo (JSON)</button>
      <button class="btn danger" id="reset">Borrar todos los datos</button>
    </div>`;
  bindLogo($app.querySelector('#logo'), $app.querySelector('#lp'));
  bindLocation();
  $app.querySelectorAll('[data-applang]').forEach((b) => b.onclick = () => { S.updateSettings({ appLang: b.dataset.applang }); route(); });
  let lang = s.clientLang;
  $app.querySelectorAll('[data-lang]').forEach((b) => b.onclick = () => {
    lang = b.dataset.lang;
    $app.querySelectorAll('[data-lang]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  sf.addEventListener('submit', (e) => {
    e.preventDefault();
    S.updateSettings({
      bizName: biz.value.trim(), ...readLocation(), phone: ph.value.trim(), email: em.value.trim(),
      taxRate: Number(tax.value) || 0, depositPct: Number(dep.value) || 0, validDays: Number(vd.value) || 30,
      clientLang: lang, terms: terms.value.trim(), paymentLink: pay.value.trim(), aiEndpoint: ai.value.trim(),
      owner: ow.value.trim(), address: ad.value.trim(), city: cy.value.trim(), years: yr.value.trim(), website: wb.value.trim(),
      license: lc.value.trim(), insured: ins.checked, about: ab.value.trim(), services: sv.value.trim(), warranty: wa.value.trim(), hours: hr.value.trim()
    });
    toast('Perfil guardado');
    go('#/profile');
  });
  exp.onclick = () => {
    const blob = new Blob([JSON.stringify(S.getDB(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cotizapro-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  reset.onclick = () => { if (confirmT('Esto borra todo en este teléfono. ¿Seguro?')) { S.resetAll(); go('#/welcome'); } };
}

/* ---------- Textos para el cliente (inglés / español) ---------- */
const TXT = {
  en: {
    estimate: 'Estimate', invoice: 'Invoice', date: 'Date', valid: 'Valid until', due: 'Due', billTo: 'Customer', jobSite: 'Job site',
    start: 'Start date', duration: 'Estimated duration', scope: 'Scope of work', desc: 'Description', amount: 'Amount', subtotal: 'Subtotal',
    tax: 'Tax', total: 'Total', dep: 'Deposit due to start', paid: 'Paid', bal: 'Balance due', terms: 'Payment terms', warranty: 'Warranty',
    excl: 'Not included', accept: 'Acceptance', lic: 'License', insured: 'Licensed & insured', insuredOnly: 'Insured',
    sign: 'Type your full name to sign', signNote: 'By signing you accept the scope, price and terms of this estimate.',
    approve: 'Approve estimate', approved: 'Estimate approved!', confirm: 'Confirm approval on WhatsApp',
    confirmNote: 'Tap the button to send your approval. The company will create your work order and send you a tracking link.',
    payDep: 'Pay deposit', pay: 'Pay now', sent: 'Sent with CotizaPro', needName: 'Type your name to sign',
    wo: 'Work order', progress: 'Progress', updates: 'Updates', contact: 'Message us on WhatsApp', track: 'Job tracking', lastUpd: 'Last update',
    about: 'About us', services: 'Services', years: 'years of experience', hours: 'Hours', request: 'Request a quote on WhatsApp', call: 'Call'
  },
  es: {
    estimate: 'Cotización', invoice: 'Factura', date: 'Fecha', valid: 'Válida hasta', due: 'Vence', billTo: 'Cliente', jobSite: 'Lugar del trabajo',
    start: 'Fecha de inicio', duration: 'Duración estimada', scope: 'Alcance del trabajo', desc: 'Descripción', amount: 'Monto', subtotal: 'Subtotal',
    tax: 'Impuesto', total: 'Total', dep: 'Anticipo para empezar', paid: 'Pagado', bal: 'Saldo pendiente', terms: 'Condiciones de pago', warranty: 'Garantía',
    excl: 'No incluye', accept: 'Aceptación', lic: 'Licencia', insured: 'Con licencia y seguro', insuredOnly: 'Asegurado',
    sign: 'Escribe tu nombre completo para firmar', signNote: 'Al firmar aceptas el alcance, el precio y las condiciones de esta cotización.',
    approve: 'Aprobar cotización', approved: '¡Cotización aprobada!', confirm: 'Confirmar aprobación por WhatsApp',
    confirmNote: 'Toca el botón para enviar tu aprobación. La empresa creará tu orden de trabajo y te enviará el link de seguimiento.',
    payDep: 'Pagar anticipo', pay: 'Pagar ahora', sent: 'Enviada con CotizaPro', needName: 'Escribe tu nombre para firmar',
    wo: 'Orden de trabajo', progress: 'Avance', updates: 'Avances', contact: 'Escríbenos por WhatsApp', track: 'Seguimiento de la obra', lastUpd: 'Última actualización',
    about: 'Sobre nosotros', services: 'Servicios', years: 'años de experiencia', hours: 'Horario', request: 'Pedir cotización por WhatsApp', call: 'Llamar'
  }
};
const STAGE_EN = {
  'Orden de trabajo creada': 'Work order created',
  'Visita y medidas': 'Site visit & measurements',
  'Materiales comprados': 'Materials purchased',
  'Trabajo en progreso': 'Work in progress',
  'Revisión final con el cliente': 'Final walkthrough with you',
  'Trabajo terminado': 'Job completed',
  'Orden de trabajo creada. Pronto te contactamos para programar.': 'Work order created. We will contact you soon to schedule.'
};
const trStage = (txt, L) => (L === 'en' && STAGE_EN[txt]) || txt;
const fullDate = (t, L) => t ? new Date(typeof t === 'string' && t.length === 10 ? t + 'T12:00' : t).toLocaleDateString(L === 'es' ? 'es-US' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const smallIcon = (svg) => svg.replace(/width="\d+" height="\d+"/, 'width="14" height="14"');

/* ---------- Perfil de la empresa ---------- */
function logoBox(b, size = 52, radius = 16) {
  return `<span class="avatar g" style="width:${size}px;height:${size}px;border-radius:${radius}px;color:#fff;overflow:hidden;font-family:'Space Grotesk';font-size:${Math.round(size / 3)}px;flex-shrink:0">${b.logo ? `<img class="logo-img" src="${esc(b.logo)}" alt="">` : esc(initials(b.n))}</span>`;
}

function profileHTML(b, L, isPublic) {
  const T = TXT[L] || TXT.es;
  const contact = (icon, text, href) => text ? `<a class="setting" ${href ? `href="${esc(href)}" target="_blank" rel="noopener"` : ''} style="color:#fff;justify-content:flex-start;gap:12px"><span style="color:var(--cyan)">${icon}</span><span style="font-size:14px;word-break:break-word">${esc(text)}</span></a>` : '';
  const site = b.web ? (b.web.startsWith('http') ? b.web : 'https://' + b.web) : '';
  return `
    <div class="card g" style="align-items:center;text-align:center;padding:24px 18px;gap:12px;background:linear-gradient(160deg,rgba(34,211,238,0.20),rgba(167,139,250,0.22))">
      ${logoBox(b, 92, 28)}
      <div class="col" style="align-items:center;gap:4px">
        <h1 style="font-size:24px">${esc(b.n || 'Mi empresa')}</h1>
        ${b.owner ? `<span class="muted" style="font-size:14px">${esc(b.owner)}</span>` : ''}
      </div>
      <div class="pills" style="justify-content:center">
        ${b.ins ? `<span class="chip green">${smallIcon(I.shield)} ${b.lic ? T.insured : T.insuredOnly}</span>` : ''}
        ${b.lic ? `<span class="chip violet">${T.lic} #${esc(b.lic)}</span>` : ''}
        ${b.years ? `<span class="chip cyan">${esc(b.years)} ${T.years}</span>` : ''}
      </div>
    </div>
    ${b.about ? `<div class="card g"><span class="label">${T.about}</span><p style="font-size:14px;line-height:1.55">${esc(b.about)}</p></div>` : ''}
    ${b.services?.length ? `<div class="card g"><span class="label v">${T.services}</span><div class="pills">${b.services.map((x) => `<span class="chip gray" style="font-size:13px;padding:7px 12px;color:#fff">${esc(x)}</span>`).join('')}</div></div>` : ''}
    <div class="card tight g">
      ${contact(I.phone, b.p, b.p ? 'tel:' + digits(b.p) : '')}
      ${contact(I.whatsapp.replace(/width="\d+" height="\d+"/, 'width="18" height="18"'), b.p ? 'WhatsApp' : '', b.p ? 'https://wa.me/' + usPhone(b.p) : '')}
      ${contact(I.mail, b.e, b.e ? 'mailto:' + b.e : '')}
      ${contact(I.globe, b.web, site)}
      ${contact(I.pin, b.addr || b.st, b.addr ? 'https://maps.google.com/?q=' + encodeURIComponent(b.addr) : '')}
      ${contact(I.clock, b.hours ? `${T.hours}: ${b.hours}` : '', '')}
      ${contact(I.shield.replace(/width="\d+" height="\d+"/, 'width="18" height="18"'), b.warranty, '')}
    </div>
    ${isPublic && b.p ? `<a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/${usPhone(b.p)}?text=${encodeURIComponent(L === 'es' ? `Hola ${b.n}, quisiera una cotización.` : `Hi ${b.n}, I would like a quote.`)}">${I.whatsapp} ${T.request}</a>` : ''}`;
}

function viewProfile() {
  setTabs('profile');
  const b = bizInfo(true);
  $app.innerHTML = `
    <div class="row"><h1>Perfil de la empresa</h1><a class="icon-btn" href="#/settings" aria-label="Editar perfil">${I.pen}</a></div>
    <div data-noi18n>${profileHTML(b, UI(), false)}</div>
    <a class="btn primary" href="#/quote-form">${I.tool} Cotizar servicio</a>
    <button class="btn secondary" id="shp">${I.share} Compartir perfil con un cliente</button>
    <a class="btn secondary" href="#/employees">${I.users} Empleados y planillas</a>
    <a class="btn secondary" href="#/settings">${I.gear} Editar perfil y ajustes</a>`;
  shp.onclick = async () => {
    const url = `${appBase()}#/c/${S.encodeShare({ v: 2, kind: 'profile', b: bizInfo(true), lang: S.settings().clientLang })}`;
    const text = `${b.n} — ${url}`;
    if (navigator.share) { try { await navigator.share({ title: b.n, text }); return; } catch (e) { return; } }
    try { await navigator.clipboard.writeText(url); toast('Link del perfil copiado'); } catch (e) { promptT('Copia este link:', url); }
  };
}


/* ---------- Fotos del antes y después (opcionales) ---------- */
const photoList = (q) => ({ before: [...(q?.photos?.before || [])], after: [...(q?.photos?.after || [])] });
const hasPhotos = (q) => !!(q?.photos?.before?.length || q?.photos?.after?.length);

function photoSectionHTML(kind, ids, editable) {
  const label = kind === 'before' ? 'Antes' : 'Después';
  return `<div class="field" data-photos="${kind}">
    <span class="flabel">${label}</span>
    <div class="ph-grid">
      ${ids.map((pid) => `<div class="ph"><img data-ph="${pid}" alt="${label}">${editable ? `<button type="button" class="ph-x" data-rm-ph="${pid}" aria-label="Quitar foto">×</button>` : `<span class="ph-tag">${label}</span>`}</div>`).join('')}
      ${editable ? `<label class="ph-add"><input type="file" accept="image/*" capture="environment" class="vh" data-add-ph="${kind}">${I.camera}<span>Cámara</span></label>
      <label class="ph-add"><input type="file" accept="image/*" multiple class="vh" data-add-ph="${kind}">${I.image}<span>Galería</span></label>` : ''}
    </div>
    ${editable && !ids.length ? '<span class="small muted">Opcional</span>' : ''}
  </div>`;
}

async function hydratePhotos(root) {
  for (const img of root.querySelectorAll('img[data-ph]')) {
    if (!img.src) img.src = await photoURL(img.dataset.ph);
  }
}

function bindPhotoEditor(root, state, onChange) {
  const redraw = (kind) => {
    const el = root.querySelector(`[data-photos="${kind}"]`);
    if (!el) return;
    el.outerHTML = photoSectionHTML(kind, state[kind], true);
    hydratePhotos(root);
  };
  root.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-add-ph]');
    if (!inp || !inp.files.length) return;
    const kind = inp.dataset.addPh;
    toast('Guardando foto…');
    try {
      const ids = await addPhotos([...inp.files]);
      state[kind].push(...ids);
      redraw(kind);
      onChange(state);
      toast(ids.length > 1 ? 'Fotos agregadas' : 'Foto agregada');
    } catch (err) {
      toast('No se pudo guardar la foto');
    }
  });
  root.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm-ph]');
    if (rm) {
      const pid = rm.dataset.rmPh;
      for (const k of ['before', 'after']) state[k] = state[k].filter((x) => x !== pid);
      deletePhotos([pid]);
      redraw('before'); redraw('after');
      onChange(state);
    }
  });
}

// Tocar una foto la abre en grande
document.addEventListener('click', (e) => {
  const img = e.target.closest('img[data-ph]');
  if (!img || !img.src) return;
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<img src="${img.src}" alt="">`;
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
});

/* ---------- Formulario de cotización ---------- */
function startDictation(textarea, statusEl, btn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Tu navegador no permite dictado'); return null; }
  const r = new SR();
  r.lang = UI() === 'en' ? 'en-US' : 'es-US'; r.continuous = true; r.interimResults = true;
  const base = textarea.value ? textarea.value.trim() + ' ' : '';
  let fin = '';
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) fin += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    textarea.value = base + fin + interim;
  };
  r.onstart = () => { btn.classList.add('on'); statusEl.textContent = 'Escuchando… toca otra vez para terminar'; };
  r.onend = () => { btn.classList.remove('on'); statusEl.textContent = ''; btn._rec = null; };
  r.onerror = (e) => { statusEl.textContent = e.error === 'not-allowed' ? 'Permite el micrófono' : 'No te escuché, intenta otra vez'; };
  r.start();
  return r;
}

const DUR_UNITS = [['days', 'días', 'day', 'día'], ['weeks', 'semanas', 'week', 'semana'], ['hours', 'horas', 'hour', 'hora']];
function parseDuration(txt) {
  const m = String(txt || '').match(/([\d.,]+)\s*([a-záéíóú]+)/i);
  if (!m) return { n: '', u: 'days' };
  const w = m[2].toLowerCase();
  const u = (DUR_UNITS.find((x) => x.some((y) => w.startsWith(y.slice(0, 3)))) || DUR_UNITS[0])[0];
  return { n: m[1].replace(',', '.'), u };
}
function formatDuration(n, u, lang) {
  const v = Number(n);
  if (!v) return '';
  const x = DUR_UNITS.find((d) => d[0] === u) || DUR_UNITS[0];
  const word = lang === 'es' ? (v === 1 ? x[3] : x[1]) : (v === 1 ? x[2] : x[0]);
  return `${v} ${word}`;
}

function viewQuoteForm(arg, extra) {
  setTabs(null);
  const s = S.settings();
  const editing = arg && arg !== 'new' ? S.getQuote(arg) : null;
  if (arg && arg !== 'new' && !editing) return go('#/quote-form');
  const q = editing || { items: [{ en: '', es: '', note: '', qty: 1, price: 0 }], taxRate: s.taxRate, depositPct: s.depositPct, clientId: extra || null, title: '', scope: '', jobAddress: '', startDate: '', duration: '', exclusions: '' };
  const c = S.getClient(q.clientId) || { name: '', phone: '', email: '', address: '' };
  const services = (s.services || '').split(',').map((x) => x.trim()).filter(Boolean);
  const validDays = editing ? Math.max(1, Math.round((q.validUntil - q.createdAt) / 86400000)) : s.validDays;
  const { n: durN, u: durU } = parseDuration(q.duration);
  const photoState = photoList(q);
  $app.innerHTML = `
    ${topbar(editing ? 'Editar cotización #' + q.number : 'Cotizar servicio', editing ? '#/doc/' + q.id : '#/profile')}
    <form id="qf" class="list" style="gap:14px" novalidate>
      <div class="card g">
        <span class="label">1 · Datos del cliente</span>
        ${S.clients().length ? `<div class="field"><label for="cli">Cliente existente</label><select id="cli"><option value="">— Cliente nuevo —</option>${S.clients().map((x) => `<option value="${x.id}" ${x.id === q.clientId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label for="cn">Nombre completo *</label><input id="cn" autocomplete="off" value="${esc(c.name)}" placeholder="Ej. Jennifer Smith"></div>
        <div class="grid2">
          <div class="field"><label for="cp">WhatsApp / teléfono *</label><input id="cp" type="tel" value="${esc(c.phone)}" placeholder="(713) 555-0100"></div>
          <div class="field"><label for="ce">Correo</label><input id="ce" type="email" value="${esc(c.email)}" placeholder="correo@..."></div>
        </div>
        <div class="field"><label for="ca">Dirección del cliente</label><input id="ca" value="${esc(c.address)}" placeholder="Ej. 120 Oak St, Houston, TX"></div>
      </div>

      <div class="card g">
        <span class="label">2 · Servicio</span>
        ${services.length ? `<div class="field"><span class="flabel">Tipo de servicio</span><div class="pills">${services.map((x) => `<button type="button" class="pill" data-svc="${esc(x)}" aria-pressed="${q.title === x}">${esc(x)}</button>`).join('')}</div></div>` : ''}
        <div class="field"><label for="ttl">Título del trabajo (lo ve el cliente)</label><input id="ttl" value="${esc(q.title)}" placeholder="Ej. Interior painting"></div>
        <div class="field"><label for="job">Lugar del trabajo</label><input id="job" value="${esc(q.jobAddress)}" placeholder="Igual que la dirección del cliente"></div>
        <div class="field"><label for="scope">Alcance del trabajo (lo lee el cliente tal cual)</label>
          <textarea id="scope" placeholder="Ej. Paint 3 bedrooms, walls and trim, 2 coats. Patch cracks before painting. Move and cover furniture.">${esc(q.scope || q.transcript || '')}</textarea>
          <div class="row" style="justify-content:flex-start;gap:10px">
            <button type="button" class="icon-btn" id="dict" aria-label="Dictar con voz">${I.mic(20)}</button>
            <button type="button" class="link-btn" id="genit" style="text-align:left">Generar partidas desde la descripción</button>
          </div>
          <span class="small muted" id="dst"></span>
        </div>
      </div>

      <div class="card g">
        <span class="label v">3 · Partidas y precios</span>
        <div class="list" id="lines">${q.items.map((it, i) => lineHTML(it, i)).join('')}</div>
        <button type="button" class="btn secondary" id="add">${I.plus} Agregar partida</button>
      </div>

      <div class="card g">
        <span class="label">4 · Fechas del trabajo</span>
        <div class="field"><label for="sd">Fecha de inicio</label><input id="sd" type="date" value="${esc(q.startDate)}"></div>
        <div class="field"><label for="dun">Duración estimada</label>
          <div class="row" style="gap:10px">
            <input id="dun" type="number" min="0" step="0.5" inputmode="decimal" placeholder="Ej. 3" value="${durN}" style="flex:1">
            <label for="duu" class="vh">Unidad</label>
            <select id="duu" style="flex:1.3">${DUR_UNITS.map(([k, es]) => `<option value="${k}" ${k === durU ? 'selected' : ''}>${es}</option>`).join('')}</select>
          </div></div>
        <div class="field"><label for="vd">La cotización es válida por</label>
          <select id="vd">${[7, 15, 30, 45, 60, 90].map((d) => `<option value="${d}" ${d === Number(validDays) ? 'selected' : ''}>${d} días</option>`).join('')}${[7, 15, 30, 45, 60, 90].includes(Number(validDays)) ? '' : `<option value="${validDays}" selected>${validDays} días</option>`}</select></div>
      </div>

      <div class="card g">
        <span class="label">5 · Pago y condiciones</span>
        <div class="grid2">
          <div class="field"><label for="tax">Impuesto</label>
            <div class="suffix"><input id="tax" type="number" step="0.01" min="0" inputmode="decimal" value="${q.taxRate}"><span>%</span></div></div>
          <div class="field"><label for="dep">Anticipo</label>
            <div class="suffix"><input id="dep" type="number" min="0" max="100" inputmode="numeric" value="${q.depositPct}"><span>%</span></div></div>
        </div>
        <div class="field"><label for="ex">No incluye (opcional)</label>
          <textarea id="ex" rows="2" style="min-height:70px" placeholder="Ej. Wallpaper removal, furniture moving">${esc(q.exclusions)}</textarea></div>
        <span class="small muted">Las condiciones de pago y la garantía salen de tu perfil.</span>
      </div>

      <div class="card g" id="phbox">
        <span class="label">6 · Fotos del antes y después (opcional)</span>
        ${photoSectionHTML('before', photoState.before, true)}
        ${photoSectionHTML('after', photoState.after, true)}
        <span class="small muted">Puedes agregar las fotos del después más tarde, en la orden de trabajo.</span>
      </div>

      <div class="card g">
        <span class="label v">Resumen</span>
        <div id="tot"></div>
      </div>

      <button class="btn primary" type="submit">${I.check} ${editing ? 'Guardar y ver cotización' : 'Generar cotización'}</button>
    </form>`;

  const tmp = () => ({
    items: [...$app.querySelectorAll('.line')].map((el) => ({
      en: el.querySelector('[data-f=en]').value.trim(), es: el.querySelector('[data-f=es]').value.trim(), note: el.querySelector('[data-f=note]').value.trim(),
      qty: Number(el.querySelector('[data-f=qty]').value) || 0, price: Number(el.querySelector('[data-f=price]').value) || 0
    })),
    taxRate: Number(tax.value) || 0, depositPct: Number(dep.value) || 0, payments: []
  });
  const refresh = () => { $app.querySelector('#tot').innerHTML = totalsHTML(tmp()); };
  refresh();
  hydratePhotos($app);
  bindPhotoEditor($app.querySelector('#phbox'), photoState, (st) => { if (editing) S.updateQuote(editing.id, { photos: photoList({ photos: st }) }); });
  $app.addEventListener('input', (e) => { if (e.target.closest('#lines') || e.target.matches('#tax, #dep')) refresh(); });
  $app.querySelector('#lines').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { b.closest('.line').remove(); refresh(); } });
  add.onclick = () => { $app.querySelector('#lines').insertAdjacentHTML('beforeend', lineHTML({ en: '', es: '', note: '', qty: 1, price: 0 }, Date.now())); $app.querySelector('#lines .line:last-child [data-f=en]').focus(); };
  const cliSel = $app.querySelector('#cli');
  if (cliSel) cliSel.onchange = () => {
    const x = S.getClient(cliSel.value) || { name: '', phone: '', email: '', address: '' };
    cn.value = x.name; cp.value = x.phone; ce.value = x.email; ca.value = x.address;
  };
  $app.querySelectorAll('[data-svc]').forEach((b) => b.onclick = () => {
    ttl.value = b.dataset.svc;
    $app.querySelectorAll('[data-svc]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  dict.onclick = () => { if (dict._rec) { dict._rec.stop(); return; } dict._rec = startDictation(scope, dst, dict); };
  genit.onclick = async () => {
    if (!scope.value.trim()) { toast('Escribe o dicta la descripción primero'); return; }
    genit.textContent = 'Generando…';
    const r = await parseDictation(scope.value, { aiEndpoint: s.aiEndpoint, trade: s.trade, state: s.state });
    const lines = $app.querySelector('#lines');
    const current = tmp().items.filter((i) => i.en || i.price);
    lines.innerHTML = [...current, ...r.items].map((it, i) => lineHTML(it, i)).join('');
    if (!ttl.value && r.title) ttl.value = r.title;
    if (!cn.value && r.client) cn.value = r.client;
    if (!ca.value && r.city) ca.value = r.city;
    genit.textContent = 'Generar partidas desde la descripción';
    refresh();
    toast('Partidas agregadas: revisa precios');
  };
  qf.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = cn.value.trim();
    const t = tmp();
    if (!name) { toast('Escribe el nombre del cliente'); cn.focus(); return; }
    if (!cp.value.trim()) { toast('Escribe el WhatsApp del cliente'); cp.focus(); return; }
    t.items = t.items.filter((i) => i.en || i.es || i.price);
    if (!t.items.length || !t.items.some((i) => i.price > 0)) { toast('Agrega al menos una partida con precio'); return; }
    let client = cliSel && cliSel.value ? S.getClient(cliSel.value) : S.clients().find((x) => x.name.toLowerCase() === name.toLowerCase());
    client = S.upsertClient({ ...(client ? { id: client.id } : {}), name, phone: cp.value.trim(), email: ce.value.trim(), address: ca.value.trim() });
    const data = {
      clientId: client.id, title: ttl.value.trim(), jobAddress: job.value.trim(), scope: scope.value.trim(), items: t.items,
      startDate: sd.value, duration: formatDuration(dun.value, duu.value, s.clientLang), photos: photoList({ photos: photoState }), taxRate: t.taxRate, depositPct: t.depositPct, exclusions: ex.value.trim()
    };
    let saved;
    if (editing) {
      saved = S.updateQuote(editing.id, { ...data, validUntil: editing.createdAt + (Number(vd.value) || 30) * 86400000 }, 'Cotización editada');
    } else {
      saved = S.newQuote(data);
      S.updateQuote(saved.id, { validUntil: saved.createdAt + (Number(vd.value) || 30) * 86400000 });
    }
    toast('Cotización lista');
    go('#/doc/' + saved.id);
  });
}

/* ---------- Formato profesional de cotización ---------- */
function docHTML(p, L) {
  const T = TXT[L] || TXT.en;
  const q = p.q, b = p.b;
  const t = S.totals({ items: q.items, taxRate: q.tax, depositPct: q.dep, payments: q.paid ? [{ amount: q.paid }] : [] });
  const inv = p.kind === 'invoice';
  const desc = (i) => (L === 'es' && i.es ? i.es : i.en || i.es);
  const kv = (k, v) => v ? `<div class="col"><span class="small muted">${k}</span><span style="font-size:14px;font-weight:600">${esc(v)}</span></div>` : '';
  return `
  <article class="card g doc" data-noi18n style="gap:14px;padding:18px">
    <div class="row" style="align-items:flex-start">
      <div class="row" style="gap:12px;justify-content:flex-start;align-items:flex-start;min-width:0">
        ${logoBox(b, 52, 16)}
        <div class="col" style="gap:2px">
          <span class="display" style="font-size:16px;font-weight:700">${esc(b.n)}</span>
          ${b.owner ? `<span class="small muted">${esc(b.owner)}</span>` : ''}
          ${b.addr ? `<span class="small muted">${esc(b.addr)}</span>` : ''}
          <span class="small muted">${esc([b.p, b.e].filter(Boolean).join(' · '))}</span>
          ${b.web ? `<span class="small muted">${esc(b.web)}</span>` : ''}
        </div>
      </div>
      <div class="col" style="align-items:flex-end;text-align:right;flex-shrink:0">
        <span class="label" style="font-size:12px">${inv ? T.invoice : T.estimate}</span>
        <span class="display" style="font-size:18px;font-weight:700">#${q.n}</span>
        <span class="small muted">${fullDate(q.created, L)}</span>
      </div>
    </div>
    ${b.ins || b.lic ? `<div class="pills">${b.ins ? `<span class="chip green">${smallIcon(I.shield)} ${b.lic ? T.insured : T.insuredOnly}</span>` : ''}${b.lic ? `<span class="chip violet">${T.lic} #${esc(b.lic)}</span>` : ''}</div>` : ''}
    <div class="sep"></div>
    <div class="grid2" style="align-items:start">
      <div class="col" style="gap:3px"><span class="label">${T.billTo}</span>
        <span style="font-size:14px;font-weight:600">${esc(q.client)}</span>
        ${q.addr ? `<span class="small muted">${esc(q.addr)}</span>` : ''}
        ${q.cphone ? `<span class="small muted">${esc(q.cphone)}</span>` : ''}
        ${q.cemail ? `<span class="small muted">${esc(q.cemail)}</span>` : ''}</div>
      <div class="col" style="gap:3px"><span class="label">${T.jobSite}</span>
        <span style="font-size:14px;font-weight:600">${esc(q.title || '—')}</span>
        ${q.job ? `<span class="small muted">${esc(q.job)}</span>` : ''}</div>
    </div>
    ${q.start || q.dur || q.valid ? `<div class="grid2">${kv(T.start, q.start ? fullDate(q.start, L) : '')}${kv(T.duration, q.dur)}${inv ? kv(T.due, q.due ? fullDate(q.due, L) : '') : kv(T.valid, fullDate(q.valid, L))}</div>` : ''}
    ${q.scope ? `<div class="col" style="gap:6px"><span class="label v">${T.scope}</span><p style="font-size:14px;line-height:1.55;white-space:pre-line">${esc(q.scope)}</p></div>` : ''}
    <div class="col" style="gap:0">
      <div class="row small muted" style="padding:8px 0;border-bottom:1px solid var(--line)"><span>${T.desc}</span><span>${T.amount}</span></div>
      ${q.items.map((i) => `<div class="row" style="align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line)">
        <span class="col"><span style="font-size:14px;font-weight:500">${esc(desc(i))}</span>
        <span class="small muted">${i.qty} × ${S.money(i.price)}${i.note ? ' · ' + esc(i.note) : ''}</span></span>
        <span style="font-size:14px;font-weight:600">${S.money(i.qty * i.price)}</span></div>`).join('')}
    </div>
    <div class="list" style="gap:6px">
      <div class="row small muted" style="font-size:13px"><span>${T.subtotal}</span><span>${S.money(t.subtotal)}</span></div>
      <div class="row small muted" style="font-size:13px"><span>${T.tax} (${q.tax}%)</span><span>${S.money(t.tax)}</span></div>
      <div class="row"><span style="font-weight:600">${T.total}</span><span class="big">${S.money(t.total)}</span></div>
      ${inv ? `<div class="row small muted"><span>${T.paid}</span><span>${S.money(t.paid)}</span></div>
        <div class="row" style="padding:10px 12px;border-radius:14px;background:rgba(110,231,183,0.16)"><span style="font-size:13px">${T.bal}</span><span style="font-weight:700;color:var(--green-soft)">${S.money(t.balance)}</span></div>`
      : q.dep ? `<div class="row" style="padding:10px 12px;border-radius:14px;background:rgba(34,211,238,0.16)"><span style="font-size:13px">${T.dep} (${q.dep}%)</span><span style="font-weight:700;color:var(--cyan-soft)">${S.money(t.deposit)}</span></div>` : ''}
    </div>
    ${q.terms ? `<div class="col" style="gap:4px"><span class="label v">${T.terms}</span><p class="small muted" style="line-height:1.5">${esc(q.terms)}</p></div>` : ''}
    ${b.warranty ? `<div class="col" style="gap:4px"><span class="label v">${T.warranty}</span><p class="small muted" style="line-height:1.5">${esc(b.warranty)}</p></div>` : ''}
    ${q.excl ? `<div class="col" style="gap:4px"><span class="label v">${T.excl}</span><p class="small muted" style="line-height:1.5">${esc(q.excl)}</p></div>` : ''}
  </article>`;
}

function viewDoc(id) {
  const q = S.getQuote(id);
  if (!q) return go('#/works');
  setTabs(null);
  const L = docLang || S.settings().clientLang || 'en';
  const p = sharePayload(q, 'estimate');
  $app.innerHTML = `
    ${topbar('Cotización #' + q.number, '#/works', `<a class="icon-btn" href="#/quote-form/${q.id}" aria-label="Editar cotización">${I.pen}</a>`)}
    <div class="row no-print">${chip(q)}
      <div class="seg" role="group" aria-label="Idioma de vista"><button data-l="en" aria-pressed="${L === 'en'}">EN</button><button data-l="es" aria-pressed="${L === 'es'}">ES</button></div></div>
    ${docHTML(p, L)}
    ${hasPhotos(q) ? `<div class="card g"><span class="label">Fotos del trabajo</span>${q.photos.before.length ? photoSectionHTML('before', q.photos.before, false) : ''}${q.photos.after.length ? photoSectionHTML('after', q.photos.after, false) : ''}</div>` : ''}
    ${q.signature ? `<div class="card g"><span class="label">Aprobada</span><span class="sig" style="font-size:24px;border:none">${esc(q.signature)}</span><span class="small muted">${q.approvedAt ? fullDate(q.approvedAt, UI()) : ''}</span></div>` : ''}
    <div class="list no-print">
      ${q.wo ? `<a class="btn green" href="#/wo/${q.id}">${I.tool} Ver orden de trabajo #${q.wo.number}</a>` : `<button class="btn primary" id="send">${I.whatsapp} Enviar al cliente por WhatsApp</button>`}
      <a class="btn secondary" href="${esc(shareUrl(q))}">${I.eye} Ver como el cliente</a>
      ${!q.wo ? `<button class="btn secondary" id="appr">${I.check} El cliente aprobó (crear orden de trabajo)</button>` : ''}
      <button class="btn secondary" id="pdf">${I.print} Descargar PDF</button>
      <button class="btn danger" id="del">${I.trash} Eliminar cotización</button>
    </div>
    ${historyHTML(q)}`;
  $app.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => { docLang = b.dataset.l; route(); });
  hydratePhotos($app);
  const sn = $app.querySelector('#send');
  if (sn) sn.onclick = () => openShare(q, 'estimate');
  const ap = $app.querySelector('#appr');
  if (ap) ap.onclick = () => {
    const name = promptT('Nombre de quien aprobó:', S.getClient(q.clientId)?.name || '');
    if (name === null) return;
    S.createWorkOrder(q.id, name.trim(), 'marcada en la app');
    toast('Orden de trabajo creada');
    go('#/wo/' + q.id);
  };
  pdf.onclick = () => window.print();
  del.onclick = () => { if (confirmT('¿Eliminar esta cotización?')) { deletePhotos([...(q.photos?.before || []), ...(q.photos?.after || [])]); S.deleteQuote(q.id); go('#/works'); } };
}
let docLang = null;

/* ---------- Aprobación que llega desde el cliente ---------- */
function viewApprove(id, sigEnc) {
  setTabs(null);
  const q = S.getQuote(id);
  let sig = '';
  try { sig = decodeURIComponent(sigEnc || ''); } catch (e) { sig = ''; }
  if (!q) {
    $app.innerHTML = `${topbar('Aprobación', '#/home')}<div class="card g empty">No encontré esta cotización en este teléfono.<br>Abre el link en el teléfono donde creaste la cotización.</div>`;
    return;
  }
  const fresh = !q.wo;
  S.createWorkOrder(q.id, sig, 'confirmada por el cliente');
  $app.innerHTML = `
    ${topbar('Cotización aprobada', '#/home')}
    <div class="card g" style="align-items:center;text-align:center;padding:28px 18px;background:rgba(110,231,183,0.14)">
      <span style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#6EE7B7,#67E8F9);color:#0A0F1F">${I.check}</span>
      <h1 style="font-size:22px">${esc(S.getClient(q.clientId)?.name || 'El cliente')} aprobó la cotización #${q.number}</h1>
      <span class="muted" style="font-size:14px">${fresh ? 'Se creó' : 'Ya existía'} la orden de trabajo #${q.wo.number}${sig ? ' · firmada por ' + esc(sig) : ''}</span>
    </div>
    <a class="btn primary" href="#/wo/${q.id}">${I.tool} Abrir orden de trabajo</a>`;
}

/* ---------- Orden de trabajo y seguimiento ---------- */
function trackPayload(q) {
  const c = S.getClient(q.clientId);
  return {
    v: 2, kind: 'track', base: appBase(), lang: S.settings().clientLang,
    b: (({ n, p, e, logo, ins, lic }) => ({ n, p, e, logo, ins, lic }))(bizInfo(false)),
    w: {
      n: q.wo.number, qn: q.number, title: q.title, client: c?.name || '', job: q.jobAddress || c?.address || '',
      start: q.startDate, dur: q.duration, pct: q.wo.progress,
      st: q.wo.stages.map((x) => [x.label, x.done ? 1 : 0, x.t || 0]),
      up: q.wo.updates.slice(-12).map((u) => [u.t, u.text, u.pct])
    }
  };
}
const trackUrl = (q) => `${appBase()}#/c/${S.encodeShare(trackPayload(q))}`;

function sendTracking(q) {
  const s = S.settings();
  const c = S.getClient(q.clientId);
  const first = (c?.name || '').split(' ')[0];
  const last = q.wo.updates[q.wo.updates.length - 1];
  const msg = s.clientLang === 'es'
    ? `Hola ${first}, avance de tu obra (orden #${q.wo.number}): ${q.wo.progress}% completado.${last ? ' ' + last.text + '.' : ''} Mira el seguimiento aquí: ${trackUrl(q)}`
    : `Hi ${first}, update on your job (work order #${q.wo.number}): ${q.wo.progress}% complete.${last ? ' ' + last.text + '.' : ''} See the progress here: ${trackUrl(q)}`;
  window.open(`https://wa.me/${usPhone(c?.phone)}?text=${encodeURIComponent(msg)}`, '_blank');
  S.updateQuote(q.id, { lastTrackSent: Date.now() }, 'Seguimiento enviado al cliente');
}

function stageList(stages, L, editable) {
  return stages.map((x, i) => {
    const [label, done, t] = Array.isArray(x) ? x : [x.label, x.done, x.t];
    const dot = `<span style="width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;${done ? 'background:linear-gradient(135deg,#6EE7B7,#67E8F9);color:#0A0F1F' : 'border:2px solid rgba(255,255,255,0.3);color:transparent'}">${I.check.replace(/width="\d+" height="\d+"/, 'width="14" height="14"')}</span>`;
    const body = `<span class="col" style="flex-grow:1"><span style="font-size:14px;font-weight:${done ? 600 : 400};color:${done ? '#fff' : 'var(--muted)'}">${esc(editable ? label : trStage(label, L))}</span>${t ? `<span class="small muted">${fullDate(t, L)}</span>` : ''}</span>`;
    return editable
      ? `<label class="row" style="justify-content:flex-start;gap:12px;min-height:48px;cursor:pointer">${dot}${body}<input type="checkbox" data-stage="${i}" ${done ? 'checked' : ''} ${i === 0 ? 'disabled' : ''} class="vh"></label>`
      : `<div class="row" style="justify-content:flex-start;gap:12px;min-height:44px">${dot}${body}</div>`;
  }).join('');
}

function viewWorkOrder(id) {
  const q = S.getQuote(id);
  if (!q) return go('#/works');
  if (!q.wo) return go('#/doc/' + id);
  setTabs(null);
  const c = S.getClient(q.clientId);
  const w = q.wo;
  $app.innerHTML = `
    ${topbar('Orden de trabajo #' + w.number, '#/works')}
    <div class="card g" style="gap:8px">
      <div class="row"><span style="font-size:16px;font-weight:700">${esc(q.title || 'Trabajo')}</span>${chip(q)}</div>
      <span class="small muted">${esc(c?.name || '')}${q.jobAddress || c?.address ? ' · ' + esc(q.jobAddress || c.address) : ''}</span>
      <div class="row small muted"><span>Cotización #${q.number} · ${S.money(S.totals(q).total)}</span><span>${q.startDate ? 'Inicio ' + fullDate(q.startDate, UI()) : ''}</span></div>
    </div>
    <div class="card g" style="gap:12px">
      <div class="row"><span class="label">Avance de la obra</span><span class="big">${w.progress}%</span></div>
      <div class="bar"><div style="width:${w.progress}%"></div></div>
      <label for="pct" class="vh">Porcentaje de avance</label>
      <input id="pct" type="range" min="0" max="100" step="5" value="${w.progress}" style="min-height:32px;padding:0;accent-color:#67E8F9;border:none;background:transparent">
    </div>
    ${crewCardHTML(q)}
    ${w.progress >= 100 ? `<div class="card g" style="background:linear-gradient(135deg,rgba(110,231,183,0.22),rgba(103,232,249,0.18));gap:10px">
      <span style="font-weight:700;display:flex;gap:8px;align-items:center">${I.check} Trabajo terminado${q.completedAt ? ' · ' + fullDate(q.completedAt, UI()) : ''}</span>
      <span class="small muted">Genera la factura final en PDF y envíala al cliente por WhatsApp o correo.</span>
      ${q.payroll ? `<a class="btn secondary" href="#/payroll/${q.id}">${I.users} Pagar a empleados (planilla #${q.payroll.number})</a>` : ''}
      <button class="btn green" id="finpdf">${I.print} Factura final en PDF</button>
      <a class="btn secondary" href="#/invoice/${q.id}">${I.card} Registrar pagos</a>
    </div>` : ''}
    <div class="card g" style="gap:2px"><span class="label v" style="margin-bottom:6px">Etapas · toca para marcar</span>${stageList(w.stages, UI(), true)}</div>
    <div class="card g" id="phbox">
      <span class="label">Fotos del antes y después</span>
      ${photoSectionHTML('before', photoList(q).before, true)}
      ${photoSectionHTML('after', photoList(q).after, true)}
      ${hasPhotos(q) ? `<button type="button" class="btn secondary" id="shph">${I.share} Enviar fotos al cliente</button>` : '<span class="small muted">Opcional. Las fotos también salen en la factura final en PDF.</span>'}
    </div>
    <form class="card g" id="uf">
      <label class="label" for="ut">Nuevo avance para el cliente</label>
      <textarea id="ut" placeholder="Ej. Terminamos la primera mano en los 3 cuartos. Mañana segunda mano."></textarea>
      <button class="btn secondary" type="submit">${I.check} Guardar avance</button>
    </form>
    <div class="list no-print">
      <button class="btn green" id="st">${I.whatsapp} Enviar seguimiento al cliente</button>
      <a class="btn secondary" href="${esc(trackUrl(q))}">${I.eye} Ver como el cliente</a>
      <a class="btn secondary" href="#/invoice/${q.id}">${I.card} Factura y cobro</a>
      <a class="btn secondary" href="#/doc/${q.id}">${I.file} Ver cotización aprobada</a>
    </div>
    <div class="card g"><span class="label v">Avances registrados</span>
      ${[...w.updates].reverse().map((u) => `<div class="row" style="align-items:flex-start"><span class="col" style="flex-grow:1"><span style="font-size:14px">${esc(u.text)}</span><span class="small muted">${fullDate(u.t, UI())} · ${u.pct}%</span></span></div>`).join('<div class="sep"></div>')}
    </div>`;
  pct.addEventListener('change', () => { S.setProgress(q.id, pct.value); route(); });
  pct.addEventListener('input', () => { $app.querySelector('.big').textContent = pct.value + '%'; $app.querySelector('.bar > div').style.width = pct.value + '%'; });
  $app.querySelectorAll('[data-stage]').forEach((cb) => cb.addEventListener('change', () => { S.setStage(q.id, Number(cb.dataset.stage), cb.checked); route(); }));
  uf.addEventListener('submit', (e) => { e.preventDefault(); if (!ut.value.trim()) { toast('Escribe el avance'); return; } S.addUpdate(q.id, ut.value); toast('Avance guardado. Envíalo al cliente.'); route(); });
  hydratePhotos($app);
  bindCrew(q);
  const phState = photoList(q);
  bindPhotoEditor($app.querySelector('#phbox'), phState, (st) => {
    const had = hasPhotos(q);
    S.updateQuote(q.id, { photos: photoList({ photos: st }) });
    if (had !== hasPhotos(q)) route();
  });
  const sp = $app.querySelector('#shph');
  if (sp) sp.onclick = async () => {
    const files = [...await photoFiles(q.photos.before, 'antes'), ...await photoFiles(q.photos.after, 'despues')];
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, title: S.settings().bizName }); S.updateQuote(q.id, {}, 'Fotos enviadas al cliente'); } catch (e) { /* cancelado */ }
    } else toast('Tu teléfono no permite compartir fotos desde aquí');
  };
  const fp = $app.querySelector('#finpdf');
  if (fp) fp.onclick = () => sendInvoicePdf(q, fp);
  st.onclick = () => { if (!c?.phone) { toast('El cliente no tiene WhatsApp guardado'); return; } sendTracking(q); route(); };
}

function viewTrack(p, L) {
  const T = TXT[L] || TXT.en;
  const w = p.w, b = p.b;
  const last = w.up[w.up.length - 1];
  $app.innerHTML = `
    <div class="row">
      <div class="row" style="gap:12px;justify-content:flex-start">${logoBox(b, 48, 16)}
        <span class="col"><span class="display" style="font-size:17px;font-weight:700">${esc(b.n)}</span><span class="small muted">${T.track}</span></span></div>
      <button class="chip gray" id="lng" style="border:1px solid var(--glass-border);padding:8px 12px;font-size:12px;cursor:pointer;color:#fff">${L === 'en' ? 'ES' : 'EN'}</button>
    </div>
    <div class="card g" style="gap:10px;background:linear-gradient(135deg,rgba(34,211,238,0.22),rgba(167,139,250,0.24))">
      <div class="row"><span class="col"><span class="small muted">${T.wo} #${w.n}</span><span style="font-size:17px;font-weight:700">${esc(w.title || '—')}</span></span>
        <span class="huge">${w.pct}%</span></div>
      <div class="bar"><div style="width:${w.pct}%"></div></div>
      <span class="small muted">${esc(w.client)}${w.job ? ' · ' + esc(w.job) : ''}</span>
      ${last ? `<span class="small">${T.lastUpd}: ${fullDate(last[0], L)}</span>` : ''}
    </div>
    <div class="card g" style="gap:2px"><span class="label v" style="margin-bottom:6px">${T.progress}</span>${stageList(w.st, L, false)}</div>
    <div class="card g"><span class="label">${T.updates}</span>
      ${[...w.up].reverse().map((u) => `<div class="col"><span style="font-size:14px;line-height:1.45">${esc(trStage(u[1], L))}</span><span class="small muted">${fullDate(u[0], L)} · ${u[2]}%</span></div>`).join('<div class="sep"></div>')}
    </div>
    ${b.p ? `<a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/${usPhone(b.p)}?text=${encodeURIComponent((L === 'es' ? 'Hola, sobre la orden de trabajo #' : 'Hi, about work order #') + w.n)}">${I.whatsapp} ${T.contact}</a>` : ''}
    <p class="small muted" style="text-align:center">${T.sent}</p>`;
  lng.onclick = () => { pubLang = L === 'en' ? 'es' : 'en'; route(); };
}

/* ---------- Empleados ---------- */
const PAY_TYPES = [['job', 'Por trabajo'], ['day', 'Por día'], ['hour', 'Por hora']];
const PAY_METHODS = ['Efectivo', 'Transferencia', 'Zelle', 'Cash App', 'Venmo', 'Cheque', 'Otro'];
const payTypeLabel = (t) => (PAY_TYPES.find((x) => x[0] === t) || PAY_TYPES[0])[1];
const rateText = (e) => e.rate ? `${S.money(e.rate)} · ${payTypeLabel(e.payType).toLowerCase()}` : payTypeLabel(e.payType);

function empStats(empId) {
  let jobs = 0, paid = 0, pending = 0, active = 0;
  for (const q of S.quotes()) {
    const c = q.wo?.crew?.find((x) => x.empId === empId);
    if (!c) continue;
    jobs++;
    if (q.wo.progress < 100) active++;
    const l = q.payroll?.lines.find((x) => x.empId === empId);
    if (l?.paid) paid += l.amount; else pending += Number(c.amount) || 0;
  }
  return { jobs, paid, pending, active };
}

let empFilter = 'active';
function viewEmployees() {
  setTabs(null);
  const all = S.employees();
  const list = all.filter((e) => (empFilter === 'active' ? e.active !== false : empFilter === 'inactive' ? e.active === false : true));
  const pill = (k, label) => `<button class="pill" data-f="${k}" aria-pressed="${empFilter === k}">${label}</button>`;
  $app.innerHTML = `
    ${topbar('Empleados', '#/home', `<a class="icon-btn primary" href="#/employee/new" aria-label="Agregar empleado">${I.plus}</a>`)}
    <div class="pills">${pill('active', 'Activos · ' + all.filter((e) => e.active !== false).length)}${pill('inactive', 'Inactivos')}${pill('all', 'Todos')}</div>
    <div class="list">${list.length ? list.map((e) => {
      const st = empStats(e.id);
      return `<a class="item g" href="#/employee/${e.id}">
        <span class="avatar" style="background:${colorFor(e.name)}">${esc(initials(e.name))}</span>
        <span class="col" style="flex-grow:1"><span style="font-size:15px;font-weight:600" data-noi18n>${esc(e.name)}</span>
          <span class="small muted"><span data-noi18n>${esc(e.role || '')}${e.role ? ' · ' : ''}</span><span>${rateText(e)}</span></span></span>
        <span class="col" style="align-items:flex-end;gap:4px">${st.active ? `<span class="chip cyan">${st.active} en obra</span>` : ''}${st.pending ? `<span class="chip orange">Por pagar ${S.money(st.pending)}</span>` : ''}</span></a>`;
    }).join('') : `<div class="empty g card"><span>Todavía no tienes empleados.</span><br><span>Agrégalos para asignarles órdenes de trabajo y hacerles su planilla de pago.</span></div>`}</div>
    <a class="btn primary" href="#/employee/new">${I.plus} Agregar empleado</a>
    <a class="btn secondary" href="#/payrolls">${I.file} Planillas de pago</a>`;
  $app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { empFilter = b.dataset.f; route(); });
}

function viewEmployee(id) {
  setTabs(null);
  const isNew = id === 'new';
  const e = isNew ? { name: '', phone: '', role: '', payType: 'job', rate: '', active: true, notes: '' } : S.getEmployee(id);
  if (!e) return go('#/employees');
  const st = isNew ? null : empStats(e.id);
  const jobs = isNew ? [] : S.quotes().filter((q) => q.wo?.crew?.some((c) => c.empId === e.id));
  $app.innerHTML = `
    ${topbar(isNew ? 'Nuevo empleado' : e.name, '#/employees')}
    ${st ? `<div class="grid2">
      <div class="card g"><span class="small muted">Pagado</span><span class="big">${S.money(st.paid)}</span><span class="small muted">${st.jobs} trabajos</span></div>
      <div class="card g"><span class="small muted">Por pagar</span><span class="big" style="color:${st.pending ? 'var(--orange-soft)' : '#fff'}">${S.money(st.pending)}</span><span class="small muted">${st.active} en obra</span></div>
    </div>` : ''}
    <form class="card g" id="ef">
      <div class="field"><label for="en">Nombre completo *</label><input id="en" required value="${esc(e.name)}" placeholder="Ej. José Hernández"></div>
      <div class="grid2">
        <div class="field"><label for="ep">WhatsApp / teléfono</label><input id="ep" type="tel" value="${esc(e.phone)}" placeholder="(713) 555-0100"></div>
        <div class="field"><label for="er">Oficio / puesto</label><input id="er" value="${esc(e.role)}" placeholder="Ej. Pintor"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="et">Forma de pago</label><select id="et">${PAY_TYPES.map(([k, l]) => `<option value="${k}" ${k === e.payType ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="erate">Tarifa ($)</label><input id="erate" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(e.rate)}" placeholder="Opcional"></div>
      </div>
      <div class="field"><label for="enotes">Notas</label><textarea id="enotes" rows="2" style="min-height:70px" placeholder="Opcional">${esc(e.notes || '')}</textarea></div>
      <label class="row g" style="min-height:52px;border-radius:14px;padding:0 14px;cursor:pointer"><span style="font-size:14px">Empleado activo</span><input id="eact" type="checkbox" ${e.active !== false ? 'checked' : ''}></label>
      <button class="btn primary" type="submit">${isNew ? 'Guardar empleado' : 'Guardar cambios'}</button>
    </form>
    ${isNew ? '' : `
      ${e.phone ? `<a class="btn secondary" target="_blank" rel="noopener" href="https://wa.me/${usPhone(e.phone)}">${I.whatsapp} WhatsApp</a>` : ''}
      <h2>Trabajos asignados</h2>
      <div class="list">${jobs.length ? jobs.map((q) => {
        const c = q.wo.crew.find((x) => x.empId === e.id);
        const l = q.payroll?.lines.find((x) => x.empId === e.id);
        return `<a class="item g" href="#/wo/${q.id}"><span class="col" style="flex-grow:1"><span style="font-size:15px;font-weight:600" data-noi18n>${esc(q.title || 'Trabajo')}</span>
          <span class="small muted"><span>Orden de trabajo #${q.wo.number}</span><span data-noi18n> · ${esc(clientName(q))}</span></span></span>
          <span class="col" style="align-items:flex-end;gap:4px"><span style="font-weight:700">${S.money(c.amount)}</span>${l?.paid ? '<span class="chip green">Pagado</span>' : q.wo.progress >= 100 ? '<span class="chip orange">Por pagar</span>' : `<span class="chip cyan">En obra · ${q.wo.progress}%</span>`}</span></a>`;
      }).join('') : '<div class="empty g card">Sin trabajos asignados todavía.</div>'}</div>`}`;
  ef.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!en.value.trim()) { toast('Escribe el nombre del empleado'); return; }
    const saved = S.upsertEmployee({ ...(isNew ? {} : { id: e.id }), name: en.value.trim(), phone: ep.value.trim(), role: er.value.trim(), payType: et.value, rate: erate.value ? Number(erate.value) : '', notes: enotes.value.trim(), active: eact.checked });
    toast('Empleado guardado');
    go(isNew ? '#/employees' : '#/employee/' + saved.id);
  });
}

/* ---------- Equipo en la orden de trabajo ---------- */
function crewCardHTML(q) {
  const crew = q.wo.crew || [];
  const avail = S.employees().filter((e) => e.active !== false && !crew.some((c) => c.empId === e.id));
  const labor = S.laborCost(q);
  const sub = S.totals(q).subtotal;
  return `<div class="card g" id="crew">
    <div class="row"><span class="label">Empleados asignados</span>${crew.length ? `<span class="small muted">${crew.length}</span>` : ''}</div>
    ${crew.length ? crew.map((c) => {
      const e = S.getEmployee(c.empId) || { name: '?' };
      const paid = q.payroll?.lines.find((l) => l.empId === c.empId)?.paid;
      return `<div class="line" style="gap:10px">
        <div class="row" style="justify-content:flex-start;gap:12px">
          <span class="avatar" style="width:38px;height:38px;font-size:13px;background:${colorFor(e.name)}">${esc(initials(e.name))}</span>
          <span class="col" style="flex-grow:1"><span style="font-weight:600" data-noi18n>${esc(e.name)}</span><span class="small muted" data-noi18n>${esc(e.role || '')}</span></span>
          ${e.phone ? `<button type="button" class="icon-btn" data-wa-emp="${c.empId}" aria-label="Enviar orden al empleado" style="width:40px;height:40px">${I.whatsapp}</button>` : ''}
          ${paid ? '' : `<button type="button" class="icon-btn" data-unassign="${c.empId}" aria-label="Quitar empleado" style="width:40px;height:40px">${I.trash}</button>`}
        </div>
        <div class="row" style="gap:10px">
          <label class="small muted" for="amt_${c.empId}" style="flex-shrink:0">Monto a pagar</label>
          <div class="prefix" style="flex-grow:1"><span>$</span><input id="amt_${c.empId}" data-amt="${c.empId}" type="number" min="0" step="0.01" inputmode="decimal" value="${c.amount || ''}" placeholder="0" ${paid ? 'disabled' : ''} style="min-height:44px"></div>
        </div>
        ${paid ? '<span class="chip green" style="align-self:flex-start">Pagado</span>' : ''}
      </div>`;
    }).join('') : '<span class="small muted">Asigna uno o varios empleados para realizar esta orden.</span>'}
    ${avail.length ? `<div class="row" style="gap:10px;align-items:flex-end">
        <div class="field" style="flex:1.4"><label for="addemp" class="small muted">Empleado</label><select id="addemp"><option value="">Elegir…</option>${avail.map((e) => `<option value="${e.id}" data-rate="${e.payType === 'job' && e.rate ? e.rate : ''}">${esc(e.name)}${e.role ? ' · ' + esc(e.role) : ''}</option>`).join('')}</select></div>
        <div class="field" style="flex:1"><label for="addamt" class="small muted">Monto ($)</label><input id="addamt" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Opcional"></div>
      </div>
      <button type="button" class="btn secondary" id="doassign">${I.plus} Asignar empleado</button>`
    : `<a class="btn secondary" href="#/employee/new">${I.plus} ${S.employees().length ? 'Agregar otro empleado' : 'Agregar empleados'}</a>`}
    ${crew.length ? `<div class="sep"></div>
      <div class="row small muted" style="font-size:13px"><span>Mano de obra (empleados)</span><span>${S.money(labor)}</span></div>
      <div class="row" style="font-size:14px"><span>Ganancia estimada <span class="small muted">(antes de materiales)</span></span><span style="font-weight:700;color:${sub - labor >= 0 ? 'var(--green-soft)' : 'var(--orange-soft)'}">${S.money(sub - labor)}</span></div>` : ''}
    ${q.payroll ? `<a class="btn green" href="#/payroll/${q.id}">${I.card} Planilla de pago #${q.payroll.number}</a>`
      : crew.length && q.wo.progress >= 100 ? `<button type="button" class="btn green" id="mkpay">${I.card} Crear planilla de pago</button>`
      : crew.length ? '<span class="small muted">La planilla de pago se crea sola cuando marques el trabajo como terminado.</span>' : ''}
  </div>`;
}

function bindCrew(q) {
  const box = $app.querySelector('#crew');
  if (!box) return;
  const sel = box.querySelector('#addemp');
  if (sel) sel.onchange = () => { const r = sel.selectedOptions[0]?.dataset.rate; if (r) box.querySelector('#addamt').value = r; };
  const da = box.querySelector('#doassign');
  if (da) da.onclick = () => {
    if (!sel.value) { toast('Elige un empleado'); return; }
    S.assignEmployee(q.id, sel.value, box.querySelector('#addamt').value);
    toast('Empleado asignado');
    route();
  };
  box.addEventListener('change', (ev) => {
    const inp = ev.target.closest('[data-amt]');
    if (inp) { S.updateAssignment(q.id, inp.dataset.amt, { amount: Number(inp.value) || 0 }); route(); }
  });
  box.addEventListener('click', (ev) => {
    const un = ev.target.closest('[data-unassign]');
    if (un) { if (confirmT('¿Quitar este empleado de la orden?')) { S.unassignEmployee(q.id, un.dataset.unassign); route(); } return; }
    const wa = ev.target.closest('[data-wa-emp]');
    if (wa) {
      const e = S.getEmployee(wa.dataset.waEmp);
      const c = q.wo.crew.find((x) => x.empId === e.id);
      const cl = S.getClient(q.clientId);
      const en = UI() === 'en';
      const lines = en
        ? [`Hi ${e.name.split(' ')[0]}, you're assigned to work order #${q.wo.number}.`, `Job: ${q.title || '-'}`, `Address: ${q.jobAddress || cl?.address || '-'}`,
           q.startDate ? `Start: ${fullDate(q.startDate, 'en')}` : '', q.duration ? `Duration: ${q.duration}` : '', q.scope ? `Scope: ${q.scope}` : '', c.amount ? `Your pay: ${S.money(c.amount)}` : '']
        : [`Hola ${e.name.split(' ')[0]}, te asigné la orden de trabajo #${q.wo.number}.`, `Trabajo: ${q.title || '-'}`, `Dirección: ${q.jobAddress || cl?.address || '-'}`,
           q.startDate ? `Inicio: ${fullDate(q.startDate, 'es')}` : '', q.duration ? `Duración: ${q.duration}` : '', q.scope ? `Alcance: ${q.scope}` : '', c.amount ? `Tu pago: ${S.money(c.amount)}` : ''];
      window.open(`https://wa.me/${usPhone(e.phone)}?text=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`, '_blank');
      S.updateQuote(q.id, {}, `Orden enviada a ${e.name}`);
    }
  });
  const mk = box.querySelector('#mkpay');
  if (mk) mk.onclick = () => { S.createPayroll(q.id); toast('Planilla de pago creada'); go('#/payroll/' + q.id); };
}

/* ---------- Planillas de pago ---------- */
function viewPayroll(id) {
  const q = S.getQuote(id);
  if (!q?.payroll) return go(q ? '#/wo/' + id : '#/payrolls');
  setTabs(null);
  const p = q.payroll;
  const t = S.payrollTotals(p);
  const pct = t.total ? Math.round((t.paid / t.total) * 100) : 0;
  $app.innerHTML = `
    ${topbar('Planilla de pago #' + p.number, '#/wo/' + q.id)}
    <div class="card g" style="gap:10px">
      <div class="row"><span class="col"><span style="font-size:16px;font-weight:700" data-noi18n>${esc(q.title || 'Trabajo')}</span>
        <span class="small muted"><span>Orden de trabajo #${q.wo.number}</span><span data-noi18n> · ${esc(clientName(q))}</span></span></span>
        ${t.pending <= 0 ? '<span class="chip green">Pagada</span>' : '<span class="chip orange">Pendiente</span>'}</div>
      <div class="col"><span class="small muted">${t.pending > 0 ? 'Pendiente de pagar' : 'Planilla pagada'}</span><span class="huge">${S.money(t.pending > 0 ? t.pending : t.total)}</span></div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="row small muted"><span>Pagado ${S.money(t.paid)}</span><span>Total ${S.money(t.total)}</span></div>
      <span class="small muted">Creada ${fullDate(p.createdAt, UI())}</span>
    </div>
    <div class="list">${p.lines.map((l) => `
      <div class="card g" style="gap:10px">
        <div class="row" style="justify-content:flex-start;gap:12px">
          <span class="avatar" style="width:42px;height:42px;background:${colorFor(l.name)}">${esc(initials(l.name))}</span>
          <span class="col" style="flex-grow:1"><span style="font-weight:600" data-noi18n>${esc(l.name)}</span><span class="small muted" data-noi18n>${esc(l.role || '')}</span></span>
          <span class="col" style="align-items:flex-end;gap:4px"><span class="big" style="font-size:20px">${S.money(l.amount)}</span>${l.paid ? '<span class="chip green">Pagado</span>' : '<span class="chip orange">Por pagar</span>'}</span>
        </div>
        ${l.paid ? `<span class="small muted"><span>Recibo #${l.receipt}</span> · <span>${fullDate(l.paidAt, UI())}</span> · <span>${esc(l.method)}</span></span>
          <button class="btn secondary" data-receipt="${l.empId}">${I.print} Recibo de pago (PDF)</button>`
        : `<div class="row" style="gap:10px;align-items:flex-end">
            <div class="field" style="flex:1"><label for="m_${l.empId}" class="small muted">Forma de pago</label><select id="m_${l.empId}">${PAY_METHODS.map((m) => `<option>${m}</option>`).join('')}</select></div>
            <button class="btn green" data-pay="${l.empId}" style="flex:1;min-height:50px">${I.check} Pagar</button>
          </div>`}
      </div>`).join('')}</div>
    ${t.pending > 0 && p.lines.filter((l) => !l.paid).length > 1 ? `<button class="btn primary" id="payall">${I.check} Pagar a todos (${S.money(t.pending)})</button>` : ''}
    <a class="btn secondary" href="#/wo/${q.id}">${I.tool} Ver orden de trabajo</a>`;
  const payOne = (empId, method) => {
    const l = S.payPayrollLine(q.id, empId, method);
    return l;
  };
  $app.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => {
    const empId = b.dataset.pay;
    const m = $app.querySelector('#m_' + empId).value;
    const l = payOne(empId, m);
    if (!l) return;
    toast('Pago registrado. Genera el recibo.');
    route();
  });
  const pa = $app.querySelector('#payall');
  if (pa) pa.onclick = () => {
    if (!confirmT('¿Registrar el pago a todos los empleados pendientes?')) return;
    p.lines.filter((l) => !l.paid).forEach((l) => payOne(l.empId, $app.querySelector('#m_' + l.empId)?.value || 'Efectivo'));
    toast('Planilla pagada');
    route();
  };
  $app.querySelectorAll('[data-receipt]').forEach((b) => b.onclick = async () => {
    const l = p.lines.find((x) => x.empId === b.dataset.receipt);
    const en = UI() === 'en';
    const msg = en ? `Payment receipt #${l.receipt} – ${S.money(l.amount)} – ${S.settings().bizName}` : `Recibo de pago #${l.receipt} – ${S.money(l.amount)} – ${S.settings().bizName}`;
    const label = b.innerHTML;
    b.disabled = true; b.textContent = UI() === 'en' ? 'Creating PDF…' : 'Generando PDF…';
    try {
      const r = await shareReceiptPdf(q, l, msg);
      if (r !== 'cancelled') toast(r === 'shared' ? 'Recibo enviado' : 'PDF descargado: envíalo por WhatsApp');
    } catch (e) { toast('No se pudo crear el PDF'); }
    b.disabled = false; b.innerHTML = label;
  });
}

let payFilter = 'pending';
function viewPayrolls() {
  setTabs(null);
  const all = S.quotes().filter((q) => q.payroll);
  const list = all.filter((q) => { const t = S.payrollTotals(q.payroll); return payFilter === 'pending' ? t.pending > 0 : payFilter === 'paid' ? t.pending <= 0 : true; });
  const pend = all.reduce((s, q) => s + S.payrollTotals(q.payroll).pending, 0);
  const pill = (k, label) => `<button class="pill" data-f="${k}" aria-pressed="${payFilter === k}">${label}</button>`;
  $app.innerHTML = `
    ${topbar('Planillas de pago', '#/employees')}
    <div class="card g"><span class="small muted">Total pendiente de pagar a empleados</span><span class="big" style="color:${pend ? 'var(--orange-soft)' : '#fff'}">${S.money(pend)}</span></div>
    <div class="pills">${pill('pending', 'Pendientes')}${pill('paid', 'Pagadas')}${pill('all', 'Todas')}</div>
    <div class="list">${list.length ? list.map((q) => {
      const t = S.payrollTotals(q.payroll);
      return `<a class="item g" href="#/payroll/${q.id}"><span class="col" style="flex-grow:1">
        <span style="font-size:15px;font-weight:600"><span>Planilla #${q.payroll.number}</span><span data-noi18n> · ${esc(q.title || '')}</span></span>
        <span class="small muted"><span>Orden de trabajo #${q.wo.number}</span><span data-noi18n> · ${esc(q.payroll.lines.map((l) => l.name.split(' ')[0]).join(', '))}</span></span></span>
        <span class="col" style="align-items:flex-end;gap:4px"><span style="font-weight:700">${S.money(t.total)}</span>${t.pending > 0 ? `<span class="chip orange">Pendiente ${S.money(t.pending)}</span>` : '<span class="chip green">Pagada</span>'}</span></a>`;
    }).join('') : '<div class="empty g card">No hay planillas aquí. Se crean al terminar una orden de trabajo con empleados asignados.</div>'}</div>`;
  $app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { payFilter = b.dataset.f; route(); });
}

/* ---------- Obras y cotizaciones ---------- */
let worksFilter = 'active';
function viewWorks() {
  setTabs('works');
  const all = S.quotes();
  const f = {
    active: (q) => q.wo && q.status !== 'paid',
    quotes: (q) => !q.wo && !['invoiced', 'paid'].includes(q.status),
    paid: (q) => q.status === 'paid',
    all: () => true
  }[worksFilter];
  const list = all.filter(f);
  const n = (k) => all.filter({ active: (q) => q.wo && q.status !== 'paid', quotes: (q) => !q.wo && !['invoiced', 'paid'].includes(q.status) }[k]).length;
  const pill = (k, label) => `<button class="pill" data-f="${k}" aria-pressed="${worksFilter === k}">${label}</button>`;
  $app.innerHTML = `
    <h1>Obras y cotizaciones</h1>
    <div class="pills">${pill('active', 'En obra · ' + n('active'))}${pill('quotes', 'Cotizaciones · ' + n('quotes'))}${pill('paid', 'Pagadas')}${pill('all', 'Todas')}</div>
    <div class="list">${list.length ? list.map((q) => quoteRow(q)).join('') : `<div class="empty g card">${worksFilter === 'active' ? 'No hay obras activas. Cuando un cliente apruebe una cotización, aquí aparece su orden de trabajo.' : 'Nada por aquí todavía.'}</div>`}</div>`;
  $app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { worksFilter = b.dataset.f; route(); });
}

/* ---------- Vista pública (cliente) ---------- */
let pubLang = null;
let pubApproved = '';
function viewPublic(data, print) {
  setTabs(null);
  const p = S.decodeShare(data);
  if (!p) { $app.innerHTML = '<div class="empty g card">Este link no es válido o está incompleto.</div>'; return; }
  const L = pubLang || p.lang || p.q?.lang || 'en';
  const T = TXT[L] || TXT.en;
  document.documentElement.lang = L;
  if (p.kind === 'track') return viewTrack(p, L);
  if (p.kind === 'profile') {
    $app.innerHTML = `<div class="row" style="justify-content:flex-end"><button class="chip gray" id="lng" style="border:1px solid var(--glass-border);padding:8px 12px;font-size:12px;cursor:pointer;color:#fff">${L === 'en' ? 'ES' : 'EN'}</button></div>${profileHTML(p.b, L, true)}`;
    lng.onclick = () => { pubLang = L === 'en' ? 'es' : 'en'; route(); };
    return;
  }
  const q = p.q;
  const inv = p.kind === 'invoice';
  const t = S.totals({ items: q.items, taxRate: q.tax, depositPct: q.dep, payments: q.paid ? [{ amount: q.paid }] : [] });
  const base = p.base || appBase();
  const confirmUrl = `${base}#/ok/${q.id}/${encodeURIComponent(pubApproved)}`;
  const confirmMsg = L === 'es'
    ? `✅ Apruebo la cotización #${q.n} de ${S.money(t.total)}. Firma: ${pubApproved}. Crear orden de trabajo: ${confirmUrl}`
    : `✅ I approve estimate #${q.n} for ${S.money(t.total)}. Signed: ${pubApproved}. Create work order: ${confirmUrl}`;
  $app.innerHTML = `
    <div class="row no-print" style="justify-content:flex-end"><button class="chip gray" id="lng" style="border:1px solid var(--glass-border);padding:8px 12px;font-size:12px;cursor:pointer;color:#fff">${L === 'en' ? 'Ver en español' : 'View in English'}</button></div>
    ${docHTML(p, L)}
    <div class="no-print list">
    ${inv ? (q.pay && t.balance > 0 ? `<a class="btn green" href="${esc(q.pay)}" target="_blank" rel="noopener">${I.card} ${T.pay} · ${S.money(t.balance)}</a>` : '')
    : q.wo ? `<div class="card g" style="background:rgba(110,231,183,0.14)"><span style="font-weight:700;display:flex;gap:8px;align-items:center">${I.check} ${T.approved}</span><span class="small muted">${T.wo} #${q.wo}</span></div>`
    : pubApproved ? `
      <div class="card g" style="background:rgba(110,231,183,0.14)"><span style="font-weight:700;display:flex;gap:8px;align-items:center">${I.check} ${T.approved}</span>
        <span class="sig" style="font-size:24px">${esc(pubApproved)}</span><span class="small muted">${T.confirmNote}</span></div>
      ${p.b.p ? `<a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/${usPhone(p.b.p)}?text=${encodeURIComponent(confirmMsg)}">${I.whatsapp} ${T.confirm}</a>` : ''}
      ${q.pay && q.dep ? `<a class="btn green" href="${esc(q.pay)}" target="_blank" rel="noopener">${I.card} ${T.payDep} · ${S.money(t.deposit)}</a>` : ''}`
    : `<div class="card g"><span class="label">${T.accept}</span><label for="sig" class="small muted">${T.sign}</label>
        <input id="sig" class="sig" autocomplete="name" placeholder="${esc(q.client || 'Your name')}">
        <span class="small muted">${T.signNote}</span></div>
      <button class="btn primary" id="appr">${I.check} ${T.approve}</button>`}
    </div>
    <p class="small muted" style="text-align:center">${T.sent}</p>`;
  lng.onclick = () => { pubLang = L === 'en' ? 'es' : 'en'; route(); };
  const ap = $app.querySelector('#appr');
  if (ap) ap.onclick = () => {
    const v = sig.value.trim();
    if (v.length < 3) { toast(T.needName); sig.focus(); return; }
    pubApproved = v;
    route();
  };
  if (print) setTimeout(() => window.print(), 400);
}

/* ---------- Router ---------- */
let lastHash = '';
let route = function () {
  const h = location.hash || '';
  const [, page = '', arg = '', extra = ''] = h.split('/');
  const db = S.getDB();
  if (h !== lastHash && !h.startsWith('#/c/')) { pubLang = null; pubApproved = ''; }
  if (h !== lastHash) window.scrollTo(0, 0);
  lastHash = h;
  if (page === 'c' && arg) return viewPublic(arg, extra === 'print');
  if (page === 'ok' && db.onboarded) return viewApprove(arg, extra);
  if (!db.onboarded) {
    if (page === 'register') return viewRegister();
    return viewWelcome();
  }
  switch (page) {
    case 'new': return viewNew();
    case 'q': case 'doc': return viewDoc(arg);
    case 'quote-form': return viewQuoteForm(arg, extra);
    case 'wo': return viewWorkOrder(arg);
    case 'works': case 'invoices': return viewWorks();
    case 'profile': return viewProfile();
    case 'employees': return viewEmployees();
    case 'employee': return viewEmployee(arg);
    case 'payroll': return viewPayroll(arg);
    case 'payrolls': return viewPayrolls();
    case 'invoice': return viewInvoice(arg);
    case 'clients': return viewClients();
    case 'client': return viewClient(arg);
    case 'settings': return viewSettings();
    default: return viewHome();
  }
}

// Cada render usa un nodo nuevo para no acumular listeners de la pantalla anterior.
function freshApp() {
  const cur = document.getElementById('app') || $app;
  const n = cur.cloneNode(false);
  cur.replaceWith(n);
  $app = n;
}
const _route = route;
let routing = false;
route = function () {
  if (routing) { setTimeout(route, 0); return; }
  routing = true;
  try {
    freshApp();
    _route();
  } finally {
    routing = false;
  }
  const pub = (location.hash || '').startsWith('#/c/');
  document.documentElement.lang = pub ? document.documentElement.lang : UI();
  if (!pub && UI() === 'en') { translateDOM($app); translateDOM($tab); }
};
window.addEventListener('hashchange', () => route());
watch(() => UI() === 'en' && !(location.hash || '').startsWith('#/c/'));
route();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
