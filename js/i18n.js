// CotizaPro — traducción de la interfaz al inglés.
// La app está escrita en español; cuando el idioma de la app es inglés, cada texto
// de la pantalla se cambia usando este diccionario (y patrones para textos con números).
import { EN, PATTERNS } from './i18n-en.js';

const cache = new Map();

export function tr(text) {
  if (text == null) return text;
  const raw = String(text);
  const key = raw.trim();
  if (!key) return raw;
  if (cache.has(key)) { const c = cache.get(key); return raw.replace(key, () => c); }
  let out = EN[key];
  if (out === undefined) {
    for (const [re, rep] of PATTERNS) {
      if (re.test(key)) { out = key.replace(re, rep); break; }
    }
  }
  if (out === undefined) return raw;
  cache.set(key, out);
  return raw.replace(key, () => out);
}

const ATTRS = ['placeholder', 'aria-label', 'title'];

export function translateDOM(root) {
  if (!root) return;
  if (root.nodeType === 3) { translateText(root); return; }
  if (root.nodeType !== 1 || root.closest?.('[data-noi18n]')) return;
  translateEl(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && n.hasAttribute('data-noi18n') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === 3) translateText(n);
    else translateEl(n);
  }
}

function translateText(node) {
  const p = node.parentElement;
  if (!p || p.closest('[data-noi18n]') || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.tagName)) return;
  const v = node.nodeValue;
  if (!v || !v.trim()) return;
  const t = tr(v);
  if (t !== v) node.nodeValue = t;
}

function translateEl(el) {
  for (const a of ATTRS) {
    if (el.hasAttribute(a)) {
      const v = el.getAttribute(a);
      const t = tr(v);
      if (t !== v) el.setAttribute(a, t);
    }
  }
}

// Traduce también lo que aparece después (partidas nuevas, avisos, ventanas)
let observer = null;
export function watch(isActive) {
  if (observer) return;
  observer = new MutationObserver((muts) => {
    if (!isActive()) return;
    for (const m of muts) {
      if (m.type === 'characterData') translateText(m.target);
      else m.addedNodes.forEach((n) => translateDOM(n));
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}
