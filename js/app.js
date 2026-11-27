// CotizaPro — app principal (router + pantallas)
import * as S from './store.js';
import { parseDictation } from './parser.js';
import { I } from './icons.js';

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

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
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
const chip = (q) => { const [t, c] = STATUS[statusOf(q)] || STATUS.draft; return `<span class="chip ${c}">${t}</span>`; };

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
    t('new', '#/new', 'Nueva cotización', I.plus, 'add') +
    t('invoices', '#/invoices', 'Facturas', I.file) +
    t('settings', '#/settings', 'Ajustes', I.gear);
}

const clientName = (q) => S.getClient(q.clientId)?.name || 'Sin cliente';

function quoteRow(q, href) {
  const t = S.totals(q);
  const amount = ['invoiced', 'approved'].includes(q.status) && t.paid ? t.balance : t.total;
  return `<a class="item g" href="${href || '#/q/' + q.id}">
    <div class="col" style="flex-grow:1">
      <span style="font-size:15px;font-weight:600">${esc(clientName(q))}</span>
      <span class="small muted">${esc(q.title || 'Cotización')} · #${q.number}</span>
    </div>
    <div class="col" style="align-items:flex-end;gap:5px">
      <span style="font-size:15px;font-weight:700">${S.money(amount)}</span>${chip(q)}
    </div></a>`;
}

/* ---------- Link para el cliente ---------- */
function sharePayload(q, kind) {
  const s = S.settings();
  const c = S.getClient(q.clientId);
  const t = S.totals(q);
  return {
    v: 1,
    kind, // estimate | invoice
    b: { n: s.bizName, p: s.phone, e: s.email, st: s.state, logo: s.logo && s.logo.length < 24000 ? s.logo : '' },
    q: {
      n: q.number, title: q.title, client: c?.name || '', addr: c?.address || '',
      items: q.items.map((i) => ({ en: i.en, es: i.es, note: i.note, qty: Number(i.qty), price: Number(i.price) })),
      tax: Number(q.taxRate), dep: Number(q.depositPct), valid: q.validUntil, created: q.createdAt,
      paid: t.paid, due: q.dueDate || null, terms: s.terms, pay: s.paymentLink, lang: s.clientLang
    }
  };
}
function shareUrl(q, kind = 'estimate') {
  const base = location.href.split('#')[0];
  return `${base}#/c/${S.encodeShare(sharePayload(q, kind))}`;
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
      try { await navigator.clipboard.writeText(shareUrl(q, kind)); toast('Link copiado'); mark(); } catch (err) { prompt('Copia este link:', shareUrl(q, kind)); mark(); }
    }
    close();
    route();
  });
}

/* ================= PANTALLAS ================= */

function viewWelcome() {
  setTabs(null);
  $app.innerHTML = `
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
        <div class="grid2">
          <div class="field"><label for="st">Estado</label><input id="st" placeholder="Ej. Texas" value="${esc(s.state)}"></div>
          <div class="field"><label for="ph">Teléfono</label><input id="ph" type="tel" placeholder="(555) 000-0000" value="${esc(s.phone)}"></div>
        </div>
        <div class="field"><label for="em">Correo</label><input id="em" type="email" placeholder="tu@correo.com" value="${esc(s.email)}"></div>
        <button class="btn primary" type="submit" style="margin-top:8px">Continuar</button>
      </form>`;
    $app.querySelectorAll('[data-trade]').forEach((b) => b.addEventListener('click', () => {
      regTrade = b.dataset.trade;
      $app.querySelectorAll('[data-trade]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    $app.querySelector('#f').addEventListener('submit', (e) => {
      e.preventDefault();
      S.updateSettings({ bizName: biz.value.trim(), trade: regTrade, state: st.value.trim(), phone: ph.value.trim(), email: em.value.trim() });
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
  const month = now.toLocaleDateString('es-US', { month: 'short' });
  $app.innerHTML = `
    <div class="row">
      <div class="col"><span class="muted" style="font-size:14px">Hola</span><span class="display" style="font-size:24px;font-weight:700">${esc(s.bizName || 'Mi negocio')}</span></div>
      <a class="icon-btn" href="#/settings" aria-label="Ajustes del negocio" style="overflow:hidden;font-family:'Space Grotesk';font-weight:700">${s.logo ? `<img class="logo-img" src="${esc(s.logo)}" alt="">` : initials(s.bizName)}</a>
    </div>
    <div class="grid2">
      <div class="card g"><span class="small muted">Por cobrar</span><span class="big">${S.money(owed)}</span><span class="small" style="color:var(--orange)">${owedN} pendiente${owedN === 1 ? '' : 's'}</span></div>
      <div class="card g"><span class="small muted">Cobrado en ${month}</span><span class="big">${S.money(paidMonth)}</span><span class="small" style="color:var(--green)">${qs.filter((q) => q.status === 'paid').length} pagadas</span></div>
    </div>
    <a href="#/new" class="item g" style="padding:18px;gap:14px;background:linear-gradient(135deg,rgba(34,211,238,0.30),rgba(167,139,250,0.30))">
      <span style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.92);display:flex;align-items:center;justify-content:center;flex-shrink:0">${I.mic(26, '#0A0F1F')}</span>
      <span class="col"><span class="display" style="font-size:18px;font-weight:700">Nueva cotización</span><span style="font-size:13px;color:rgba(255,255,255,0.84)">Dicta el trabajo en español</span></span>
    </a>
    <div class="row"><h2>Pendientes</h2><a href="#/invoices" style="font-size:13px">Ver todo</a></div>
    <div class="list">${pending.length ? pending.map((q) => quoteRow(q, ['approved', 'invoiced'].includes(q.status) ? '#/invoice/' + q.id : null)).join('') : `<div class="empty g card">Aún no tienes cotizaciones.<br>Toca <b>Nueva cotización</b> y dicta tu primer trabajo.</div>`}</div>`;
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
      rec.lang = 'es-US';
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
    go('#/q/' + q.id);
  });
  $app.querySelector('#manual').addEventListener('click', () => {
    const q = S.newQuote({ items: [{ en: '', es: '', note: '', qty: 1, price: 0 }] });
    go('#/q/' + q.id);
  });
}

function viewQuote(id) {
  const q = S.getQuote(id);
  if (!q) return go('#/home');
  setTabs(null);
  const t = S.totals(q);
  const cl = S.clients();
  $app.innerHTML = `
    ${topbar('Cotización #' + q.number, '#/home', `<button class="icon-btn" id="del" aria-label="Eliminar cotización">${I.trash}</button>`)}
    <div class="row">${chip(q)}<span class="small muted">Creada ${S.dateEs(q.createdAt)}</span></div>
    <div class="card g">
      <div class="field"><label for="cli">Cliente</label>
        <select id="cli"><option value="">Elegir cliente…</option>${cl.map((c) => `<option value="${c.id}" ${c.id === q.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="__new">+ Nuevo cliente</option></select></div>
      <div id="newcli" class="grid2" hidden>
        <div class="field"><label for="ncn">Nombre</label><input id="ncn" placeholder="Nombre"></div>
        <div class="field"><label for="ncp">Teléfono</label><input id="ncp" type="tel" placeholder="(555) 000-0000"></div>
      </div>
      <div class="field"><label for="ttl">Trabajo</label><input id="ttl" placeholder="Ej. Interior painting" value="${esc(q.title)}"></div>
    </div>
    ${q.transcript ? `<div class="card g"><span class="label">Lo que dijiste</span><p style="font-size:14px;line-height:1.45">“${esc(q.transcript)}”</p></div>` : ''}
    <div class="row"><span class="label v">Partidas · en inglés para el cliente</span></div>
    <div class="list" id="lines">${q.items.map((it, i) => lineHTML(it, i)).join('')}</div>
    <button class="btn secondary" id="add">${I.plus} Agregar partida</button>
    <div class="card g">
      <div class="grid2">
        <div class="field"><label for="tax">Impuesto %</label><input id="tax" type="number" step="0.01" min="0" value="${q.taxRate}"></div>
        <div class="field"><label for="dep">Anticipo %</label><input id="dep" type="number" min="0" max="100" value="${q.depositPct}"></div>
      </div>
      <div class="sep"></div>
      <div id="tot">${totalsHTML(q)}</div>
    </div>
    <div class="list no-print">
      <button class="btn primary" id="send">${I.send} Enviar al cliente</button>
      <a class="btn secondary" href="${esc(shareUrl(q))}" id="prev">${I.eye} Ver como el cliente</a>
      ${q.status === 'draft' || q.status === 'sent' ? `<button class="btn secondary" id="appr">${I.check} Marcar como aprobada</button>` : ''}
      ${['approved', 'invoiced', 'paid'].includes(q.status) ? `<a class="btn green" href="#/invoice/${q.id}">${I.card} ${q.status === 'approved' ? 'Ir a factura y cobro' : 'Ver factura'}</a>` : ''}
    </div>
    ${historyHTML(q)}`;

  const save = () => {
    const items = [...$app.querySelectorAll('.line')].map((el) => ({
      en: el.querySelector('[data-f=en]').value,
      es: el.querySelector('[data-f=es]').value,
      note: el.querySelector('[data-f=note]').value,
      qty: Number(el.querySelector('[data-f=qty]').value) || 0,
      price: Number(el.querySelector('[data-f=price]').value) || 0
    }));
    S.updateQuote(q.id, { items, title: ttl.value, taxRate: Number(tax.value) || 0, depositPct: Number(dep.value) || 0 });
    $app.querySelector('#tot').innerHTML = totalsHTML(q);
    $app.querySelector('#prev').href = shareUrl(q);
  };
  $app.addEventListener('input', (e) => { if (e.target.matches('#lines input, #ttl, #tax, #dep')) save(); });
  $app.querySelector('#lines').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    b.closest('.line').remove();
    save();
  });
  add.onclick = () => {
    $app.querySelector('#lines').insertAdjacentHTML('beforeend', lineHTML({ en: '', es: '', note: '', qty: 1, price: 0 }, q.items.length));
    save();
    $app.querySelector('#lines .line:last-child [data-f=en]').focus();
  };
  cli.onchange = () => {
    if (cli.value === '__new') { newcli.hidden = false; ncn.focus(); return; }
    newcli.hidden = true;
    S.updateQuote(q.id, { clientId: cli.value || null });
  };
  const addCli = () => {
    if (!ncn.value.trim()) return;
    const c = S.upsertClient({ name: ncn.value.trim(), phone: ncp.value.trim(), email: '', address: '' });
    S.updateQuote(q.id, { clientId: c.id });
  };
  ncn.onchange = addCli;
  ncp.onchange = () => { const c = S.getClient(q.clientId); if (c && c.name === ncn.value.trim()) S.upsertClient({ id: c.id, phone: ncp.value.trim() }); else addCli(); };
  del.onclick = () => { if (confirm('¿Eliminar esta cotización?')) { S.deleteQuote(q.id); go('#/home'); } };
  send.onclick = () => {
    save();
    if (!q.clientId) { toast('Elige un cliente primero'); cli.focus(); return; }
    if (!q.items.length || t.total === 0 && S.totals(q).total === 0) { toast('Agrega precios a las partidas'); return; }
    openShare(q, 'estimate');
  };
  const ap = $app.querySelector('#appr');
  if (ap) ap.onclick = () => {
    const name = prompt('Nombre de quien aprobó (firma):', S.getClient(q.clientId)?.name || '');
    if (name === null) return;
    S.updateQuote(q.id, { status: 'approved', signature: name, approvedAt: Date.now() }, `Aprobada y firmada${name ? ' por ' + name : ''}`);
    toast('Cotización aprobada');
    go('#/invoice/' + q.id);
  };
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

function viewInvoice(id) {
  const q = S.getQuote(id);
  if (!q) return go('#/home');
  setTabs(null);
  if (q.status === 'approved' && !q.invoicedAt) {
    // Al aprobar, la cotización pasa a ser factura con vencimiento a 7 días
    S.updateQuote(q.id, { invoicedAt: Date.now(), dueDate: Date.now() + 7 * 86400000 }, 'Factura creada');
  }
  const t = S.totals(q);
  const pct = t.total ? Math.min(100, Math.round((t.paid / t.total) * 100)) : 0;
  const c = S.getClient(q.clientId);
  const suggested = t.paid === 0 && t.deposit ? t.deposit : t.balance;
  $app.innerHTML = `
    ${topbar('Factura #' + q.number, '#/invoices', `<a class="icon-btn" href="#/q/${q.id}" aria-label="Editar cotización">${I.pen}</a>`)}
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
      <a class="btn secondary" href="${esc(shareUrl(q, 'invoice'))}/print">${I.print} Descargar PDF</a>
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

let invFilter = 'open';
function viewInvoices() {
  setTabs('invoices');
  const all = S.quotes();
  const f = {
    open: (q) => q.status !== 'paid',
    paid: (q) => q.status === 'paid',
    all: () => true
  }[invFilter];
  const list = all.filter(f);
  const pill = (k, label) => `<button class="pill" data-f="${k}" aria-pressed="${invFilter === k}">${label}</button>`;
  $app.innerHTML = `
    <h1>Cotizaciones y facturas</h1>
    <div class="pills">${pill('open', 'Pendientes')}${pill('paid', 'Pagadas')}${pill('all', 'Todas')}</div>
    <div class="list">${list.length ? list.map((q) => quoteRow(q, ['approved', 'invoiced', 'paid'].includes(q.status) ? '#/invoice/' + q.id : null)).join('') : '<div class="empty g card">Nada por aquí todavía.</div>'}</div>`;
  $app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { invFilter = b.dataset.f; route(); });
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
          <span class="small" style="color:${overdue ? 'var(--orange-soft)' : 'var(--muted)'}">${esc([c.address, overdue ? 'pago vencido' : bal > 0 ? 'saldo ' + S.money(bal) : open ? open + ' cotización abierta' : billed ? 'al día' : 'sin trabajos'].filter(Boolean).join(' · '))}</span></span>
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
    <h2>Trabajos</h2><div class="list">${mine.length ? mine.map((q) => quoteRow(q, ['approved', 'invoiced', 'paid'].includes(q.status) ? '#/invoice/' + q.id : null)).join('') : '<div class="empty g card">Sin trabajos todavía.</div>'}</div>`}`;
  cf.addEventListener('submit', (e) => {
    e.preventDefault();
    const saved = S.upsertClient({ ...(isNew ? {} : { id: c.id }), name: cn.value.trim(), phone: cp.value.trim(), email: ce.value.trim(), address: ca.value.trim() });
    toast('Cliente guardado');
    go(isNew ? '#/client/' + saved.id : '#/clients');
  });
  const nq = $app.querySelector('#nq');
  if (nq) nq.onclick = () => { const q = S.newQuote({ clientId: c.id, items: [{ en: '', es: '', note: '', qty: 1, price: 0 }] }); go('#/q/' + q.id); };
}

function viewSettings() {
  setTabs('settings');
  const s = S.settings();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const used = S.quotes().filter((q) => q.createdAt >= monthStart).length;
  $app.innerHTML = `
    <h1>Ajustes</h1>
    <div class="card g" style="flex-direction:row;align-items:center;gap:14px">
      <label for="logo" class="avatar" id="lp" style="width:60px;height:60px;border-radius:18px;background:var(--grad);cursor:pointer;overflow:hidden;font-family:'Space Grotesk';font-size:20px" aria-label="Cambiar logo">${s.logo ? `<img class="logo-img" src="${esc(s.logo)}" alt="">` : esc(initials(s.bizName))}</label>
      <input id="logo" type="file" accept="image/*" class="vh">
      <div class="col" style="flex-grow:1"><span style="font-size:16px;font-weight:700">${esc(s.bizName || 'Mi negocio')}</span><span class="small muted">${esc([s.state, s.phone].filter(Boolean).join(' · '))}</span></div>
    </div>
    <form id="sf" class="list">
      <div class="card g">
        <span class="label">Negocio</span>
        <div class="field"><label for="biz">Nombre</label><input id="biz" value="${esc(s.bizName)}"></div>
        <div class="grid2">
          <div class="field"><label for="st">Estado</label><input id="st" value="${esc(s.state)}"></div>
          <div class="field"><label for="ph">Teléfono</label><input id="ph" type="tel" value="${esc(s.phone)}"></div>
        </div>
        <div class="field"><label for="em">Correo</label><input id="em" type="email" value="${esc(s.email)}"></div>
      </div>
      <div class="card tight g">
        <div class="setting"><label for="tax" style="font-size:14px">Impuesto (sales tax) %</label><input id="tax" type="number" step="0.01" min="0" value="${s.taxRate}"></div>
        <div class="setting"><label for="dep" style="font-size:14px">Anticipo predeterminado %</label><input id="dep" type="number" min="0" max="100" value="${s.depositPct}"></div>
        <div class="setting"><label for="vd" style="font-size:14px">Validez de cotización (días)</label><input id="vd" type="number" min="1" value="${s.validDays}"></div>
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
  let lang = s.clientLang;
  $app.querySelectorAll('[data-lang]').forEach((b) => b.onclick = () => {
    lang = b.dataset.lang;
    $app.querySelectorAll('[data-lang]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  sf.addEventListener('submit', (e) => {
    e.preventDefault();
    S.updateSettings({
      bizName: biz.value.trim(), state: st.value.trim(), phone: ph.value.trim(), email: em.value.trim(),
      taxRate: Number(tax.value) || 0, depositPct: Number(dep.value) || 0, validDays: Number(vd.value) || 30,
      clientLang: lang, terms: terms.value.trim(), paymentLink: pay.value.trim(), aiEndpoint: ai.value.trim()
    });
    toast('Ajustes guardados');
    route();
  });
  exp.onclick = () => {
    const blob = new Blob([JSON.stringify(S.getDB(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cotizapro-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  reset.onclick = () => { if (confirm('Esto borra todo en este teléfono. ¿Seguro?')) { S.resetAll(); go('#/welcome'); } };
}

/* ---------- Vista pública del cliente (inglés / español) ---------- */
const TXT = {
  en: { estimate: 'Estimate', invoice: 'Invoice', valid: 'Valid until', due: 'Due', for: 'Prepared for', job: 'Job', tax: 'Tax', total: 'Total', dep: 'Deposit due to start', paid: 'Paid', bal: 'Balance due', sign: 'Sign to approve', signNote: 'By signing you accept the scope and terms of this estimate.', approve: 'Approve estimate', approved: 'Estimate approved', notify: 'Let us know on WhatsApp', payDep: 'Pay deposit', pay: 'Pay now', terms: 'Terms', sent: 'Sent with CotizaPro', needName: 'Type your name to sign', thanks: 'Thank you! Please notify us so we can schedule your job.' },
  es: { estimate: 'Cotización', invoice: 'Factura', valid: 'Válida hasta', due: 'Vence', for: 'Para', job: 'Trabajo', tax: 'Impuesto', total: 'Total', dep: 'Anticipo para empezar', paid: 'Pagado', bal: 'Saldo pendiente', sign: 'Firma para aprobar', signNote: 'Al firmar aceptas el alcance y los términos de esta cotización.', approve: 'Aprobar cotización', approved: 'Cotización aprobada', notify: 'Avisar por WhatsApp', payDep: 'Pagar anticipo', pay: 'Pagar ahora', terms: 'Términos', sent: 'Enviada con CotizaPro', needName: 'Escribe tu nombre para firmar', thanks: '¡Gracias! Avísanos para agendar tu trabajo.' }
};
let pubLang = null;
let pubApproved = '';
function viewPublic(data, print) {
  setTabs(null);
  const p = S.decodeShare(data);
  if (!p) { $app.innerHTML = '<div class="empty g card">Este link no es válido o está incompleto.</div>'; return; }
  const L = pubLang || p.q.lang || 'en';
  const T = TXT[L] || TXT.en;
  document.documentElement.lang = L;
  const q = { items: p.q.items, taxRate: p.q.tax, depositPct: p.q.dep, payments: p.q.paid ? [{ amount: p.q.paid }] : [] };
  const t = S.totals(q);
  const inv = p.kind === 'invoice';
  const date = (x) => (L === 'es' ? S.dateEs(x) : S.dateEn(x));
  const desc = (i) => (L === 'es' && i.es ? i.es : i.en || i.es);
  $app.innerHTML = `
    <div class="row">
      <div class="row" style="gap:12px;justify-content:flex-start">
        <span class="avatar g" style="width:48px;height:48px;border-radius:16px;color:#fff;overflow:hidden;font-family:'Space Grotesk';font-size:17px">${p.b.logo ? `<img class="logo-img" src="${esc(p.b.logo)}" alt="">` : esc(initials(p.b.n))}</span>
        <span class="col"><span class="display" style="font-size:17px;font-weight:700">${esc(p.b.n)}</span><span class="small muted">${esc([p.b.st, p.b.p].filter(Boolean).join(' · '))}</span></span>
      </div>
      <button class="chip gray no-print" id="lng" style="border:1px solid var(--glass-border);padding:8px 12px;font-size:12px;cursor:pointer;color:#fff">${L === 'en' ? 'ES' : 'EN'}</button>
    </div>
    <div class="card g grid2" style="display:grid">
      <div class="col"><span class="small muted">${inv ? T.invoice : T.estimate}</span><span style="font-weight:600">#${p.q.n}</span></div>
      <div class="col"><span class="small muted">${inv ? T.due : T.valid}</span><span style="font-weight:600">${date(inv ? p.q.due || Date.now() : p.q.valid)}</span></div>
      <div class="col"><span class="small muted">${T.for}</span><span style="font-weight:600">${esc(p.q.client)}</span></div>
      <div class="col"><span class="small muted">${T.job}</span><span style="font-weight:600">${esc(p.q.title || '—')}</span></div>
    </div>
    <div class="card g">
      ${p.q.items.map((i) => `<div class="row" style="align-items:flex-start;font-size:14px"><span class="col"><span>${esc(desc(i))}${i.qty !== 1 ? ` × ${i.qty}` : ''}</span>${i.note ? `<span class="small muted">${esc(i.note)}</span>` : ''}</span><span style="font-weight:600">${S.money(i.qty * i.price)}</span></div>`).join('')}
      <div class="sep"></div>
      <div class="row small muted" style="font-size:13px"><span>${T.tax} (${p.q.tax}%)</span><span>${S.money(t.tax)}</span></div>
      <div class="row"><span style="font-weight:600">${T.total}</span><span class="big">${S.money(t.total)}</span></div>
      ${inv ? `<div class="row small muted"><span>${T.paid}</span><span>${S.money(t.paid)}</span></div>
        <div class="row" style="padding:10px 12px;border-radius:14px;background:rgba(110,231,183,0.16)"><span style="font-size:13px">${T.bal}</span><span style="font-weight:700;color:var(--green-soft)">${S.money(t.balance)}</span></div>`
      : p.q.dep ? `<div class="row" style="padding:10px 12px;border-radius:14px;background:rgba(34,211,238,0.16)"><span style="font-size:13px">${T.dep} (${p.q.dep}%)</span><span style="font-weight:700;color:var(--cyan-soft)">${S.money(t.deposit)}</span></div>` : ''}
    </div>
    ${p.q.terms ? `<div class="card g"><span class="label v">${T.terms}</span><p class="small muted" style="line-height:1.5">${esc(p.q.terms)}</p></div>` : ''}
    <div class="no-print list">
    ${inv ? (p.q.pay && t.balance > 0 ? `<a class="btn green" href="${esc(p.q.pay)}" target="_blank" rel="noopener">${I.card} ${T.pay} · ${S.money(t.balance)}</a>` : '')
    : pubApproved ? `
      <div class="card g" style="background:rgba(110,231,183,0.14)"><span style="font-weight:700;display:flex;gap:8px;align-items:center">${I.check} ${T.approved}</span><span class="small muted">${T.thanks}</span></div>
      ${p.b.p ? `<a class="btn secondary" id="ntf" target="_blank" rel="noopener" href="https://wa.me/${usPhone(p.b.p)}?text=${encodeURIComponent(`${L === 'es' ? 'Apruebo la cotización' : 'I approve estimate'} #${p.q.n} – ${pubApproved}`)}">${I.whatsapp} ${T.notify}</a>` : ''}
      ${p.q.pay && p.q.dep ? `<a class="btn green" href="${esc(p.q.pay)}" target="_blank" rel="noopener">${I.card} ${T.payDep} · ${S.money(t.deposit)}</a>` : ''}`
    : `<div class="card g"><label for="sig" class="small muted">${T.sign}</label>
        <input id="sig" class="sig" autocomplete="name" placeholder="${esc(p.q.client || 'Your name')}">
        <span class="small muted">${T.signNote}</span></div>
      <button class="btn primary" id="appr">${I.check} ${T.approve}</button>`}
    </div>
    <p class="small muted" style="text-align:center">${T.sent}</p>`;
  $app.querySelector('#lng').onclick = () => { pubLang = L === 'en' ? 'es' : 'en'; route(); };
  const ap = $app.querySelector('#appr');
  if (ap) ap.onclick = () => {
    const v = sig.value.trim();
    if (!v) { toast(T.needName); sig.focus(); return; }
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
  if (!db.onboarded) {
    if (page === 'register') return viewRegister();
    return viewWelcome();
  }
  switch (page) {
    case 'new': return viewNew();
    case 'q': return viewQuote(arg);
    case 'invoice': return viewInvoice(arg);
    case 'invoices': return viewInvoices();
    case 'clients': return viewClients();
    case 'client': return viewClient(arg);
    case 'settings': return viewSettings();
    default: return viewHome();
  }
}

// Cada render usa un nodo nuevo para no acumular listeners de la pantalla anterior.
function freshApp() {
  const n = $app.cloneNode(false);
  $app.replaceWith(n);
  $app = n;
}
const _route = route;
route = function () { freshApp(); _route(); };
window.addEventListener('hashchange', () => route());
route();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
