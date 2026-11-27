// CotizaPro — Worker de IA (Cloudflare Workers)
// Recibe lo que dictó el trabajador en español y devuelve partidas en inglés.
// La clave de la API vive aquí como secreto: nunca va dentro de la app.
//
// Publicar:  cd worker && npx wrangler deploy
// Secreto:   npx wrangler secret put ANTHROPIC_API_KEY

const MODEL = 'claude-sonnet-5-5';

const PROMPT = (trade, state) => `You turn a Spanish voice note from a US home-services contractor (${trade || 'painting'}, ${state || 'USA'}) into a professional estimate in English.
Return ONLY JSON with this shape:
{"client":"name or empty","city":"city or empty","title":"short job title in English","items":[{"en":"line item in English","es":"same item in Spanish","note":"short detail in English","qty":1,"price":0}]}
Rules: use realistic but conservative US market prices in USD for the trade and state; split labor and materials when materials are mentioned; never invent work that was not mentioned; qty is a number; keep each "en" under 60 characters.`;

const cors = (origin) => ({
  'access-control-allow-origin': origin || '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
});

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/estimate') {
      return new Response('Not found', { status: 404, headers: cors(origin) });
    }
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400, origin); }
    const text = String(body.text || '').slice(0, 2000);
    if (!text.trim()) return json({ error: 'empty' }, 400, origin);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: PROMPT(body.trade, body.state),
        messages: [{ role: 'user', content: text }]
      })
    });
    if (!res.ok) return json({ error: 'ai_failed', status: res.status }, 502, origin);
    const data = await res.json();
    const out = (data.content || []).map((c) => c.text || '').join('');
    const match = out.match(/\{[\s\S]*\}/);
    try {
      const parsed = JSON.parse(match ? match[0] : out);
      parsed.items = (parsed.items || []).map((i) => ({
        en: String(i.en || ''), es: String(i.es || ''), note: String(i.note || ''),
        qty: Number(i.qty) || 1, price: Math.max(0, Number(i.price) || 0)
      }));
      return json(parsed, 200, origin);
    } catch {
      return json({ error: 'parse_failed' }, 502, origin);
    }
  }
};

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors(origin) } });
}
