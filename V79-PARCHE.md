# v79 — BLINDAJE (P0 de la Auditoría General + Propuestas en la cuenta + Ley de Apartado final)

**Estado:** construida y verificada en local — **suite completa 984/984** (la v78 cerró en 954; +30 pruebas netas). **SIN PUBLICAR** — espera el visto bueno de Gabriel y la corrida de confirmación del agente principal.

**Origen:** orden de Gabriel "arréglame todo" (2026-10-25 21:45) sobre la `AUDITORIA-GENERAL-2026-10-25.md`, sus pedidos de las 21:59–22:00 (propuestas dentro de la cuenta) y su **ley de apartado final** deliberada en dos pasos (22:11 → 22:12, con precisión de ejemplo a las 22:15).

---

## PIEZA 1 — P0-1: el capitán ya no ve el total del cliente

**Antes:** la notificación de override al capitán decía *"Captain override: 5% of the $X charged on job…"* y `GET /api/me/captain` devolvía `charged` en cada asiento del ledger — el capitán veía cuánto se le cobró al cliente (contra la regla de oro: nadie fuera del cliente y Gabriel ve el total del cliente; el propio comentario del código prometía lo contrario).

**Ahora:**
- La notificación dice solo SU dinero: *"Captain override accrued: $X on job … (Area). The Team pays overrides out by hand."*
- `/api/me/captain` ya no incluye `charged` en los asientos: el capitán ve sus propios montos (override acumulado/pagado) y conteos, nada del cliente.
- El campo `charged` sigue existiendo SOLO en el registro interno del ledger y en el payload de admin (`captainsAdminPayload`) — Gabriel sí lo ve; es exactamente la corrección que pedía la auditoría.

**Pruebas:** pin estático nuevo — el slice del handler `/api/me/captain` no contiene `charged:`, la notificación nueva existe y la frase vieja ("of the job total charged") desapareció del servidor.

## PIEZA 2 — P0-2: la frontera de rol ahora es real (no solo visual)

**Antes:** la separación cliente/técnico era cosmética — un técnico con sesión podía abrir `#order/*`, `#memberships`, links de carrito/estimado y ver precios de cliente; el servidor no distinguía.

**Ahora:**
- **Servidor:** helper `workerSessionBlocked()` + página temática bilingüe de rechazo (403) en `GET /cart/:id` y `GET /estimate/:id` cuando la sesión es de técnico (el invitado con link — la puerta del cliente — y el cliente/admin pasan libres). Los POST de dinero quedan bloqueados con 403 `{code:'WORKER_BLOCKED'}`: `/api/carts/:id/{member-check, pay, pay-confirm, checkout}` y `/api/estimate` (aprobar/rechazar/opción/join/member).
- **SPA:** guarda en `render()` — sesión de técnico en `#order/*`, `#memberships` o `#cart` → regresa a `#worker` con tarjeta bilingüe (`#roleNote`): *"That page is for customers — your zone shows only your jobs, your pay and your payouts / Esa página es para clientes — tu zona muestra solo tus trabajos, tu paga y tus pagos."*

**Pruebas:** sesión real de técnico contra app2 — GET carrito 403 con la página temática, POST checkout 403 `WORKER_BLOCKED`, GET estimado 403; invitado con link 200 en ambos; pin estático de la guarda del SPA.

## PIEZA 3 — P0-5: páginas fantasma retiradas

**Antes:** `service.html`, `checkout.html` y `tracking.html` vivían en la raíz del website (200) con un checkout de demostración falso y textos de "paga al terminar" bajo la marca real.

**Ahora:** las tres son **stubs de redirección temática** (meta refresh + JS + botón, en los colores de la casa) hacia `https://app.generalhandymans.app/`. Los dos enlaces entrantes reales en `index.html` del website (tarjetas `oa-card`) se reapuntaron a la app. Sin referencias vivas restantes fuera del archivo interno.

**Pruebas:** pines v79 — las tres contienen el refresh + la URL de la app y NINGÚN rastro del demo (`bigPrice`, "Pay when", `data-price=`); las pruebas v43 que pineaban su contenido de precios se reescribieron como pines de redirección (ver "Pruebas reescritas").

## PIEZA 4 — P0-6: Términos alineados a la ley actual

**Antes:** la cláusula 4 de los Términos in-app decía el modelo viejo — *"paid in full when you order… an approved estimate is paid in full to book — one charge"* — y la tarjeta de paso 4 del "cómo funciona" decía *"Pay in full when you book"*.

**Ahora (cláusula 4 reescrita, "How payment works — deposit + balance"):**
- Todo trabajo se agenda con **apartado: $50 fijo en trabajos de hasta $300, y 40% del total en trabajos de más de $300** (en miembros, el nivel se juzga sobre su total con descuento).
- El **saldo se paga al terminar** el trabajo — en la app o en el mismo link que mandó el Team.
- Las membresías son suscripciones, no apartados, y se cobran completas cada mes.
- Cancelación sin cambio: antes de despachar, reembolso total de lo pagado; despachado, **$75 no reembolsables**.
- La cláusula 3 (fee de estimado en persona) gana una frase aclaratoria: ese fee **no** es el apartado del trabajo (el hold del fee es un mecanismo real y se queda). **La cláusula 10 (intermediario / no compartir números) quedó intacta, palabra por palabra.**
- Tarjeta de paso 4 → *"Book with a deposit"*; paso 7 → el saldo se paga al terminar; `menuIntro` (HTML + diccionario EN/ES del menú) con la regla nueva.

**Pruebas:** pin estático — los Términos contienen "$50 flat on jobs up to $300" y "40% of the total on jobs over $300"; no queda "paid in full to book" ni "Pay in full when you book"; la cláusula 10 sigue presente.

## PIEZA 5 — P0-7: medición del sprint (fuente de adquisición)

**Antes:** solo se capturaba `src` y se promovía al activar membresía; sin eventos ni forma de calcular el costo por cliente del anuncio.

**Ahora (sin analítica externa, todo en casa):**
- Helper `acquisitionSource()`: acepta `source`/`src` como antes y además pliega `utm_source/medium/campaign` (saneados, ≤24 caracteres); `stampUserSource()` lo fija en la cuenta — **primer toque gana, nunca se sobrescribe**.
- Se estampa en: el **registro** (`/api/signup`), la **primera orden** (`POST /api/requests` toma la fuente de la cuenta y la promueve si faltaba), el **checkout del carrito** (la orden sellada hereda `pc.source`) y la activación de membresía (la ruta v24, ahora alimentada por el mismo helper).
- El SPA reenvía `source: campaignSource()` en registro, wizard y checkout del carrito, y `captureCampaignSource()` también captura parámetros utm.
- **Resumen para admin:** `GET /api/admin/source-summary` → filas `{source, customers, orders, members}` ordenadas; sección **"Sources — where customers come from"** en el admin con la tabla y la nota de cómo se calcula el costo por cliente. Costo/cliente = gasto del anuncio ÷ clientes de esa fuente — ya es computable.

**Pruebas:** registro con `source: meta_ads_oct` + orden posterior con otro source → el resumen cuenta al cliente y su orden bajo `meta_ads_oct` (primer toque gana); registro con utm → fila `google_cpc_fall`; el resumen es solo-admin (403 a cliente).

## PIEZA 6 — PROPUESTAS EN LA CUENTA (Gabriel, 2026-10-25 21:59–22:00)

**Pedido:** todo carrito/estimado que Gabriel le manda a un cliente debe verse **dentro de su cuenta** al iniciar sesión — el link del correo y la propuesta en su login son **el mismo objeto** — con tres opciones: **Aceptar → checkout de esa propuesta · Seguir comprando (la propuesta espera; su carrito propio es aparte) · Guardar para después** (estacionada en su cuenta, sin presionar).

**Ahora:**
- El admin puede guardar el **correo del cliente** en el carrito (campo nuevo en el constructor; también se precarga al editar). `publicCart` lo expone.
- Matching servidor: `cartProposalEmail()` (correo del carrito → correo capturado en el checkout → correo de la invitación ligada) y `proposalBelongsTo()` (estimados: `customerId` o correo).
- `GET /api/me/proposals` (solo clientes): carritos **abiertos** (con su apartado según la ley, calculado con `depositSplit`) + carritos **ya apartados con saldo pendiente** (estado `booked`, saldo real del registro de pago); estimados **cotizados y vigentes** (apartado = su `bookingDue`). Estado `saved` por cuenta en `savedForLaterBy`; orden: guardadas al final, luego más nuevas.
- `POST /api/me/proposals/(cart|estimate)/:id/save-later` — 404 si la propuesta no es de esa cuenta; auditado (`proposal.save_later`).
- **SPA:** sección **"📩 Proposals from the Team"** arriba de "My requests" en la cuenta del cliente: tarjeta por propuesta con total, apartado/saldo (o saldo si ya está apartada) y los **tres botones** — Aceptar va al MISMO link (`/cart/…` o `/estimate/…`); si ya está apartada, el botón es **"Pay balance"** sobre el mismo link; Seguir comprando oculta la tarjeta por la sesión y baja al menú; Guardar para después / regresarla.
- Consistencia link↔cuenta probada extremo a extremo: pagar por el link voltea la propuesta en la cuenta a `booked` con el mismo saldo (es el mismo registro).

**Pruebas:** carrito dirigido al correo de la cuenta aparece adentro (apartado $50/saldo $75 en un $125); save-later persiste y se refleja; otra cuenta no ve nada y recibe 404 al intentar guardarla; tras pagar el depósito por el link, la propuesta interna dice `booked` con saldo $75; un estimado enviado aparece con su `bookingDue` ($50 por la ley).

## PIEZA 7 — Retiro de la página legada `#order/<servicio>` (P0-4/P0-3)

**Antes:** la página v32 creaba la orden **antes** de cobrar y cobraba por un checkout distinto (Card Element legado) — el hueco P0-4 y la mitad de P0-3. Sus botones vivían en el menú y en el wizard.

**Ahora:**
- Los botones **Order** del menú y del wizard llaman `orderNow(id)`: agregan el servicio al carrito persistente y aterrizan en `#cart` (checkout embebido v78, donde la orden nace SOLO tras verificar el pago).
- La **ruta** `#order/<id>?x=…&nm=…` (links viejos, los botones del website) se convierte al llegar con `retireOrderRoute()`: servicio + **add-ons validados contra el catálogo** entran al carrito (`cartAddWithAddons`, misma forma de línea `{id, q, x}` del carrito), y los campos de contacto del handoff (nm/ph/ad/cy/wt/n) se guardan en `sessionStorage ghsCcPrefill` y se **precargan en el checkout** (`applyCcPrefill()` al abrirlo).
- El HTML `orderBox` y todo el JS legado (`orderState`, `renderOrder`, `submitOrder`, `orderTotalsCalc`, `ensureOrderStripe`…) **se eliminaron**. Los endpoints de servidor `/api/orders/pay` + `/pay-confirm` **se quedan** — son los rieles del panel de pago de las órdenes y, con la pieza 8, la ruta de cobro del saldo self-serve.

**Pruebas reescritas (nunca borradas sin reemplazo equivalente — detalle abajo):** el bloque v34 del handoff ahora prueba la conversión a carrito + prefill del checkout; las reglas v42 de "llegar al #order" prueban el aterrizaje en `#cart` con el servicio adentro (cliente y visitante); los totales v43 y la matriz v46 corren sobre `cartCalc` con la misma fórmula del catálogo.

## PIEZA 8 — LEY DE APARTADO FINAL (Gabriel, 2026-10-25 22:12 + precisión 22:15)

**Ley:** el apartado de TODO trabajo = **$50 fijo si el total final es ≤ $300; si el total pasa de $300, el apartado = 40% del total**; el saldo al terminar. **Nunca más que el total.** El nivel se juzga sobre el **total final ya con el descuento de miembro aplicado** — ejemplo de Gabriel: miembro con tres servicios de $125 paga $100 c/u = $300 → aparta con $50. Las membresías NO son apartados (sin cambio) y el fee de estimado en persona ($75 / miembro $50, acreditable el mismo día) es aparte (sin cambio). Cancelación sin cambio.

**Implementación — UNA sola función compartida:**
- `depositSplit(totalCents)` en el servidor es ahora la única fuente: total ≤ $300 → `min($50, total)`; total > $300 → `round(40%)`. La usan: el **checkout del carrito self-serve** (v78), los **carritos de admin** (página + sesiones de Stripe + notas de join) y los **estimados** (`bookingDue` automático + variante de miembro).
- **El carrito self-serve deja de cobrar completo:** el PaymentIntent se crea por el **apartado**; la orden nace en estado **DEPOSIT** (`recordRequestDeposit`, kind `cart-checkout`) — el pago al técnico y el override de capitán siguen esperando al saldo, como manda el dinero. Si el total es ≤ $50, el apartado = total y la orden nace pagada (sin saldo fantasma).
- **Ruta del saldo self-serve:** `/api/orders/pay` sobre una orden en DEPOSIT cobra **solo el saldo**; `/api/orders/pay-confirm` (y el webhook de respaldo) lo liquida con `settleRequestBalance()` — voltea a **pagado en total** guardando **las dos patas** (apartado + saldo, cada una con su PI), avisa a cliente y admins, y le da a cualquier trabajo ya terminado su pago/override. Los reembolsos de estas órdenes corren por pago (dos fuentes), sin doble conteo.
- **Textos:** la página de carrito dice "booking deposit" con la regla explícita ($50 hasta $300; 40% arriba de $300) en EN/ES; el checkout del carrito muestra **Total / Deposit due today / Balance at completion**; el botón cobra el apartado ("Pay $X deposit"); la confirmación dice *"Deposit paid — your job is booked. The balance of $Y is due when the work is done"*; el menú y los Términos (pieza 4) dicen la misma ley.

**Pruebas (los pines que pidió Gabriel, por comportamiento real contra Stripe mock):**
- $75 → $50/$25 · $125 → $50/$75 · $250 → $50/$200 · **$300 → $50/$250** · $540 → $216/$324.
- **El ejemplo exacto de Gabriel:** 3 × $125 como miembro (total final $300) → apartado **$50**.
- Un estimado de $250 aparta a $50 por el mismo helper.
- Carrito self-serve de $125: paso de pago cotiza apartado $50/saldo $75 → la orden nace **DEPOSIT** ($50 de $125) → `/api/orders/pay` cobra solo $75 → `pay-confirm` la voltea a **pagada en total** con ambas patas registradas.

**⚠ ÚNICO CAMBIO EN UN CARRITO VIVO:** de los carritos enviados y aún abiertos, solo **CRT-FF4FAB (Nicole, $250 / miembro $200)** queda bajo el nivel plano: su apartado baja de $100/$80 a **$50** (el total no cambia; el saldo sube en la misma cantidad). Es consecuencia directa de la ley nueva — su link ya muestra el número nuevo. CRT-F05580 ($2,100), CRT-1FEBCC ($900), CRT-E2F6C7 ($350 → 40% = $140) no cambian; el de Brijesh ya está apartado y su saldo quedó registrado al pagar (no se recalcula).

---

## Pruebas reescritas por la v79 (cobertura reemplazada, nunca borrada en silencio)

| Prueba | Antes | Ahora |
|---|---|---|
| Pin del SW (línea 34) | `ghs-app-v78` | `ghs-app-v79` |
| v32 gate de descuento | `orderState.memberActive = me.homeCareStatus…` (página retirada) | `cartIsMember()` + `me.homeCareStatus === 'active'` (la puerta del carrito) |
| v44 estático de copy | "Total — pay in full today" | "Deposit due today" + "Balance at completion" (ley de apartado) |
| v44 web | `checkout.html` contiene "Paid in full today" | `checkout.html` es redirección (`http-equiv="refresh"`) |
| Marcadores de catálogo (×2) | slice hasta `let orderState` | slice hasta el banner v79 |
| v34 handoff | params precargan el form `#order` | params → carrito (con add-on validado) + prefill del checkout `#cart` |
| v42 menú / wizard | botones enlazan a `#order/<id>` | botones llaman `orderNow('<id>')` → carrito |
| v42 reglas de ruta | cliente/visitante llegan al checkout `#order` | convierten a `#cart` con el servicio en el carrito |
| v43 web service/checkout | precios pineados en las páginas demo | pines de redirección v79 (P0-5) |
| v43 totales (VM) | `orderTotalsCalc` en la página retirada | `cartCalc` — mismos valores (aceite 75/60, junk 225/180, full 520, green 180, TV+raceway 175/140, toilet+haul 190) |
| v46 matriz (VM) | `orderTotalsCalc` × 98 × 6 combos (con ASAP) | `cartCalc` × 98 × 4 combos (miembro × add-ons; **los combos ASAP se retiran porque el carrito no tiene ASAP** — la cobertura del recomputo de servidor de abajo quedó intacta) |
| v43 `catBlock`/`catBlock43` | fin en `let orderState` | fin en el banner v79 |
| Estático v62 bookingDue | `money(est.total * DEPOSIT_RATE)` | `money(depositSplit(Math.round(est.total * 100)).depositCents / 100)` + `DEPOSIT_FLAT_CENTS` |
| ~30 aserciones de montos v61/v62/v69/v70/v74/v78 | depósitos al 40% plano en totales ≤ $300 ($100, $80, $24, $104, $120, $40…) | los montos de la **ley nueva** en el mismo escenario ($50 y saldos correspondientes); los totales > $300 ($430→$172, $360→$144) quedaron idénticos |
| v78 server (invitado/join/webhook/refine) | la orden nace "paid in full" | la orden nace en **DEPOSIT** con apartado/saldo pineados; el webhook lleva el monto del apartado ($50) |

## Archivos tocados

`app/server.js` · `app/public/index.html` · `app/public/sw.js` (CACHE `ghs-app-v79`) · `index.html` (website, enlaces reapuntados) · `service.html` · `checkout.html` · `tracking.html` (redirecciones) · `tests/run.mjs` · este `V79-PARCHE.md`.

## Verificación

- `node --check` en servidor y en el script inline del SPA: OK.
- **Suite completa: PASS 984 / FAIL 0** (corrida local, puertos limpios, ~32 s).
- Nada publicado: el árbol queda listo para la corrida de confirmación y el push con el visto bueno de Gabriel.
