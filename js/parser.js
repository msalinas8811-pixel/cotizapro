// CotizaPro — convierte lo que dicta el trabajador (español) en partidas de cotización (inglés).
// Funciona sin internet con reglas simples. Si hay un Worker de IA configurado, se usa primero.

const NUM = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100
};

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function numBefore(text, wordRe) {
  const re = new RegExp('(\\d+(?:[.,]\\d+)?|' + Object.keys(NUM).join('|') + ')\\s+(?:\\w+\\s+)?' + wordRe);
  const m = text.match(re);
  if (!m) return null;
  const raw = m[1];
  return NUM[raw] ?? Number(raw.replace(',', '.'));
}

// Precios sugeridos de arranque. El trabajador siempre los revisa antes de enviar.
// Formato: [patrón en español, descripción inglés, descripción español, unidad, precio, regla de cantidad]
const RULES = [
  { re: /(cuarto|habitacion|recamara|dormitorio)/, en: 'Interior painting – rooms', es: 'Pintura interior – cuartos', qtyRe: '(?:cuartos?|habitacion(?:es)?|recamaras?|dormitorios?)', price: 480 },
  { re: /(sala|comedor)/, en: 'Living / dining room painting', es: 'Pintura de sala / comedor', qtyRe: '(?:salas?|comedor(?:es)?)', price: 650 },
  { re: /(bano)/, en: 'Bathroom painting', es: 'Pintura de baño', qtyRe: '(?:banos?)', price: 350 },
  { re: /(cocina)/, en: 'Kitchen painting', es: 'Pintura de cocina', qtyRe: '(?:cocinas?)', price: 550 },
  { re: /(techo|cielo|cielorraso)/, en: 'Ceiling painting', es: 'Pintura de techos', qtyRe: '(?:techos?|cielos?)', price: 220 },
  { re: /(gabinete|alacena)/, en: 'Cabinet painting', es: 'Pintura de gabinetes', qtyRe: '(?:gabinetes?|alacenas?)', price: 95, unit: 'door' },
  { re: /(puerta)/, en: 'Door painting', es: 'Pintura de puertas', qtyRe: '(?:puertas?)', price: 85 },
  { re: /(exterior|fachada|afuera)/, en: 'Exterior painting', es: 'Pintura exterior / fachada', price: 2800 },
  { re: /(cerca|fence|verja)/, en: 'Fence painting / staining', es: 'Pintura de cerca', price: 900 },
  { re: /(deck|terraza)/, en: 'Deck staining', es: 'Tinte de deck / terraza', price: 750 },
  { re: /(grieta|reparar|resane|resanar|parche|hoyo)/, en: 'Wall prep & crack repair', es: 'Preparación y reparación de grietas', price: 350 },
  { re: /(limpieza profunda|deep clean)/, en: 'Deep cleaning', es: 'Limpieza profunda', price: 320 },
  { re: /(limpieza|limpiar)/, en: 'House cleaning', es: 'Limpieza de casa', price: 180 },
  { re: /(cortar (el )?zacate|grama|cesped|jardin|podar)/, en: 'Lawn care & yard work', es: 'Jardinería y corte de grama', price: 120 },
  { re: /(drywall|tablaroca)/, en: 'Drywall repair', es: 'Reparación de drywall', price: 300 },
  { re: /(piso|floor)/, en: 'Flooring work', es: 'Trabajo de piso', price: 1200 }
];

export function parseLocal(text) {
  const t = norm(text);
  const items = [];
  const coatsN = numBefore(t, 'manos?') || (/(dos manos|2 manos)/.test(t) ? 2 : null);
  const coats = coatsN ? `${coatsN} coat${coatsN > 1 ? 's' : ''}` : '';

  const sqft = numBefore(t, '(?:pies cuadrados|pies2|sq ?ft)');

  for (const r of RULES) {
    if (!r.re.test(t)) continue;
    if (r.en === 'House cleaning' && items.some((i) => i.en === 'Deep cleaning')) continue;
    let qty = r.qtyRe ? numBefore(t, r.qtyRe) || 1 : 1;
    let en = r.en;
    let es = r.es;
    if (r.en.endsWith('rooms')) {
      en = 'Interior painting – per room';
      es = 'Pintura interior – por cuarto';
    }
    const noteParts = [];
    if (coats && /painting|staining/i.test(en)) noteParts.push(coats);
    if (sqft && /painting/i.test(en) && !items.length) noteParts.push(`approx. ${sqft} sq ft`);
    items.push({ en, es, note: noteParts.join(' · '), qty, price: r.price });
  }

  if (/(incluye|incluido|con) (la )?(pintura|material)/.test(t)) {
    const paintable = items.filter((i) => /painting|staining/i.test(i.en));
    const base = paintable.reduce((s, i) => s + i.qty * i.price, 0);
    items.push({ en: 'Paint & materials', es: 'Pintura y materiales', note: 'Premium paint', qty: 1, price: Math.max(120, Math.round((base * 0.25) / 10) * 10) });
  }

  if (!items.length && text.trim()) {
    items.push({ en: 'Labor', es: 'Mano de obra', note: text.trim().slice(0, 80), qty: 1, price: 0 });
  }

  // Cliente: "cliente Jennifer Smith" / "para Jennifer Smith"
  let client = '';
  const m = text.match(/(?:[Cc]liente|[Pp]ara (?:el señor |la señora |el sr\.? |la sra\.? )?)\s*([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)/);
  if (m) client = m[1];

  // Ciudad: "en Houston"
  let city = '';
  const c = text.match(/\ben\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
  if (c) city = c[1];

  const title = items.length ? items[0].en.replace(/ – .*/, '') : 'Service';
  return { client, city, title, items };
}

// Usa el Worker de IA si existe; si falla, cae a las reglas locales.
export async function parseDictation(text, { aiEndpoint, trade, state } = {}) {
  if (aiEndpoint) {
    try {
      const res = await fetch(aiEndpoint.replace(/\/$/, '') + '/api/estimate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, trade, state })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length) {
          return { ...data, source: 'ai' };
        }
      }
    } catch (e) {
      console.warn('IA no disponible, uso reglas locales', e);
    }
  }
  return { ...parseLocal(text), source: 'local' };
}
