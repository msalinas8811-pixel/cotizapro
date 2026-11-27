// CotizaPro — factura en PDF (archivo real) para enviar al cliente por WhatsApp o correo
import * as S from './store.js';

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
    payments: 'Payments received', pay: 'Pay online', warranty: 'Warranty', terms: 'Terms', thanks: 'Thank you for your business!', stampPaid: 'PAID' },
  es: { inv: 'FACTURA', no: 'Factura #', date: 'Fecha', due: 'Vence', wo: 'Orden de trabajo #', est: 'Cotización #', billTo: 'CLIENTE', job: 'TRABAJO', done: 'Terminado',
    desc: 'Descripción', qty: 'Cant.', price: 'Precio', amount: 'Monto', sub: 'Subtotal', tax: 'Impuesto', total: 'Total', paid: 'Pagado', bal: 'Saldo pendiente',
    payments: 'Pagos recibidos', pay: 'Pagar en línea', warranty: 'Garantía', terms: 'Condiciones', thanks: '¡Gracias por su preferencia!', stampPaid: 'PAGADA' }
};

const d = (t, L) => t ? new Date(typeof t === 'string' && t.length === 10 ? t + 'T12:00' : t).toLocaleDateString(L === 'es' ? 'es-US' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
// jsPDF con fuentes estándar no dibuja algunos símbolos: se limpian
const clean = (s) => String(s ?? '').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF]/g, '');

export async function buildInvoicePdf(q) {
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
  const bizLines = [s.owner, [s.address, s.city].filter(Boolean).join(', '), [s.phone, s.email].filter(Boolean).join('  |  '), s.website,
    [s.license ? (L === 'es' ? 'Licencia #' : 'License #') + s.license : '', s.insured ? (L === 'es' ? 'Asegurado' : 'Insured') : ''].filter(Boolean).join('  |  ')].filter(Boolean);
  bizLines.forEach((l, i) => doc.text(clean(l), x, y + 28 + i * 12));

  // Título
  doc.setTextColor(...accent); doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
  doc.text(T.inv, W - M, y + 18, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...ink);
  const meta = [
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
  const jl = [q.jobAddress, q.completedAt ? `${T.done}: ${d(q.completedAt, L)}` : '', `${T.est}${q.number}`].filter(Boolean);
  jl.forEach((l, i) => doc.text(clean(l), M + colW, y + 29 + i * 12));
  y += 29 + Math.max(cl.length, jl.length) * 12 + 18;

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

  // Pagos recibidos
  if (q.payments?.length) {
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
  if (t.balance > 0 && s.paymentLink) block(T.pay, s.paymentLink, true);
  block(T.warranty, s.warranty);
  block(T.terms, s.terms);

  // Pie
  doc.setDrawColor(...line); doc.line(M, H - 54, W - M, H - 54);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ink);
  doc.text(T.thanks, W / 2, H - 36, { align: 'center' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...muted);
  doc.text(clean([s.bizName, s.phone, s.email].filter(Boolean).join('  |  ')), W / 2, H - 22, { align: 'center' });

  const name = `${L === 'es' ? 'Factura' : 'Invoice'}-${q.number}-${clean(c.name || 'cliente').replace(/\s+/g, '-')}.pdf`;
  return { blob: doc.output('blob'), name };
}

// Genera el PDF y abre "Compartir" (WhatsApp, correo…). Si el teléfono no puede, lo descarga.
export async function shareInvoicePdf(q, message) {
  const { blob, name } = await buildInvoicePdf(q);
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
