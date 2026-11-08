# V87-PARCHE — La zona del técnico en el idioma del draft (2026-11-07)

La estrella norte de diseño de Gabriel (el draft aprobado de `/tecnico`: fondo limpio, acentos rojos `#e42535`, letras GRANDES, tarjetas grandes redondeadas de 20px, aire generoso, UNA idea por pantalla y rótulos en mayúsculas) ya cubrió el registro de trabajadores (v84), la home del cliente (v85) y el carrito/checkout (v86); la v87 lo lleva a la **zona del trabajador (`#workerBox`)**: trabajos disponibles, mis trabajos / detalle, ganancias, menú de venta, estimados, referidos, visitas de yarda y perfil. Es la superficie que se lee **en la calle, con sol, a veces con guantes y a una mano** — por eso aquí la legibilidad y el tamaño del toque mandan sobre la densidad. Es un restyle de CSS/markup: **ningún id, handler, ruta hash, llamada API, precio ni flujo cambió** — el reclamo de trabajos, el filtro de 50 millas, la ubicación compartida, las transiciones de estado, el onboarding de Stripe Connect, la matemática del pago (el técnico ve SU oferta exacta, jamás el total del cliente) y la puerta de ventas de la v84 (el ayudante NO ve el menú de venta; su restyle es solo la vista del técnico) quedan byte a byte como estaban. Suite: **1753 → 1756 PASS / 0 FAIL** (verificada dos veces) (3 pins netos nuevos v87; 2 pins existentes actualizados = los bumps de cache de siempre).

## 1. La tarjeta del trabajo — el pago es el número más grande

- Todas las tarjetas de la zona: radio **20px** y padding 20px (`#workerBox .card`); el cuerpo de la tarjeta del board y del detalle sube a 15.5px con línea 1.5.
- El servicio gana clase propia (`.wjob-title`, 18.5px / 800) en el board (`loadJobs`) y en el detalle (`openJobDetail`) — antes era texto plano al tamaño del cuerpo.
- El pago: el mismo renglón de siempre (`payOffer` + el monto con `escHtml`, ni una palabra ni un número distinto) ahora viste `.wjob-pay` a **25px** — el número más grande de la tarjeta, legible de un vistazo.
- El estado deja de ser una pastilla gris: la misma `<span class="pill">` gana el atributo `data-wst` con el estado (escapado como antes) y el color por estado — **Open = rojo** (hay que tomarlo), **Claimed = ámbar**, **On my way = negro**, **Arrived / Done / Paid = verde** — y la pastilla base de la zona crece (13.5px / 800 / padding 7·12). Cualquier estado fuera de ese vocabulario conserva la pastilla base grande, sin color inventado.
- La tarjeta del detalle ya traía su borde rojo inline (1.5px `#e42535`): con el radio de 20px de la zona queda vestida como la tarjeta elegida del draft sin tocar ese markup.

## 2. Botones de acción ENORMES

- Clase nueva `.wact` (display block, ancho completo, margen superior 10px) sobre **cada botón del flujo del trabajo** en `workerJobBtns` — Tomar este trabajo (Open), En camino (Claimed), Ya llegué (On my way), compartir/reanudar ubicación, y Terminé — fotos — **mismos handlers, mismo orden, mismos diálogos de confirmación**; solo se añadió la clase a la etiqueta. Ver detalles y el Cerrar inferior del detalle también son `.wact`.
- Regla de zona: todo botón dentro de una tarjeta de `#workerBox` sube a **mínimo 56px de alto, 17px de letra, radio 14px** (el rectángulo del draft) — cubre Conectar Stripe, guardar perfil/oficios, enviar estimado, copiar link de venta, subir fotos de yarda y los estados de visita.
- Dos tallados de vuelta, deliberados: el botón Send del chat (`.reply`) y los chips de nivel de oficio (`.trade-lvl`, el selector 1–5 del editor de oficios) recuperan su tamaño compacto — son controles de densidad, no acciones del trabajo, y un chip de 56px rompería la fila de respuesta del chat y la rejilla de niveles.

## 3. Encabezados de sección con el tratamiento del rótulo

- `#workerBox h2` (Trabajos abiertos, Mi dinero, menú de venta, estimados, referidos, Mis visitas de yarda, perfil): **mayúsculas, 800, tracking .03em, 20px** — el tratamiento de rótulo del draft. El color se queda en la tinta de la zona (la convención asentada: los rótulos de paso `.wclass-step`/`.cc-step` son los rojos; los encabezados de sección son tinta) y los `h3` de la zona suben a 16.5px.
- Campos de la zona (perfil, estimados): radio 14px y padding 13/14, como el checkout de la v86; etiquetas a 14px.

## 4. Ganancias = tarjetas de cifra destacadas

- Los totales de `loadPayouts` — **las mismas etiquetas (`paidOutLabel` / `pendingLabel`), los mismos montos calculados de la misma forma** — se presentan como dos `.wstat-card` lado a lado: el panel destacado del draft (`#141414`, borde 2px `#e42535`, radio 20px), rótulo en mayúsculas atenuado y la cifra a **27px**: lo pagado en **verde** y lo pendiente en **ámbar** (la semántica de dinero de la paleta v77). Las filas por trabajo debajo quedan byte a byte como estaban, dentro de la misma tarjeta.
- La tarjeta de setup de Connect (verde/ámbar según estado) no cambia de markup: solo hereda el radio y los botones grandes de la zona.

## 5. Decisiones

- **El color de los h2 no se tiñó de rojo**: la brief dejaba el color a la convención de la zona, y en esta zona los encabezados siempre fueron tinta — el tratamiento aplicado es el del rótulo (mayúsculas + tracking + peso), no un repintado. Los acentos rojos de la zona quedan en el pago, los badges y los bordes destacados, como en el draft.
- **El badge de estado se implementó con `data-wst` + selectores de atributo**, no con clases por estado: el estado llega como texto del servidor y pintarlo escapado en el atributo conserva intactos los pins XSS de la v80.8 (el board sigue escapando servicio/estado/descripción/ciudad/cuándo/pago).
- **El menú de venta no se tocó en markup** (`loadWorkerSales` intacto, con su guarda de clase de la v84 al frente): su restyle es enteramente la herencia de la zona (tarjeta 20px, h2 de rótulo, botón de link a 56px).
- Ninguna cadena nueva de i18n: todo el texto visible sale de las claves `W_I18N` de siempre — el restyle no añadió ni una palabra.

## 6. Pins — `tests/run.mjs` (3 nuevos v87 + 2 actualizados)

- **Nuevos:** (a) estático — el lenguaje de la zona en CSS (tarjetas 20px, h2 de rótulo, botones de tarjeta a 56px/17px/14px, los dos tallados de vuelta, `.wact` ancho completo); (b) estático — board y detalle pintan `.wjob-title`, el badge con `data-wst` y sus reglas de color, el pago `.wjob-pay` a 25px, y cada botón de `workerJobBtns` (claim/status/done) más Ver detalles como `.wact` con su handler intacto; (c) estático — las ganancias como `.wstat-card` destacadas (panel #141414, borde rojo, radio 20px) con las cifras paid/pend y las etiquetas de siempre.
- **Actualizados (los de siempre):** los 2 pins de cache SW pasan a `ghs-app-v87`.
- Ninguna aserción existente se debilitó; los pins de comportamiento de la zona (reclamo/estado/fotos v80.x, XSS v80.8, la puerta de ventas v84, la clase obligatoria v84) pasan sin tocarse.

## Versión

- SW `CACHE = 'ghs-app-v87'`.
- Archivos: `app/public/index.html`, `app/public/sw.js`, `tests/run.mjs`, este archivo. **`app/server.js` NO se tocó.**
- Sin cambios de precios, sin cambios al catálogo, sin cambios funcionales: mismos ids, mismos handlers, mismas rutas, misma matemática de pago.
