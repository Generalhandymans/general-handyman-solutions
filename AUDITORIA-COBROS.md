# AUDITORÍA DE COBROS — v46 (2026-10-23)

**Orden de Gabriel:** "que cobren lo correcto" — verificar que TODA superficie que cobra
cobre exactamente los montos de la lista maestra / catálogo. Una sola lengua de precios:
lista maestra → `MENU_CATALOG` (app) → espejo del servidor → Stripe.

Método: lectura del código de cada superficie + verificación con scripts contra el
catálogo parseado + lecturas EN VIVO de Stripe (conector, solo lectura) + matriz de
regresión permanente en `tests/run.mjs` (data-driven, sin montos escritos a mano).

---

## 🔴 HALLAZGO CRÍTICO — el cliente ponía su propio precio (CORREGIDO)

**Antes:** al crear una orden de menú (`POST /api/requests`), el servidor guardaba
`menuOrder.totals` TAL CUAL lo mandaba el navegador, y `/api/orders/pay` cobraba
`totals.due`. Un cliente con el navegador alterado podía declarar `due: 1` y pagar
**$1 por un trabajo de $700**. La propia prueba de reembolsos de la v44 demostró el
hueco sin querer: su fixture declaraba $250 por un servicio de $125 y el sistema lo
aceptaba.

**Corrección (en `app/server.js`):**
- Nuevo `SERVER_MENU`: espejo exacto de los 98 servicios del catálogo (precio,
  precio de miembro, add-ons con precio y bandera `nodisc`), generado del catálogo.
- Nuevo `serverMenuTotals()`: recalcula list/member/due/ASAP en el servidor con la
  MISMA fórmula del cliente.
- El handler de `/api/requests` ahora **recalcula siempre**: servicio desconocido →
  400; add-on desconocido → 400; los add-ons se resuelven por `id` (clientes nuevos)
  o por nombre exacto (clientes viejos en caché). Si el total del cliente difiere, se
  sobrescribe con el del catálogo, queda marcado `totalsCorrected` + `clientDue` en la
  orden y se escribe en el audit log (`order.totals_corrected`).
- El precio de miembro lo decide el SERVIDOR: HomeCare/Plus activo en la cuenta, o un
  join del mismo checkout SOLO si Stripe sí creó la suscripción
  (`stripeSubscriptionId`). La bandera `joinedMembership` sola ya NO otorga descuento.
- El cliente ahora manda los extras con `id` (antes solo nombre/precio).
- Prueba permanente: un total alterado a $1 se cobra a $125.00 (verificado contra el
  PaymentIntent), un servicio/add-on inventado se rechaza, y la fixture de reembolsos
  de la v44 se corrigió a una orden real de $250 (Vanity Swap) — el hueco quedó cerrado
  y sellado con tests.

## Matriz verificada — menú / checkout `#order` (98 servicios)

| Verificación | Resultado |
|---|---|
| Servicios en `MENU_CATALOG` | 98, todos con precio y precio de miembro |
| `member === round(price × 0.8)` en los 98 | ✅ exacto en los 98 |
| `SERVER_MENU` idéntico al catálogo (precio/miembro/add-ons/nodisc) | ✅ (test de deriva permanente) |
| Totales del cliente (`orderTotalsCalc`): 98 × {invitado, miembro} × {ASAP sí/no} × {con/sin add-ons} = 588 combinaciones | ✅ todas contra la fórmula del catálogo |
| ASAP | +25% sobre el precio YA con descuento de miembro ✅ |
| Add-ons sin descuento (`nodisc`) | Solo 4, los de acarreo: haul-toilet, haul-vanity, haul-door, haul-disposal — precio completo siempre ✅ |
| Starter replacement (`from: true`) | Cobra la base $225; la UI no ofrece selector de rango — el rango $225–$300 se resuelve como siempre (Gabriel ajusta). Sin cambio. |

## Otras superficies

| Superficie | Quién calcula | Resultado |
|---|---|---|
| Carrito del admin (`/cart/<id>`) | Servidor (`normalizeCartItems` + `cartTotals`); miembro = round(unitario × 0.8) por línea | ✅ Los precios que Gabriel edita a mano repre­cian al miembro desde SU número, como se diseñó |
| Estimados (link `/estimate/<id>`) | Servidor (`normalizeEstItems` / `estCoreTotals` / `settleEstimateTotals`) | ✅ Descuento SOLO sobre mano de obra; materiales a precio completo; `bookingDue` = total (v44/v45) |
| Facturas (pay link) | Servidor cobra `inv.total` vía Checkout | ✅ |
| Pago de orden de menú | Cobra el `due` RECALCULADO (ver hallazgo) | ✅ corregido |

## Membresías y Stripe (lectura en vivo, 2026-10-23)

Resolver de la app (`MEMBERSHIP_PLANS` + `membershipPriceIdFor`, que valida montos
contra Stripe antes de cobrar) contra los precios reales de la cuenta
`acct_1U3igbLu9cCIcixB` (livemode):

| Plan | App | Stripe (precio activo) | |
|---|---|---|---|
| HomeCare | $29 | `price_1UTmUfLu9cCIcixBSoZ7WXcC` $29 (default) — el de $49 y un precio de prueba de $40 fueron BORRADOS hoy en el dashboard; la descripción ya dice que el 20% aplica a TODO el menú | ✅ |
| Yard Care 1 visita | $75 | `price_1UTmMwLu9cCIcixBELdMhHh3` $75 (default) | ✅ |
| Yard Care 2 visitas | $150 | `price_1UTmQtLu9cCIcixBkCpLd2k2` $150 | ✅ |
| HomeCare Plus 1 visita | $100 | `price_1UTmS6Lu9cCIcixB312eNpYF` $100 (default) | ✅ |
| HomeCare Plus 2 visitas | $175 | `price_1UTmSKLu9cCIcixBmcSF51Cm` $175 | ✅ |
| Founding (retirado) | — | Producto ARCHIVADO; su link de pago está inactivo | ✅ |

**Payment links activos (5), verificados por línea de artículo:**
HomeCare $29 · Plus $100 · Plus $175 · Yard $75 · Yard $150 — cada link cobra el plan
correcto. ✅ Sin discrepancias; no se requiere ningún cambio en el dashboard.

## Links de la página web

34 links `#order/<id>` (30 en el home, 3 en service.html, 1 en checkout.html): todos
aterrizan en un servicio real del catálogo y el precio de la tarjeta coincide con el
catálogo (incl. la tarjeta de gutter-cleaning $150 / miembros $120). ✅

## ⚠️ Observación para Gabriel (NO cambiada — es decisión suya)

En la página de **estimados**, el ASAP (+25%) se calcula sobre la mano de obra ANTES
del descuento y el descuento se aplica aparte: un miembro paga
`mano de obra × 1.05 + materiales`, mientras que en el menú paga
`mano de obra × 1.00` (descuento primero, ASAP encima del descontado, como él ordenó).
Diferencia: 5% de la mano de obra en estimados con ASAP para miembros. Las reglas de
la v45 se dejaron intactas; si Gabriel quiere una sola fórmula en todos lados, es un
cambio de una línea + tests.

## Regresión permanente (tests/run.mjs, bloque v46)

- Matriz data-driven: parsea `MENU_CATALOG` y `SERVER_MENU` del código y exige que
  sean idénticos; corre `orderTotalsCalc` real en el VM para los 98 × 6 combinaciones.
- Seguridad de cobro: total alterado → recalculado + marcado; servicio/add-on
  desconocido → 400; add-on por nombre (cliente viejo) → precio del catálogo; miembro
  real (servidor) con ASAP → descuento y luego +25%; bandera de join sin suscripción
  → sin descuento.
- Suite completa al cierre de la v46: **PASS 668 / FAIL 0**.
