# v106 — Empuje de membresía en el carrito + métricas del bot en admin (2026-11-15)

Orden de Gabriel: «armame la v6» — los dos pendientes de la lista de mejoras del 2026-11-14 (ítems ⑤ y ⑥): el empuje de membresía en el checkout con la frase exacta «con HomeCare te salía $X menos», y las métricas del asistente (bot) en el admin. **Cero cambios de precios, menú, depósitos o comportamiento de cobro.**

## 1) Feature 1 — Línea de ahorro HomeCare + CTA (solo NO-miembros)

Lo que ya existía (v80.3/v80.4, intacto): el «Members pay $X» en verde por línea, la fila «Members pay $M — save $S» en los totales, y la caja de invitación. Lo que faltaba: **la línea clara en dólares con la frase de Gabriel y un CTA real de join** — la caja era solo texto, sin link.

- `app.js` — claves CU nuevas (EN+ES, diccionarios espejo):
  - `cartHcSaveTpl`: EN «With HomeCare this job would cost you ${savings} less» · ES «Con HomeCare este trabajo te salía ${savings} menos»
  - `cartJoinCta`: EN «Join HomeCare — first month FREE →» · ES «Únete a HomeCare — primer mes GRATIS →»
- `renderCart()` (vista del carrito): dentro de la caja `auth-offer` existente — que **solo se pinta para NO-miembros con ahorro > 0** — se agregan la línea de ahorro en negrita y el botón-CTA rojo de marca a `#join-homecare` (el flujo de join existente; la landing `/homecare` queda como puerta alterna). El monto sale de `cartCalc().savings` = lista − miembro calculado de los precios de miembro REALES del catálogo por línea (nodisc/materiales nunca descuentan) — **ninguna matemática nueva que pueda derivar**.
- `renderCartTotalsDue()` (totales del checkout): la misma línea para el NO-miembro en checkout fresco (`!member && !joinOn && !cartPayCtx && savings > 0`), con el ahorro del quote del servidor (`cartQuote`) o de `cartCalc()`. Miembros y carritos con el join marcado ya llevan su fila de ahorro; un contexto de pago ya armado (saldo de una orden) nunca recibe el empuje.
- Reglas cumplidas: miembro verificado jamás ve la línea ni el CTA · ahorro = $0 (carrito solo materiales/nodisc) → no se pinta nada · mencionar el primer mes GRATIS es copy asentado y anunciable · display + link solamente.

## 2) Feature 2 — Métricas del bot en admin

- `server.js` — almacén perezoso `db.botStats` (patrón `trafficOf()` de v80.12): `{ since, conversations, carts, escalations }`. Incrementos en el evento exacto, vía `botStatsBump()`:
  - `conversations` — al crearse una sesión nueva del asistente (`assistantSession`): las sesiones viven en un Map en memoria, sin récord durable, así que **el conteo nace en v106 y el panel etiqueta su fecha de inicio** — jamás se inventa historia.
  - `carts` — en `assistantCreateCart()`, tras crear el carrito real.
  - `escalations` — en `assistantCreateCase()`, tras crear el caso.
- Endpoint nuevo `GET /api/admin/bot-stats` (solo admin, `requireRole`): devuelve los contadores con su `since` **más** los conteos históricos derivados de los récords que el sistema ya guarda (`recordedCarts` = carritos con source/createdBy `assistant`; `recordedCases` = requests con `assistantCase`) — cada vista etiquetada como lo que es.
- Admin (app.js + index.html): sección nueva «Assistant — bot funnel» tras Dinero, con host `#adminBotStats` y loader `loadAdminBotStats()` invocado en `loadAdmin()` junto a Tráfico/Dinero. Labels ADM106 EN+ES según el idioma de la app: «Bot funnel: N conversaciones → N carritos creados → N escalados a Gabriel», línea «Contando desde <fecha> (v106)» y la línea de récords históricos.

## Housekeeping

- SW cache → `ghs-app-v106`; los 3 pins de SW de la suite actualizados v105→v106.
- Tests nuevos (bloque v106, 14): línea + CTA visibles para no-miembro con carrito descontable (EN y ES, montos reales $68/$35 de cartCalc), ocultos para miembro verificado, ocultos con ahorro $0, línea en los totales del checkout fresco; endpoint admin-only, `since` ISO, conversación contada una sola vez por sesión (segundo mensaje no duplica), checkout del bot +1 carrito, escalación +1 (y su sesión nueva +1 conversación), conteos de récords derivados; estáticos de cableado.
- **Suite completo: 2,029 PASS / 0 FAIL, corrido DOS VECES** (baseline v105: 2,015; +14 nuevos).
- Sin jobs de fondo, sin mensajes salientes, sin cambios en data.json (los datos vivos mandan desde la nube, M24).

## Nota de publicación

- Snapshot de texto a GitHub main vía push_files con SOLO los archivos de este parche: `app/server.js`, `app/public/app.js`, `app/public/index.html`, `app/public/sw.js`, `tests/run.mjs`, este parche. Sin binarios en esta versión.
