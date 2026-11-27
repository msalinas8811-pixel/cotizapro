# CotizaPro

**Cotiza en español. Cobra en inglés.**

App (PWA) de cotizaciones y facturas para oficios en EE.UU.: pintores, limpieza, jardinería, handyman y remodelación. El trabajador dicta el trabajo en español y la app arma una cotización profesional en inglés que el cliente abre desde un link, firma y paga.

## Qué hace

- **Cotización por voz**: dictado en español desde el micrófono del teléfono. El texto se convierte en partidas con precios sugeridos que se pueden editar.
- **Partidas en dos idiomas**: el cliente las ve en inglés y el trabajador tiene la versión en español.
- **Link para el cliente**: se envía por WhatsApp, SMS o copiando el link. El cliente ve la cotización en inglés o español, la firma, avisa por WhatsApp y paga el anticipo.
- **Factura y cobro**: saldo con barra de progreso, registro de pagos (tarjeta, Zelle, efectivo, cheque), recordatorios por WhatsApp y PDF para descargar.
- **Clientes**: búsqueda, filtros (con saldo, recientes) e historial de trabajos.
- **Ajustes**: logo, impuesto del estado, anticipo, validez, idioma del cliente, términos y link de pago (Stripe, Square o PayPal).
- **Sin internet**: funciona offline. Los datos se guardan en el teléfono, y desde Ajustes se puede exportar un respaldo.

## Estructura

```
index.html              Pantalla base de la app
css/styles.css          Estilo glassmorphism
js/app.js               Pantallas y navegación
js/store.js             Datos (localStorage), cálculos y links para el cliente
js/parser.js            Dictado en español → partidas en inglés (con IA opcional)
js/icons.js             Íconos
manifest.webmanifest    Datos de instalación (PWA)
sw.js                   Service worker (modo sin internet)
icons/                  Íconos de la app
worker/                 Servidor de IA opcional (Cloudflare Workers)
```

## Probar en tu computadora

```bash
python3 -m http.server 8080
# abre http://localhost:8080
```

El dictado por voz funciona en Chrome para Android y en Chrome o Edge de escritorio. En otros navegadores se escribe el trabajo a mano.

## Publicar gratis con GitHub Pages

1. En el repositorio entra a **Settings → Pages**.
2. En *Source* elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
3. Guarda. En uno o dos minutos la app queda en `https://msalinas8811-pixel.github.io/cotizapro/`.

## Subirla a Play Store

1. Con la app ya publicada en GitHub Pages, entra a **https://www.pwabuilder.com**.
2. Pega la dirección de la app y elige **Package for stores → Android**.
3. Descarga el paquete (.aab) y súbelo en **Google Play Console**. La cuenta de desarrollador tiene un pago único. Las cuentas personales nuevas tienen que pasar primero una prueba cerrada con testers.
4. PWABuilder te da un archivo `assetlinks.json`. Ponlo en `.well-known/assetlinks.json` para que la app abra sin barra de navegador.

## IA para cotizaciones más precisas (opcional)

Sin servidor, la app usa reglas locales que reconocen cuartos, sala, cocina, baños, techos, puertas, gabinetes, exterior, cercas, decks, reparaciones, limpieza, jardinería, drywall y pisos. Para que una IA redacte las partidas:

```bash
cd worker
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

Después pega la dirección del Worker en **Ajustes → Servidor de IA**. La clave de la API queda guardada en el Worker y nunca va dentro de la app.

## Límites de esta versión (MVP)

- Los datos viven en el teléfono, sin cuentas ni sincronización entre dispositivos.
- La cotización viaja dentro del link. Cuando el cliente aprueba, avisa por WhatsApp y el trabajador marca la cotización como aprobada en la app.
- Los cobros usan el link de pago del propio negocio (Stripe, Square o PayPal). Más adelante se puede integrar Stripe Connect.
- El Plan Pro ($12 al mes) se muestra en la app pero todavía no cobra. En Play Store, la suscripción a la app tendrá que cobrarse con Google Play Billing.

## Próximos pasos

1. Backend (Cloudflare Workers + D1) para cuentas, sincronización y aprobación automática.
2. Stripe Connect para cobrar directo desde la app.
3. Suscripción Pro con Google Play Billing.
4. Fotos del trabajo dentro de la cotización.
