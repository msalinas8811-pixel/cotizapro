# CotizaPro

**Cotiza en español. Cobra en inglés.**

App (PWA) de cotizaciones y facturas para oficios en EE.UU.: pintores, limpieza, jardinería, handyman y remodelación. El trabajador dicta el trabajo en español y la app arma una cotización profesional en inglés que el cliente abre desde un link, firma y paga.

## Flujo completo

1. **Perfil de la empresa**: nombre, logo, dueño, dirección, teléfono, correo, sitio web, licencia, seguro, años de experiencia, servicios, garantía y horario. Se puede compartir con clientes.
2. **Cotizar servicio**: formulario con datos del cliente, tipo de servicio, lugar del trabajo, alcance (escrito o dictado por voz), partidas con precios, fecha de inicio, duración, impuesto, anticipo y lo que no incluye.
3. **Formato profesional de cotización**: datos de la empresa y del cliente, alcance, tabla de partidas, totales, anticipo, condiciones de pago, garantía y aceptación. Se ve en inglés o español.
4. **Link por WhatsApp**: el cliente abre la cotización, firma con su nombre y toca *Aprobar*.
5. **Orden de trabajo**: la aprobación llega por WhatsApp con un link. Al tocarlo en el teléfono del negocio, la orden se crea sola.
6. **Seguimiento de la obra**: etapas (visita, materiales, en progreso, revisión, terminado), porcentaje de avance y notas. El cliente recibe un link de seguimiento por WhatsApp cada vez que hay un avance.
7. **Fotos del antes y después (opcional)**: con la cámara o desde la galería, en la cotización o en la orden de trabajo. Se comprimen y se guardan en el teléfono, se pueden mandar al cliente y salen en una página aparte de la factura PDF.
8. **Empleados**: lista de empleados con WhatsApp, oficio, forma de pago (por trabajo, por día o por hora) y tarifa.
9. **Asignar la orden**: en cada orden de trabajo se asignan uno o varios empleados con el monto a pagar a cada uno. La app calcula la mano de obra y la ganancia estimada, y manda la orden al empleado por WhatsApp.
10. **Planilla de pago**: al terminar la obra se crea sola la planilla con los empleados y sus montos. Se registra el pago de cada uno (efectivo, transferencia, Zelle, Cash App, Venmo, cheque) y se genera su **recibo de pago en PDF** con firmas de recibido.
11. **Factura final en PDF**: al terminar el trabajo se genera la factura en PDF (archivo real) con datos de la empresa, del cliente, partidas, pagos recibidos y saldo, lista para mandarla por WhatsApp o correo. Si está pagada, lleva el sello *PAID / PAGADA*.

## Dos idiomas

- **Idioma de la app**: español o inglés, para dueños de negocio latinos o estadounidenses. Se elige en la pantalla de bienvenida (botón *English / Español*) y se cambia en Ajustes. El dictado por voz y el generador de partidas entienden los dos idiomas.
- **Idioma para el cliente**: aparte del idioma de la app. Define en qué idioma reciben el cliente la cotización, la factura PDF, el seguimiento y los mensajes de WhatsApp. El cliente también puede cambiar el idioma desde el link.
- Los textos en inglés de la interfaz están en `js/i18n-en.js`.

## Funciones

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
js/pdf.js               Factura en PDF
js/i18n.js, i18n-en.js  Traducción de la app al inglés
js/geo.js               Países y estados de EE.UU.
js/photos.js            Fotos del antes y después (IndexedDB)
js/vendor/              jsPDF (licencia MIT) para generar los PDF sin internet
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
- La cotización y el seguimiento viajan dentro del link. La aprobación del cliente llega por WhatsApp y la orden se crea al abrir ese link en el teléfono donde se hizo la cotización. Con un backend, esto pasaría solo y en cualquier dispositivo.
- El alcance del trabajo se muestra tal como se escribe: si el cliente habla inglés, escríbelo en inglés o usa el servidor de IA.
- Las fotos viven en el teléfono: no viajan dentro del link de seguimiento. Se envían al cliente con el botón *Enviar fotos* o dentro de la factura PDF. El respaldo JSON no incluye las fotos.
- Los cobros usan el link de pago del propio negocio (Stripe, Square o PayPal). Más adelante se puede integrar Stripe Connect.
- El Plan Pro ($12 al mes) se muestra en la app pero todavía no cobra. En Play Store, la suscripción a la app tendrá que cobrarse con Google Play Billing.

## Próximos pasos

1. Backend (Cloudflare Workers + D1) para cuentas, sincronización y aprobación automática.
2. Stripe Connect para cobrar directo desde la app.
3. Suscripción Pro con Google Play Billing.
4. Fotos del trabajo dentro de la cotización.
