# V91-PARCHE — La página pública del carrito `/cart/<id>` viste la marca (2026-11-07)

Era el rezago declarado en la v89 y la v90: el cliente recibía su link, lo abría… y caía en una página **blanca** — la única superficie de cara al cliente que no había pasado al tema oscuro global. La v91 la trae al mismo idioma asentado en v85–v90: superficies oscuras de la marca, rojo `#e42535`, tarjetas de 20px, la tarjeta de dinero destacada y los colores que significan en su clave oscura. **Presentación pura**: ni una ruta, ni un handler, ni una cifra, ni una palabra, ni un id cambió. Suite: **1780 → 1788 PASS / 0 FAIL** (verificada dos veces) (3 pins estáticos nuevos + 5 de escenario en vivo, los 2 bumps de caché de siempre y 1 pin actualizado — §5).

## 1. El hallazgo — la página es UNA función, y es del servidor

Toda la página vive en **`cartPageHtml(c, user, langOverride, notice)`** en `app/server.js`: cabecera y pie propios, **todo el estilo en línea**, y los cuatro estados del carrito (abierto, apartado/booked, pagado completo, cancelado — más el cancelado-con-reembolso de la v80.5) comparten la misma concha. Nada de la página se pinta del lado del cliente en `index.html`, y la página **no pasa por el service worker** (se renderiza en el servidor en cada visita) — el bump de caché de esta versión es el ritual de versión de siempre, no una necesidad de esta página. La edición se hizo **acotada a esa función** (más el 404 de su propia ruta, §4), con reemplazos contados y verificados: el diff de `server.js` son 57 líneas, todas líneas de plantilla que cargan estilo, y los conteos de `depositSplit(`, `usd(`, ids y `data-l`/`data-m` quedaron **idénticos** antes y después.

## 2. Inventario — de claro a oscuro

| Superficie | Antes | Ahora |
|---|---|---|
| Primera pintura + controles nativos | sin `<head>` propio: fondo blanco por defecto, texto `#111` | estilo crítico `<style>html,body{background:#0a0a0c}…</style>` abre el documento; metas `theme-color #0b0b0b` y **`color-scheme: dark`** (+ `:root{color-scheme:dark}`) y filas `option` oscuras (`#1b1b1f`) — el desplegable de horario ya no abre claro; body `#0a0a0c` con tinta `#e8e8ea` |
| Cabecera de marca | negra `#0b0b0b`, radio 14px, subtítulo `#ff4444` | la misma negra, radio **20px**, subtítulo en el rojo de marca `#e42535`; los botones EN/ES conservan su comportamiento (solo el borde inactivo pasa a `#3a3a41`) |
| Tarjeta contenedora | borde `#ddd`, radio 14px, sin fondo (blanco) | panel **`#17171b`**, borde `#2a2a31`, radio 20px |
| Rótulos | h2/h3 del navegador | h2 a **22px/800**, h3 a **18px/800** (el tratamiento de la v90) |
| Tabla de líneas | filetes `#eee`, 14px | filetes `#26262a`, 15px |
| Pastilla **Labor** | verde claro `#eef7ee`/`#bfe3bf`/`#1a7f37` | **clave verde oscura** `#0b2013`/`#1d5c38`, texto `#2fbf71` |
| Pastilla **Materiales** | gris claro `#f1f1f1`/`#ddd`/`#555` | neutro oscuro `#26262a`/`#33333b`, texto `#a49d93` |
| Pistas de miembro (`Members $X`) + fila de ahorro | verde `#1a9e4b` | verde de miembro `#2fbf71` (la familia de siempre, legible sobre oscuro) |
| **Bloque de dinero** (subtotal / ahorro / total / apartado / resto) | bloque plano con filete negro `2px #111` | **LA TARJETA DESTACADA** — panel `#141414`, borde 2px `#e42535`, radio 20px, padding 16px — y la cifra del **apartado a 21px**, como la `.cart-due-card` de la v86; las cifras y sus `data-l`/`data-m` byte a byte |
| **Caja de unirse (joinBox)** | borde rojo 1px, radio 10px | la misma tarjeta destacada (`#141414`, 2px rojo, 20px) |
| Cajas de miembro/yarda activo, banner de invitación, avisos `joined` | verde claro `#eef7ee`/`#bfe3bf`, radio 10px | clave verde oscura `#0b2013`/`#1d5c38`, radio 20px (invitación 14px) |
| Nota de yarda + aviso `cancelled` | ámbar claro `#fff8e6`/`#ecd28f`, texto `#7a5b00` | **clave ámbar oscura** `#221a05`/`#6b5518`, texto `#ffcf4d` (la pareja de los paneles de pago de la v89) |
| Filas del selector de planes | blancas `#fff`, borde `#ddd`, radio 8px | campo oscuro `#1b1b1f`, borde `#33333b`, radio 14px |
| Campos (datos, cuándo, contraseña del join) | blancos, borde `#ccc`, radio 8px | `#1b1b1f`, borde `#33333b`, radio 14px, tinta `#e8e8ea` |
| Botones Pay / Pay balance | rojo, pastilla 999px, 16px | el mismo rojo de marca, **rectángulo del draft: radio 14px, 17px** (la v86) |
| Encabezados de éxito (pagado / apartado recibido) | verde `#1a7f37` | `#2fbf71` — el verde de éxito, en su clave oscura |
| Textos tenues (intro, notas, mensajes, pie) | `#555` / `#666` | el token tenue de la v89, `#a49d93` |

**Significados intactos:** la insignia sólida **FIRST MONTH FREE** (`#1a9e4b` con texto blanco) se deja como estaba — es una insignia sólida y se lee sobre cualquier fondo; los botones de pago conservan su rojo; la fila de ahorro sigue verde y sigue apareciendo solo cuando aplica el precio de miembro; el titular sigue siendo el precio de lista y el descuento su propio renglón (la regla de presentación asentada).

## 3. Lo que NO se tocó

- **Cero lógica**: rutas, el handler GET `/cart/<id>` y su verificación de retorno de Stripe, `depositSplit`, los totales, el join, el member-check, el flujo de apartado/saldo — byte a byte.
- **Cero palabras**: ambos diccionarios (EN/ES) intactos; ningún texto cambió.
- **Cero ids ni formas de datos**: `ctSubtotal`, `ctSaveRow`, `cartBigTotal`, `ctDeposit`, `ctBalance`, `payBtn`, `balBtn` y todos los `data-l`/`data-m` quedan donde estaban — el JS de la página (`renderAmounts`, `setLang`, el click de pago) no se tocó en una sola línea.

## 4. El 404 de la ruta también se oscurece

El `Cart not found` que sirve **la misma ruta** `/cart/<id>` era una paginita blanca suelta: gana el fondo `#0a0a0c` y la tinta clara en su `<body>`, con el texto byte a byte. El 404 de `/estimate/<id>` es **otra ruta** y queda fuera (ver §6).

## 5. Pins — `tests/run.mjs` (3 estáticos + 5 en vivo nuevos; 2 actualizados)

- **Estáticos (3)**, sobre el corte `cartFn91` de `cartPageHtml`: (a) la página nace oscura — primera pintura, metas `color-scheme`/`theme-color`, opciones nativas oscuras, body casi negro y la tarjeta panel de 20px bajo la cabecera negra; (b) el dinero es la tarjeta destacada **dos veces** (totales + joinBox) con el apartado a 21px, el vestido oscuro de campos y los dos botones de pago como rectángulo de 17px; (c) los significados viven en su clave oscura y **ninguna pintura clara del tema viejo sobrevive en la función** (`#eef7ee`, `#bfe3bf`, `#f1f1f1`, `#fff8e6`, `#ecd28f`, `background:#fff`, `color:#111`, el filete `2px #111`, `#ff4444`, `#555`, `#666` — todos fuera), y el 404 de la ruta viste la concha oscura.
- **En vivo (5)**, contra el servidor real de la suite: la página de invitado oscura con las cifras byte a byte ($250.00 / depósito $50.00 / resto $200.00); la página de miembro con su caja en clave verde oscura; la página cancelada en la misma concha oscura; las pastillas Labor/Materiales en su clave oscura sobre la página del escenario v52; y la página de apartado (deposit-paid) con su encabezado verde oscuro y su botón de saldo como rectángulo de 17px.
- **Actualizados (2+1):** los bumps de caché de siempre (`ghs-app-v91`), y el pin de la **v70** de la nota del join: esperaba el estilo con el texto tenue viejo (`display:none;color:#555`) — esa nota es una de las superficies repintadas en esta pasada, así que el valor esperado pasa al token tenue vigente (`#a49d93`), exactamente como la v89 actualizó el pin del token `--field-line` de la v28. El resto de esa aserción (la copia EN+ES del cobro único y su matemática) no se tocó. (Durante la verificación también se corrigió una cadena de los pins nuevos: el bloque `<style>` de la cabecera continúa con `:root{…}` antes de cerrar, así que los pins buscan el prefijo exacto que la página emite.)

## 6. Dejado fuera a propósito

- **`estimatePageHtml`** (la página pública `/estimate/<id>`), **`invitePageHtml`** y **`installPageHtml`** siguen en su estilo anterior: son otras rutas y otras pasadas si se ordenan — el alcance de la v91 es el carrito.
- **`workerBlockedPage`** (compartida por varias rutas) y las **plantillas de correo** (la familia `escMail`) no se tocaron: no son esta página.
- La **página de la app** (`index.html`) y el `manifest.json` no se tocaron — la v89 ya los dejó en la marca.

## Versión

- SW `CACHE = 'ghs-app-v91'` (ritual de versión; esta página no pasa por el SW).
- Archivos: `app/server.js` (solo la presentación dentro de `cartPageHtml` + el 404 de su ruta), `app/public/sw.js`, `tests/run.mjs`, este archivo.
- Sin cambios de precios, catálogo, textos, rutas ni flujos; el EN|ES de la página y su persistencia (`ghsCartLang`) intactos.
- **La fila de páginas públicas del servidor queda así:** carrito ✅ v91 · estimado, invitación e instalación quedan en su estilo anterior, registrados aquí como rezago conocido si algún día se ordena su pasada.
