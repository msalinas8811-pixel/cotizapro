// CotizaPro — fotos del antes y después (guardadas en el teléfono con IndexedDB)
const DB_NAME = 'cotizapro-photos';
const STORE = 'photos';
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    const r = fn(st);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

const id = () => 'ph_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Reduce la foto (máx. 1280 px, JPEG) para que no llene el teléfono
function compress(file, max = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve({ blob: b, w: c.width, h: c.height }) : reject(new Error('foto'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto')); };
    img.src = url;
  });
}

export async function addPhotos(files) {
  const ids = [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const { blob, w, h } = await compress(f);
    const key = id();
    await tx('readwrite', (st) => st.put({ blob, w, h, t: Date.now() }, key));
    ids.push(key);
  }
  return ids;
}

export const getPhoto = (key) => tx('readonly', (st) => st.get(key));

export async function deletePhotos(keys) {
  if (!keys?.length) return;
  await tx('readwrite', (st) => keys.forEach((k) => st.delete(k)));
}

const urlCache = new Map();
export async function photoURL(key) {
  if (urlCache.has(key)) return urlCache.get(key);
  const p = await getPhoto(key);
  if (!p) return '';
  const u = URL.createObjectURL(p.blob);
  urlCache.set(key, u);
  return u;
}

export async function photoDataURL(key) {
  const p = await getPhoto(key);
  if (!p) return null;
  const data = await new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(p.blob);
  });
  return { data, w: p.w, h: p.h };
}

export async function photoFiles(keys, prefix) {
  const out = [];
  let i = 1;
  for (const k of keys) {
    const p = await getPhoto(k);
    if (p) out.push(new File([p.blob], `${prefix}-${i++}.jpg`, { type: 'image/jpeg' }));
  }
  return out;
}
