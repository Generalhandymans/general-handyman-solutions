# V89-PARCHE — Tema global: la marca principal GHS en toda la app (2026-11-07)

Gabriel corrigió la dirección (17:05): el tema general de **toda** la aplicación no es el draft de /tecnico — es **la marca principal de General Handyman Solutions**, el mundo del logo y los flyers: superficies negras/oscuras, rojo de marca `#e42535`, tipografía blanca y fuerte. Del draft solo queda el parentesco: claridad, letras grandes, tarjetas grandes. Y su refuerzo, en sus palabras: **"No quiero que pase de negro a blanco. Si se va a hacer oscuro, que se mantenga oscuro."** Hasta la v88 cada superficie nueva vestía el idioma, pero el cromo **global** seguía mixto: el `body` era blanco (`--bg:#fff`) y la hoja de **Log in / Sign up** — tarjetas blancas, campos blancos, pastillas beige `#f0eee9` — salía CLARA sobre la vitrina oscura. Un cliente pasaba de la tienda negra a una hoja blanca y sentía **dos compañías**. La v89 unifica **solo el cromo neutro** (fondos, bordes, campos, hojas, fondos de modal y de mapa): cero cambios de comportamiento, ids, handlers, rutas, precios o textos. Suite: **1767 → 1771 PASS / 0 FAIL** (verificada dos veces) (4 pins nuevos v89 y 3 actualizados: los 2 bumps de caché de siempre y el token `--field-line` del pin v28, cuyo valor efectivo ahora es el oscuro).

## 1. Cómo se unificó — tokens volteados + un bloque v89 al final de la cascada

- **Los tokens compartidos se voltean a su valor oscuro** en un `:root` nuevo: `--bg:#0a0a0c`, `--soft:#101013`, `--line:#2a2a31`, `--field-line:#33333b`, `--muted:#a49d93`. Todo lo que ya colgaba de ellos cae solo al oscuro: bordes de tarjetas e hilos (`.thread`), miniaturas de fotos, filas del wizard (`.wz-mi`, `.wz-guide`, `.wz-sum`), celdas del estimado, días tenues del calendario, textos tenues (`.mut`, `.cal-dow`, `#techLinkRow`), el precio secundario de las tarjetas de plan. `--ink` NO se voltea a propósito: es el negro que pintan los estados activos y los botones negros — sus usos como *texto* sobre claro se reescriben uno a uno en el bloque.
- **Un bloque `<style>` v89, el último del `<head>`**, reescribe las superficies que traían el claro pintado a mano (detalladas en el inventario, §3). Las tarjetas pasan a `--panel-2:#17171b`; `.panel-dark` y `.plan-card` re-afirman su `--panel:#141414` en el mismo bloque para que ningún panel de marca pierda su tono exacto.
- **Los colores que SIGNIFICAN no se tocan**: el verde de ahorros/éxito del miembro (`#2fbf71` y su familia), el ámbar de propuestas/pendientes, los estados de color de la zona del técnico (v87) y el dinero verde/ámbar conservan su matiz. Donde el matiz venía en *clave clara ilegible sobre oscuro* (la pastilla ámbar de propuesta del calendario, los paneles ámbar de pago, los tintos rojos de error/urgente), el mismo matiz se presenta en su **clave oscura** — mismo significado, legible.

## 2. El refuerzo del propietario — oscuro de principio a fin, sin destellos

1. **Primera pintura oscura.** Un estilo crítico en línea abre el `<head>` — `<style>html,body{background:#0a0a0c}</style>` — y el bloque v89 fija el fondo en `html` y `body`: la página nace negra, antes de que cargue cualquier otra hoja o script. El **splash de la PWA** era el destello blanco real: `manifest.json` traía `background_color:"#ffffff"` → ahora **`#0a0a0c`** (`theme_color` ya era `#0b0b0b`, y el meta `theme-color` de la página ya era `#0b0b0b` — quedan como están).
2. **Controles nativos oscuros.** `color-scheme:dark` entra por CSS (`:root` del bloque v89) **y** por meta (`<meta name="color-scheme" content="dark">`): los desplegables nativos, los campos de fecha, las barras de scroll y el autofill se rinden oscuros. Es el arreglo directo de la captura de Gabriel: el selector de planes abría con **filas claras/lila** dentro del flujo oscuro — ahora las filas `option` también se pintan (`background:#1b1b1f;color:#e8e8ea`) para los navegadores que las estilizan.
3. **Transiciones sin pasar por claro.** Los fondos de modal ya eran oscuros y quedan verificados: `#appDlg` (`rgba(0,0,0,.62)`) y la ayuda de instalación (`rgba(0,0,0,.72)`); el panel del diálogo sí era blanco y ahora es `#17171b` (§3). El *overscroll* lo pinta el fondo de `html` — oscuro. Ningún cambio de sección, tab u hoja atraviesa una superficie clara.

## 3. Inventario de superficies — de claro a oscuro

| Superficie | Antes | Ahora |
|---|---|---|
| Base global (`body`, `html`) | fondo blanco `--bg:#fff`, texto casi negro | fondo `#0a0a0c`, texto `#e8e8ea`; enlaces `#9adcff` (el azul claro que la vitrina ya usa) |
| Tarjetas (`.card` — cliente, técnico, admin, legal, reset) | blancas, borde claro | panel `#17171b`, borde `--line` oscuro |
| Campos (`input`/`select`/`textarea`) | blancos, foco de borde casi negro | `#1b1b1f`, texto claro, **foco con borde rojo de marca + anillo** |
| Botones fantasma (`.ghost`) | blancos | `#1b1b1f`, texto claro, borde `#33333b` (su hover rojo de la v28 sigue) |
| Tabs genéricas / `.pick` / `.seg` | pastillas blancas, activa negra | pastillas `#1b1b1f`; activa/pick elegida/seg activa: negra con **borde rojo** — el activo se sigue leyendo de un vistazo |
| **Hoja de autenticación** (`#authBox`) | hoja blanca, riel de tabs **beige `#f0eee9`**, activa casi negra | hoja oscura como tarjeta; riel `#101013`; la tab activa es el **gradiente rojo de marca** (el mismo de los botones primarios); campos oscuros con foco rojo |
| Tarjeta de Stripe del join (`#cardElement`) | host blanco, texto del elemento en tinta oscura de Stripe | host `#17171b`; el elemento legado se pinta claro (§4) |
| Chat (`.msg`, hilos) | burbujas `--soft` claro | burbujas `#1b1b1f` |
| Documento estimado (`.estimate`) | cuerpo blanco, borde casi negro | cuerpo `#17171b`, borde `#2c2c33` (su cabecera negra con filete rojo ya era de marca) |
| Calendario de yarda (`.cal-*`) | días blancos; chips: pedido blanco, cancelado beige, propuesta ámbar claro | días `#17171b` (fuera de mes `#101013`); pedido `#1b1b1f`; cancelado `#26262a`; **propuesta conserva el ámbar** en clave oscura (`#2a2107`/`#ffcf4d`); agendado/hecho conservan su verde |
| Cómo funciona / Términos (`.step-body`, `.clause`) | tarjetas blancas, texto `#33302b`/`#26241f` | tarjetas `#17171b`, texto `#c9c4bc`/`#d8d4cc`, la línea de pasos en el borde oscuro |
| Panel de pago retenido (`.pay-panel` + su gemelo en línea de solicitudes) | ámbar claro `#fff8e6`/`#ecd28f` | **ámbar en clave oscura** `#221a05`/`#6b5518` — la misma pareja que la tarjeta de setup de Connect ya usaba |
| Estados vacíos (`.empty`), errores (`.err`), oferta del auth (`.auth-offer`) | `--soft` claro / rojo claro `#fff1f0` / rosa claro `#fff7f7` | `#101013` / tinto rojo oscuro `#2a0d10` con texto `#ff9aa2` / tinto rojo oscuro `#1c0e11` |
| Carrito/checkout (bordes de línea, qty, quitar, host del Payment Element) | `#eee`, `#d4d4d8`, rojo oscuro `#b91c1c`, host blanco | `#26262a`, `#3a3a3a`, quitar en `#ff7079` (el rojo de quitar, legible), host `--panel-2` |
| Diálogo de la app (`#appDlg`) | panel blanco, campo con borde `#ccc` | panel `#17171b`, borde del campo `#33333b` |
| Notificaciones | filas con borde `#eee`; urgente sobre `#fff3f3` | borde `#26262a`; **urgente conserva el tinto rojo** en clave oscura `#2a0d10` |
| Mapas (seguimiento + admin) | fondo beige `#e9e5df`, nota de carga blanca, cromo Leaflet claro | fondo `#17171b`; nota oscura con texto claro; **cromo Leaflet oscuro** (popup, punta, barra de zoom, atribución). Los *tiles* del mapa son imagen — como las fotos del menú, no son cromo |
| Tarjeta de cuenta borrada (éxito) | verde claro `#f3fbf3` | **verde en clave oscura** `#0b2013`/`#1d5c38` — la misma pareja de la tarjeta "payouts on" |
| Fondos de foto (avatar, pin del mapa) | `background:#fff` tras la foto circular | `#1b1b1f` |
| Panel de fallo de Stripe del carrito | rojo claro `#fef2f2`, textos `#b91c1c`/`#991b1b` | tinto rojo oscuro `#2a0d10`, textos `#ff9aa2`/`#ff8a94` |

**Ya eran oscuros y no se tocaron:** la vitrina `#oldhome` completa, el header, el menú y sus tarjetas, la parrilla de comparación, los paneles de membresía (`.cg-card`, `.plan-card`, `#ghsMemberships`), el panel de links (`.share-panel`), el resumen destacado del carrito (`.cart-due-card`), las tarjetas de clase (`.wclass-card`), las cifras del técnico (`.wstat-card`), el wizard en su mayor parte, el toast del carrito y el pie. La pastilla blanca `.go` dentro de las promos oscuras de la vitrina es un chip de contraste **diseñado así** (blanco sobre tarjeta oscura, texto negro) — se revisó y se deja: es un botón, no una superficie.

**Queda fuera de esta versión (el rezago conocido):** la página pública del link **`/cart/<id>`**, que se sirve renderizada desde `app/server.js` — prohibido en esta pasada; es la siguiente en la fila. Las páginas alojadas por Stripe (checkout, portal, Connect) son documentos de Stripe, no de la app.

## 4. Valores de pintura JS tocados (cada uno, señalado)

La brief manda CSS/markup; estas superficies pintan su color **desde JS**, así que el valor se ajustó ahí — solo el color, ninguna lógica:

- **Stripe Payment Element** (checkout del carrito): `appearance.theme 'stripe'` → **`'night'`** — el tema oscuro oficial de Stripe para el iframe de pago; `colorPrimary` rojo y el radio quedan.
- **Elementos de tarjeta legados** (el del join en `mountAuthCard` y el de pago de saldo en solicitudes): su `style.base` gana `color:'#f2f0ec'`, `iconColor:'#9a968f'` y `'::placeholder':{color:'#8f8a81'}` — sin eso, la tinta oscura por defecto de Stripe quedaba ilegible sobre el host oscuro.
- **En línea en plantillas JS:** host de `#reqCard-…` (`#fff`→`#17171b`), panel de pago de solicitud (ámbar claro→ámbar oscuro), tarjeta de cuenta borrada (verde claro→verde oscuro), filas de notificación (borde + urgente), fondos de mapa ×2 y su nota de carga, caja de fallo de Stripe del carrito (fondo + 2 textos), fondos de foto del avatar y del pin del mapa.
- **En el markup:** el host `#cardElement` del join y el panel + campo de `#appDlg`.

## 5. Pins — `tests/run.mjs` (4 nuevos + 3 actualizados)

- **Nuevos (4 estáticos):** (a) la base global es la marca oscura — tokens volteados, `color-scheme:dark`, body casi negro con tinta clara, tarjetas en el tono panel, campos oscuros; (b) la hoja de auth viste la marca — riel oscuro, tab activa en gradiente rojo (las genéricas quedan negras con borde rojo), foco rojo, host de Stripe oscuro y los elementos legados pintados claro-sobre-oscuro; (c) dinero y significado en clave oscura — Payment Element en tema `night` y ningún `theme:'stripe'` sobrevive, paneles ámbar, tintos rojos, chip ámbar del calendario, diálogo oscuro, fondos de mapa oscuros y ninguna pintura clara de JS sobrevive (`#e9e5df`, `#fff3f3`, `#f3fbf3` fuera); (d) oscuro desde la primera pintura y en los controles nativos — estilo crítico en el `<head>`, metas `theme-color`/`color-scheme`, opciones oscuras y cromo Leaflet oscuro.
- **Actualizados (3):** los 2 bumps de caché de siempre (`ghs-app-v89`) y el pin de tokens de la v28: `--field-line` pasa de `#d8d2c8` a **`#33333b`** porque ese es ahora el valor efectivo del token (la declaración original queda en su capa y el `:root` de la v89 manda en la cascada) — el resto del pin (la capa v28, `--panel`, `--green`) no se tocó.
- Ninguna aserción se debilitó; ningún pin de comportamiento cambió — los flujos de auth, join (incluido el FREE de la v88), carrito y pago pasan por los mismos escenarios de VM de siempre, ahora sobre el tema oscuro.

## Versión

- SW `CACHE = 'ghs-app-v89'`.
- Archivos: `app/public/index.html`, `app/public/manifest.json` (solo `background_color`), `app/public/sw.js`, `tests/run.mjs`, este archivo. **`app/server.js` NO se tocó.**
- Sin cambios de precios ni de catálogo; las fotos del menú y el logo, intactos; los seis botones de unirse y los flujos pagados/gratis, byte a byte en comportamiento.
