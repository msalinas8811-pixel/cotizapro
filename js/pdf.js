// CotizaPro — factura en PDF (archivo real) para enviar al cliente por WhatsApp o correo
import * as S from './store.js';
import { countryName } from './geo.js';
import { photoDataURL } from './photos.js';

let jsPDFPromise = null;
function loadJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!jsPDFPromise) {
    jsPDFPromise = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'js/vendor/jspdf.umd.min.js';
      sc.onload = () => resolve(window.jspdf.jsPDF);
      sc.onerror = () => { jsPDFPromise = null; reject(new Error('No se pudo cargar el generador de PDF (recarga la app)')); };
      document.head.appendChild(sc);
    });
  }
  return jsPDFPromise;
}

const L10N = {
  en: { inv: 'INVOICE', no: 'Invoice #', date: 'Date', due: 'Due date', wo: 'Work order #', est: 'Estimate #', billTo: 'BILL TO', job: 'JOB', done: 'Completed',
    desc: 'Description', qty: 'Qty', price: 'Unit price', amount: 'Amount', sub: 'Subtotal', tax: 'Tax', total: 'Total', paid: 'Paid', bal: 'Balance due',
    payments: 'Payments received', pay: 'Pay online', photos: 'Before & after photos', before: 'BEFORE', after: 'AFTER', warranty: 'Warranty', terms: 'Terms', thanks: 'Thank you for your business!', stampPaid: 'PAID',
    estTitle: 'ESTIMATE', valid: 'Valid until', start: 'Start date', duration: 'Duration', scope: 'Scope of work', excl: 'Not included', dep: 'Deposit due to start',
    accept: 'Acceptance', approvedBy: 'Approved and signed by', sigCustomer: 'Customer signature', sigDate: 'Date', file: 'Estimate' },
  es: { inv: 'FACTURA', no: 'Factura #', date: 'Fecha', due: 'Vence', wo: 'Orden de trabajo #', est: 'Cotización #', billTo: 'CLIENTE', job: 'TRABAJO', done: 'Terminado',
    desc: 'Descripción', qty: 'Cant.', price: 'Precio', amount: 'Monto', sub: 'Subtotal', tax: 'Impuesto', total: 'Total', paid: 'Pagado', bal: 'Saldo pendiente',
    payments: 'Pagos recibidos', pay: 'Pagar en línea', photos: 'Fotos del antes y después', before: 'ANTES', after: 'DESPUÉS', warranty: 'Garantía', terms: 'Condiciones', thanks: '¡Gracias por su preferencia!', stampPaid: 'PAGADA',
    estTitle: 'COTIZACIÓN', valid: 'Válida hasta', start: 'Fecha de inicio', duration: 'Duración', scope: 'Alcance del trabajo', excl: 'No incluye', dep: 'Anticipo para empezar',
    accept: 'Aceptación', approvedBy: 'Aprobada y firmada por', sigCustomer: 'Firma del cliente', sigDate: 'Fecha', file: 'Cotizacion' }
};

const d = (t, L) => t ? new Date(typeof t === 'string' && t.length === 10 ? t + 'T12:00' : t).toLocaleDateString(L === 'es' ? 'es-US' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
// jsPDF con fuentes estándar no dibuja algunos símbolos: se limpian
const fileSafe = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-');
const clean = (s) => String(s ?? '').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF]/g, '');

export const buildInvoicePdf = (q) => buildDocPdf(q, 'invoice');

export async function buildDocPdf(q, kind = 'invoice') {
  const est = kind === 'estimate';
  const jsPDF = await loadJsPDF();
  const s = S.settings();
  const c = S.getClient(q.clientId) || {};
  const L = s.clientLang === 'es' ? 'es' : 'en';
  const T = L10N[L];
  const t = S.totals(q);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;
  const ink = [17, 24, 39], muted = [100, 110, 125], accent = [8, 145, 178], line = [225, 229, 236];

  // Banda superior
  doc.setFillColor(10, 15, 31); doc.rect(0, 0, W, 8, 'F');
  doc.setFillColor(103, 232, 249); doc.rect(0, 8, W / 2, 3, 'F');
  doc.setFillColor(196, 181, 253); doc.rect(W / 2, 8, W / 2, 3, 'F');

  // Logo y empresa
  let x = M;
  if (s.logo) {
    try { doc.addImage(s.logo, 'JPEG', M, y, 54, 54); x = M + 68; } catch (e) { /* sin logo */ }
  }
  doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(clean(s.bizName || ''), x, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
  const bizLines = [s.owner, [s.address, s.city, s.state, (s.country || 'US') !== 'US' ? countryName(s.country) : ''].filter(Boolean).join(', '), [s.phone, s.email].filter(Boolean).join('  |  '), s.website,
    [s.license ? (L === 'es' ? 'Licencia #' : 'License #') + s.license : '', s.insured ? (L === 'es' ? 'Asegurado' : 'Insured') : ''].filter(Boolean).join('  |  ')].filter(Boolean);
  bizLines.forEach((l, i) => doc.text(clean(l), x, y + 28 + i * 12));

  // Título
  doc.setTextColor(...accent); doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
  doc.text(clean(est ? T.estTitle : T.inv), W - M, y + 18, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...ink);
  const meta = est ? [
    [T.est, String(q.number)],
    [T.date, d(q.createdAt, L)],
    q.validUntil ? [T.valid, d(q.validUntil, L)] : null
  ].filter(Boolean) : [
    [T.no, String(q.number)],
    [T.date, d(q.invoicedAt || Date.now(), L)],
    q.dueDate && t.balance > 0 ? [T.due, d(q.dueDate, L)] : null,
    q.wo ? [T.wo, String(q.wo.number)] : null
  ].filter(Boolean);
  meta.forEach(([k, v], i) => {
    doc.setTextColor(...muted); doc.text(k, W - M - 90, y + 36 + i * 13, { align: 'right' });
    doc.setTextColor(...ink); doc.text(clean(v), W - M, y + 36 + i * 13, { align: 'right' });
  });
  y += Math.max(28 + bizLines.length * 12, 36 + meta.length * 13) + 22;

  // Cliente y trabajo
  doc.setDrawColor(...line); doc.line(M, y, W - M, y); y += 20;
  const colW = (W - 2 * M) / 2;
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent);
  doc.text(T.billTo, M, y); doc.text(T.job, M + colW, y);
  doc.setFontSize(10); doc.setTextColor(...ink);
  doc.text(clean(c.name || ''), M, y + 15);
  doc.text(clean(q.title || '-'), M + colW, y + 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
  const cl = [c.address, c.phone, c.email].filter(Boolean);
  cl.forEach((l, i) => doc.text(clean(l), M, y + 29 + i * 12));
  const jl = (est
    ? [q.jobAddress || c.address, q.startDate ? `${T.start}: ${d(q.startDate, L)}` : '', q.duration ? `${T.duration}: ${q.duration}` : '']
    : [q.jobAddress, q.startDate ? `${T.start}: ${d(q.startDate, L)}` : '', q.completedAt ? `${T.done}: ${d(q.completedAt, L)}` : '', `${T.est}${q.number}`]).filter(Boolean);
  jl.forEach((l, i) => doc.text(clean(l), M + colW, y + 29 + i * 12));
  y += 29 + Math.max(cl.length, jl.length) * 12 + 18;

  // Descripción / alcance del trabajo
  if (q.scope && q.scope.trim()) {
    const sl = doc.splitTextToSize(clean(q.scope.trim()), W - 2 * M - 24);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent);
    doc.text(clean(T.scope.toUpperCase()), M, y); y += 8;
    let i = 0;
    while (i < sl.length) {
      const room = Math.max(1, Math.floor((H - 120 - y - 20) / 13));
      const chunk = sl.slice(i, i + room);
      doc.setFillColor(248, 250, 252); doc.roundedRect(M, y, W - 2 * M, chunk.length * 13 + 16, 6, 6, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...ink);
      doc.text(chunk, M + 12, y + 16);
      y += chunk.length * 13 + 16;
      i += chunk.length;
      if (i < sl.length) { doc.addPage(); y = M; }
    }
    y += 20;
  }

  // Tabla de partidas
  const cx = { desc: M + 10, qty: W - M - 190, price: W - M - 100, amt: W - M - 10 };
  doc.setFillColor(241, 245, 249); doc.rect(M, y, W - 2 * M, 24, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ink);
  doc.text(T.desc, cx.desc, y + 16); doc.text(T.qty, cx.qty, y + 16, { align: 'right' });
  doc.text(T.price, cx.price, y + 16, { align: 'right' }); doc.text(T.amount, cx.amt, y + 16, { align: 'right' });
  y += 24;
  doc.setFont('helvetica', 'normal');
  q.items.forEach((it) => {
    const desc = clean(L === 'es' && it.es ? it.es : it.en || it.es);
    const lines = doc.splitTextToSize(desc, cx.qty - cx.desc - 40);
    const note = it.note ? doc.splitTextToSize(clean(it.note), cx.qty - cx.desc - 40) : [];
    const h = 12 + lines.length * 12 + note.length * 11;
    if (y + h > H - 160) { doc.addPage(); y = M; }
    doc.setTextColor(...ink); doc.setFontSize(9.5);
    doc.text(lines, cx.desc, y + 16);
    if (note.length) { doc.setFontSize(8.5); doc.setTextColor(...muted); doc.text(note, cx.desc, y + 16 + lines.length * 12); }
    doc.setFontSize(9.5); doc.setTextColor(...ink);
    doc.text(String(it.qty), cx.qty, y + 16, { align: 'right' });
    doc.text(S.money(it.price), cx.price, y + 16, { align: 'right' });
    doc.text(S.money(it.qty * it.price), cx.amt, y + 16, { align: 'right' });
    y += h + 4;
    doc.setDrawColor(...line); doc.line(M, y, W - M, y);
  });

  // Totales
  y += 16;
  const tx = W - M - 180;
  const row = (k, v, bold, color) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9.5); doc.setTextColor(...(color || ink));
    doc.text(k, tx, y); doc.text(v, W - M - 10, y, { align: 'right' }); y += bold ? 18 : 15;
  };
  row(T.sub, S.money(t.subtotal));
  row(`${T.tax} (${q.taxRate}%)`, S.money(t.tax));
  row(T.total, S.money(t.total), true);
  if (est) {
    if (q.depositPct) {
      doc.setFillColor(236, 254, 255);
      doc.roundedRect(tx - 10, y - 4, W - M - tx + 10, 28, 6, 6, 'F');
      y += 14;
      row(`${L === 'es' ? 'Anticipo' : 'Deposit'} (${q.depositPct}%)`, S.money(t.deposit), true, accent);
    }
  } else {
  if (t.paid) row(T.paid, '-' + S.money(t.paid), false, [5, 150, 105]);
  doc.setFillColor(t.balance > 0 ? 236 : 220, t.balance > 0 ? 254 : 252, t.balance > 0 ? 255 : 231);
  doc.roundedRect(tx - 10, y - 4, W - M - tx + 10, 28, 6, 6, 'F');
  y += 14;
  row(T.bal, S.money(Math.max(0, t.balance)), true, t.balance > 0 ? accent : [5, 150, 105]);

  // Sello PAGADA
  if (t.balance <= 0.005) {
    doc.setTextColor(5, 150, 105); doc.setFont('helvetica', 'bold'); doc.setFontSize(40);
    doc.text(T.stampPaid, M + 20, y - 20, { angle: 12 });
  }
  }

  // Pagos recibidos
  if (!est && q.payments?.length) {
    y += 10;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent); doc.text(T.payments.toUpperCase(), M, y); y += 13;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
    q.payments.forEach((p) => { doc.text(clean(`${d(p.t, L)}  -  ${p.method}  -  ${S.money(p.amount)}`), M, y); y += 12; });
  }

  // Pago en línea, garantía, condiciones
  y += 12;
  const block = (title, text, link) => {
    if (!text) return;
    if (y > H - 90) { doc.addPage(); y = M; }
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent); doc.text(title.toUpperCase(), M, y); y += 12;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...(link ? accent : muted));
    const ls = doc.splitTextToSize(clean(text), W - 2 * M);
    doc.text(ls, M, y);
    if (link) doc.link(M, y - 9, W - 2 * M, ls.length * 12, { url: text });
    y += ls.length * 12 + 10;
  };
  if (!est && t.balance > 0 && s.paymentLink) block(T.pay, s.paymentLink, true);
  block(T.terms, s.terms);
  block(T.warranty, s.warranty);
  if (est) block(T.excl, q.exclusions);

  // Aceptación (cotización)
  if (est) {
    if (y > H - 132) { doc.addPage(); y = M; }
    y += 4;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent); doc.text(clean(T.accept.toUpperCase()), M, y); y += 12;
    if (q.signature) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(5, 150, 105);
      doc.text(clean(`${T.approvedBy} ${q.signature}${q.approvedAt ? '  -  ' + d(q.approvedAt, L) : ''}`), M, y);
      y += 16;
    } else {
      y += 22;
      doc.setDrawColor(...ink);
      doc.line(M, y, M + 240, y); doc.line(W - M - 150, y, W - M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...muted);
      doc.text(clean(T.sigCustomer), M, y + 12); doc.text(clean(T.sigDate), W - M - 150, y + 12);
      y += 24;
    }
  }

  // Pie
  doc.setDrawColor(...line); doc.line(M, H - 54, W - M, H - 54);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ink);
  doc.text(T.thanks, W / 2, H - 36, { align: 'center' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...muted);
  doc.text(clean([s.bizName, s.phone, s.email].filter(Boolean).join('  |  ')), W / 2, H - 22, { align: 'center' });

  // Fotos del antes y después (opcionales)
  const groups = [['before', q.photos?.before || []], ['after', q.photos?.after || []]].filter(([, ids]) => ids.length);
  if (groups.length) {
    doc.addPage();
    let py = M;
    doc.setFillColor(10, 15, 31); doc.rect(0, 0, W, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...ink);
    doc.text(clean(T.photos), M, py + 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
    doc.text(clean(`${T.no}${q.number}  |  ${c.name || ''}  |  ${q.title || ''}`), M, py + 30);
    py += 50;
    const gap = 12, cw = (W - 2 * M - gap) / 2, ch = 190;
    for (const [kind, ids] of groups) {
      if (py + 30 > H - M) { doc.addPage(); py = M; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...accent);
      doc.text(clean(T[kind]), M, py); py += 10;
      for (let i = 0; i < ids.length; i++) {
        const col = i % 2;
        if (col === 0 && i > 0) py += ch + gap;
        if (py + ch > H - M) { doc.addPage(); py = M; }
        const ph = await photoDataURL(ids[i]);
        if (!ph) continue;
        const r = Math.min(cw / ph.w, ch / ph.h);
        const w = ph.w * r, h = ph.h * r;
        const x0 = M + col * (cw + gap) + (cw - w) / 2, y0 = py + (ch - h) / 2;
        doc.setFillColor(241, 245, 249); doc.roundedRect(M + col * (cw + gap), py, cw, ch, 6, 6, 'F');
        try { doc.addImage(ph.data, 'JPEG', x0, y0, w, h); } catch (e) { /* foto dañada */ }
      }
      py += ch + gap + 14;
    }
  }

  const name = fileSafe(`${est ? T.file : L === 'es' ? 'Factura' : 'Invoice'}-${q.number}-${c.name || 'cliente'}`) + '.pdf';
  return { blob: doc.output('blob'), name };
}

// Genera el PDF y abre "Compartir" (WhatsApp, correo…). Si el teléfono no puede, lo descarga.
export const shareInvoicePdf = (q, message) => shareDocPdf(q, 'invoice', message);
export const shareQuotePdf = (q, message) => shareDocPdf(q, 'estimate', message);

export async function shareDocPdf(q, kind, message) {
  const { blob, name } = await buildDocPdf(q, kind);
  const file = new File([blob], name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name, text: message });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}

/* ---------- Recibo de pago para el empleado ---------- */
const RL = {
  es: { title: 'RECIBO DE PAGO', no: 'Recibo #', date: 'Fecha', payroll: 'Planilla #', wo: 'Orden de trabajo #', emp: 'EMPLEADO', job: 'TRABAJO REALIZADO',
    concept: 'Concepto', conceptTxt: (q) => `Pago por trabajo realizado${q.title ? ': ' + q.title : ''}`, amount: 'Monto pagado', method: 'Forma de pago',
    received: 'Recibí conforme', delivered: 'Entregado por', note: 'Este recibo confirma el pago completo por el trabajo indicado.', completed: 'Terminado', phone: 'Tel.' },
  en: { title: 'PAYMENT RECEIPT', no: 'Receipt #', date: 'Date', payroll: 'Payroll #', wo: 'Work order #', emp: 'EMPLOYEE', job: 'WORK PERFORMED',
    concept: 'Description', conceptTxt: (q) => `Payment for work performed${q.title ? ': ' + q.title : ''}`, amount: 'Amount paid', method: 'Payment method',
    received: 'Received by', delivered: 'Paid by', note: 'This receipt confirms full payment for the work described.', completed: 'Completed', phone: 'Phone' }
};
const METHOD_EN = { Efectivo: 'Cash', Transferencia: 'Bank transfer', Cheque: 'Check', Zelle: 'Zelle', 'Cash App': 'Cash App', Venmo: 'Venmo', Otro: 'Other' };

export async function buildReceiptPdf(q, line) {
  const jsPDF = await loadJsPDF();
  const s = S.settings();
  const emp = S.getEmployee(line.empId) || {};
  const c = S.getClient(q.clientId) || {};
  const L = s.appLang === 'en' ? 'en' : 'es';
  const T = RL[L];
  const doc = new jsPDF({ unit: 'pt', format: [612, 560] });
  const W = doc.internal.pageSize.getWidth();
  const M = 44;
  const ink = [17, 24, 39], muted = [100, 110, 125], accent = [8, 145, 178], line_ = [225, 229, 236];
  let y = M;

  doc.setFillColor(10, 15, 31); doc.rect(0, 0, W, 8, 'F');
  doc.setFillColor(110, 231, 183); doc.rect(0, 8, W / 2, 3, 'F');
  doc.setFillColor(103, 232, 249); doc.rect(W / 2, 8, W / 2, 3, 'F');

  let x = M;
  if (s.logo) { try { doc.addImage(s.logo, 'JPEG', M, y, 46, 46); x = M + 58; } catch (e) { /* sin logo */ } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...ink);
  doc.text(clean(s.bizName || ''), x, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...muted);
  [[s.address, s.city, s.state].filter(Boolean).join(', '), [s.phone, s.email].filter(Boolean).join('  |  ')].filter(Boolean)
    .forEach((l, i) => doc.text(clean(l), x, y + 27 + i * 11));

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(5, 150, 105);
  doc.text(T.title, W - M, y + 16, { align: 'right' });
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
  [[T.no, String(line.receipt || '')], [T.date, d(line.paidAt || Date.now(), L)], [T.payroll, String(q.payroll?.number || '')], [T.wo, String(q.wo?.number || '')]]
    .forEach(([k, v], i) => { doc.setTextColor(...muted); doc.text(k, W - M - 80, y + 32 + i * 12, { align: 'right' }); doc.setTextColor(...ink); doc.text(clean(v), W - M, y + 32 + i * 12, { align: 'right' }); });
  y += 92;

  doc.setDrawColor(...line_); doc.line(M, y, W - M, y); y += 20;
  const colW = (W - 2 * M) / 2;
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent);
  doc.text(T.emp, M, y); doc.text(T.job, M + colW, y);
  doc.setFontSize(10.5); doc.setTextColor(...ink);
  doc.text(clean(line.name || emp.name || ''), M, y + 15);
  doc.text(clean(q.title || '-'), M + colW, y + 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
  [emp.role || line.role, emp.phone ? `${T.phone} ${emp.phone}` : ''].filter(Boolean).forEach((l, i) => doc.text(clean(l), M, y + 29 + i * 12));
  [c.name, q.jobAddress || c.address, q.completedAt ? `${T.completed}: ${d(q.completedAt, L)}` : ''].filter(Boolean)
    .forEach((l, i) => doc.text(clean(l), M + colW, y + 29 + i * 12));
  y += 78;

  doc.setFillColor(241, 245, 249); doc.roundedRect(M, y, W - 2 * M, 92, 8, 8, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...muted);
  doc.text(T.concept.toUpperCase(), M + 16, y + 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...ink);
  const conc = doc.splitTextToSize(clean(T.conceptTxt(q) + (line.note ? ` (${line.note})` : '')), W - 2 * M - 200);
  doc.text(conc, M + 16, y + 38);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...muted);
  doc.text(T.amount.toUpperCase(), W - M - 16, y + 22, { align: 'right' });
  doc.setFontSize(24); doc.setTextColor(5, 150, 105);
  doc.text(S.money(line.amount), W - M - 16, y + 50, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...muted);
  doc.text(clean(`${T.method}: ${L === 'en' ? (METHOD_EN[line.method] || line.method) : line.method}`), W - M - 16, y + 72, { align: 'right' });
  y += 120;

  doc.setFontSize(8.5); doc.setTextColor(...muted);
  doc.text(clean(T.note), M, y); y += 60;
  doc.setDrawColor(...ink);
  doc.line(M, y, M + 200, y); doc.line(W - M - 200, y, W - M, y);
  doc.setFontSize(9); doc.setTextColor(...ink);
  doc.text(clean(`${T.received}: ${line.name || ''}`), M, y + 14);
  doc.text(clean(`${T.delivered}: ${s.owner || s.bizName || ''}`), W - M - 200, y + 14);

  const name = fileSafe(`${L === 'es' ? 'Recibo' : 'Receipt'}-${line.receipt}-${line.name || 'empleado'}`) + '.pdf';
  return { blob: doc.output('blob'), name };
}

export async function shareReceiptPdf(q, line, message) {
  const { blob, name } = await buildReceiptPdf(q, line);
  const file = new File([blob], name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name, text: message }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
