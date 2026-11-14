# v103 — FOTOS EN EL CARRITO DENTRO DE LA APP + AUDITORÍA DEL FLUJO DEL CLIENTE

Orden de Gabriel (2026-11-14): «Trabaja en la app, ve los fallos.»
Cierra el pendiente que el addendum de publicación de v102 dejó anotado:
el carrito DENTRO de la app (SPA) listaba las líneas sin fotos.

## El arreglo

- `app/public/app.js`
  - `renderCart()` (la vista del carrito dentro de la app): cada línea
    ahora abre con `svcImgHtml(l.id, grupo, 'cart-line-img')` — la misma
    foto `/menu-img/<id>.webp?v=4` del menú y de la página pública del
    carrito (v102). Las líneas de `cartCalc()` siempre traen un id de
    catálogo (`cartLoad` filtra a `MENU_CATALOG`), así que toda línea de
    este carrito es de catálogo y lleva su foto; si un archivo faltara,
    `svcImgHtml` cae a la foto de su categoría — nunca una imagen rota.
  - `renderCcLines()` (las líneas del checkout dentro de la app): el
    mismo thumbnail, misma clase. Es la otra mitad de la misma superficie.
  - Las líneas custom (materiales/fees/travel) NO existen en este
    carrito local — viven solo en los carritos de servidor, cuya página
    pública ya quedó resuelta en v102 (custom sin foto, por diseño).
  - La vista de propuestas dentro de la cuenta enlaza al mismo objeto
    `/cart/CRT-…` (link y propuesta en la cuenta son el mismo objeto),
    así que también ya enseñaba fotos desde v102.
- `app/public/app.css` — `.cart-line-img{width:54px;height:54px;object-fit:cover;border-radius:10px;flex:none;background:#26262a}` (mismo tamaño que la página pública).
- `app/public/sw.js` — cache `ghs-app-v103`.
- Montos, depósito, When, checkout y textos: intactos. Presentación pura.

## Auditoría del flujo del cliente (menú → carrito → checkout → When → panel)

Corrida con scripts contra el árbol (además de la suite):

- **Precios:** SERVER_MENU (102) vs MENU_CATALOG del cliente (102):
  deriva **0** en precio de lista y de miembro, id por id.
- **Ley de miembro:** en los 102 servicios, miembro = 80% exacto de la
  lista (0 excepciones) — el −20% es solo labor; la paridad de add-ons
  servidor↔cliente (precio y `nodisc`) también salió en 0 diferencias.
- **Depósito:** `depositSplit` — $50 fijos hasta $300, 40% arriba; los
  pins de la suite lo cubren en carrito público, SPA y bot.
- **Fotos:** las 102 `.webp` del menú existen en disco (0 faltantes) —
  el carrito interno depende de las mismas que el menú.
- **Bot:** las 40 rutas de `ASSISTANT_ROUTES` existen todas en
  SERVER_MENU (0 ids colgando); cortinas y persianas ya cotizan
  $85/$68 desde v102. El resto del menú (62 servicios) no tiene ruta de
  palabras — es el diseño aprobado de la spec (problema en palabras →
  servicio; lo demás cae a menú/oficio o escala), no un fallo nuevo.
- **When → panel:** cubierto por la suite (el When llega a la solicitud,
  al panel admin y al email), sin cambios en esta corrida.

Sin bugs de plata encontrados: nada que detuviera la publicación.

## Pruebas

Suite completa contra este árbol (copia con `APP_DIR` →
`ghs-app-fusion/app`, como en v101/v102):

- **Corrida 1: PASS 1989 / FAIL 0**
- **Corrida 2: PASS 1989 / FAIL 0**

(baseline v102: 1985 → +4 pins v103: foto renderizada en la vista del
carrito, totales SPA de cortinas exactos $170/$136, foto en las líneas
del checkout, pin estático de `svcImgHtml(l.id, …)` + `.cart-line-img`;
los 3 pins de cache SW se actualizaron v102→v103.)

## Ruta de publicación

Snapshot a GitHub `main` SOLO con los archivos de código de este parche
(app/public/app.js, app/public/app.css, app/public/sw.js, tests/run.mjs,
este parche). `app/server.js` y `app/public/index.html` no cambiaron.
`app/data.json` NO viaja (datos vivos mandan desde la nube, M24) y
ningún asset se toca.
