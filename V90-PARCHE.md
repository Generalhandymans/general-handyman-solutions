# V90-PARCHE — El admin habla el idioma de la marca + propuestas dormidas visibles (2026-11-07)

La v89 unificó el cromo global, pero el **panel del Team** seguía con la densidad vieja: tarjetas al radio global de 16px, rótulos de sección sin tratamiento, y la insignia de clase de la v84 (TÉCNICO negro / AYUDANTE dorado) como una pastilla genérica más — el negro se perdía sobre la tarjeta oscura. Y las **propuestas dormidas** (carritos enviados que nunca dejaron depósito — los $1,390 parados en 4 propuestas que Gabriel conoce de memoria) vivían enterradas en la lista de carritos, en orden del servidor, sin edad y sin cifra de depósito: imposibles de trabajar de un vistazo. La v90 pule la superficie admin con el idioma asentado en v85–v87 y vuelve las dormidas **visibles y accionables** — presentación pura. Suite: **1771 → 1780 PASS / 0 FAIL** (verificada dos veces) (4 pins estáticos nuevos + 5 de VM nuevos, y los 2 bumps de caché de siempre actualizados). **`app/server.js` NO se tocó** — ver §3.

## 1. Cromo admin — un bloque `<style>` v90, el último de la cascada

- **Tarjetas del admin a 20px** (`#adminBox .card{border-radius:20px;padding:20px}`) — el mismo lenguaje de tarjeta de la vitrina (v85), el checkout (v86) y la zona del técnico (v87).
- **Rótulos de sección con tratamiento**: `#adminBox h2` a 22px/800 y cada `#adminBox h3` a 18px/800 con **barra roja de marca** a la izquierda (`border-left:4px solid var(--red)`) — cada sección del control center se encuentra de un vistazo.
- **La navegación del admin** (`#admNav`) pasa a chips: pastillas de 40px mínimo, radio completo, texto 700 — blancos de toque de tamaño real en el teléfono.
- **La superficie Money lidera con su tarjeta destacada**: la primera tarjeta de `#adminMoney` (los depósitos en espera — la cifra que Gabriel busca primero) gana el panel `#141414` con borde de 2px rojo, la misma tarjeta destacada del resumen del carrito (v86) y de las ganancias del técnico (v87); el resto de las tarjetas de Money toman el radio de 20px. **Ninguna cifra, etiqueta ni orden cambió** — los textos salen de ADM812 como siempre.
- Las pastillas dentro del admin ganan peso (800 + tracking) para leerse sobre el panel oscuro.

## 2. La insignia de clase de la v84 — pulida, no repintada

La pastilla de clase en la tarjeta del trabajador gana la clase propia **`wclass-pill`**: borde `#3a3a41` + tracking `.05em` para que el **negro del TÉCNICO se lea sobre la tarjeta oscura**, y borde dorado `#e8c766` en la variante **AYUDANTE**. Los colores de fondo de la v84 (`#0b0b0b` / `#8a6d1a`), el texto blanco y las palabras TÉCNICO/AYUDANTE quedan **byte a byte**; el filtro de clase y los botones Make TÉCNICO/AYUDANTE no se tocaron.

## 3. Superficies claras sobrevivientes dentro del admin — eliminadas

- **El banner de edición de carrito** (`#cartEditBanner`) era ámbar CLARO (`#fff4d6`/`#e3c878`) sobre el panel oscuro → pasa a la **clave ámbar oscura de la v89** (`#2a2107`/`#8a6d00`, texto `#ffcf4d` — la misma pareja del chip de propuesta del calendario), radio 14px.
- **Tres filetes claros** `border-top:1px dashed #ddd` en plantillas que pinta el admin (el bloque "Post as a job" de solicitudes, la línea de scheduling de facturas y el formulario de edición de trabajador) → `#33333b`, el token de filete oscuro de la v89.
- **Dejado a propósito (fuera de alcance):** queda UN filete `#ddd` en `#anonContact` — vive en la vista pública de solicitud del CLIENTE, no en el admin; es un filete de 1px, no una superficie, y esta pasada es solo del admin.

## 4. Propuestas dormidas — visibles y accionables (solo presentación)

**El hallazgo que evita tocar el servidor:** `GET /api/admin/carts` ya exponía todo lo necesario — `publicCart` trae **`createdAt`** desde siempre. La edad y el depósito se derivan en el cliente; **no hay endpoint nuevo ni campo nuevo**.

En `loadAdminCarts`:

- **Tarjeta resumen destacada** (`.adm-dormant` — panel `#141414`, borde 2px rojo, radio 20px) al frente de la lista, solo cuando hay carritos `open`: cuántas propuestas esperan, **cuánto hay en depósitos por cobrar** y cuánto trabajo abierto representan, con el conteo de **stale (7d+)** cuando aplica. "Follow up top-down" — la lista de abajo ya viene en ese orden.
- **Orden nuevo (solo presentación):** los `open` van primero, **el más viejo arriba**; pagados y cancelados conservan su orden relativo y su tarjeta byte a byte debajo.
- **Por carrito abierto:** pastilla **⏰ STALE · Nd waiting** (pareja rojo-oscuro de error de la v89) a los **7+ días**, y una línea ámbar `.adm-age` — **⏳ Waiting N days — deposit to book $X** (· member $Y cuando difiere).
- **El depósito pintado es la ley asentada, espejada**: $50 plano si el total es ≤ $300, 40% arriba — la misma fórmula de `depositSplit` (servidor) y de `cartDepositEstimate` (cliente). Es pintura para decidir el seguimiento; **ningún cargo, precio ni total cambia**: lo que el cliente paga sigue saliendo de los rieles de siempre en su página.
- Las tarjetas pagadas/canceladas no ganan ni pierden una palabra: insignia, línea de `payState`, ajustes y botones (Copy link / Edit / Adjust balance / + Travel $25 / Cancel cart) intactos — lo pinza el escenario de VM.

## 5. Pins — `tests/run.mjs` (4 estáticos + 5 VM nuevos; 2 actualizados)

- **Estáticos (4):** (a) el admin viste el lenguaje asentado — tarjetas 20px, h3 con barra roja, chips de navegación y la tarjeta destacada de Money + la clase `.adm-dormant`; (b) la insignia de clase pulida con sus colores/palabras de la v84 byte a byte; (c) ninguna superficie clara sobrevive en el admin — el banner en clave ámbar oscura y ningún `border-top:1px dashed #ddd` en el archivo; (d) las dormidas se pintan de datos que el admin YA recibe — `createdAt` expuesto en `publicCart`, edad derivada, STALE a 7+, orden open-primero y la fórmula de depósito asentada en el render.
- **VM (5):** un escenario nuevo corre `loadAdminCarts()` contra un stub de `/api/admin/carts` (ruta nueva en el `fetchStub`, alimentada por `stubAdminCarts`) con 4 carritos — pagado, dormido de 10 días ($450/$360), fresco de 2 días ($200/$160) y cancelado — y pinza: la tarjeta resumen al frente con las cifras exactas (2 esperando · **$230.00** en depósitos · **$650.00** en trabajo abierto · 1 stale); el orden dormidas-primero con la más vieja arriba; la pastilla STALE única y la línea de espera con la ley exacta (40% de $450 = **$180.00** · miembro **$144.00**); el depósito plano de **$50.00** en el nivel ≤$300 sin desdoble de miembro; y el contenido de las tarjetas pagada/cancelada byte a byte como antes. (Las fechas del stub se calculan desde el **reloj falso de la VM**, no desde el reloj real del proceso — con el reloj real la edad salía 0 y el escenario lo cazó.)
- **Actualizados (2):** los bumps de caché de siempre (`ghs-app-v90`).

## Versión

- SW `CACHE = 'ghs-app-v90'`.
- Archivos: `app/public/index.html`, `app/public/sw.js`, `tests/run.mjs`, este archivo. **`app/server.js` NO se tocó.**
- Sin cambios de precios ni de catálogo; ningún id, handler, ruta ni flujo cambió; el admin sigue hablando inglés como siempre (sus cadenas nunca fueron i18n).
- **Rezago conocido (sin cambios):** la página pública del link `/cart/<id>` sigue en su estilo anterior dentro de `server.js` — es la siguiente pasada, como quedó declarado en la v89.
