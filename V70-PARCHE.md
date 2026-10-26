# V70 — UN SOLO COBRO: plan + depósito del 40% en la misma sesión (y cláusula de materiales)

**Orden de Gabriel (2026-10-25):** lo de la mañana con Brijesh no se repite.
Él quiso pagar su depósito, aceptó suscribirse (invitación de mes gratis) y el
flujo lo llevó PRIMERO a un cobro de $0 de pura membresía: creyó que ya había
pagado, y tuvo que volver para pagar el depósito aparte. Gabriel: *"necesito
que lo haga todo a la primera vez… que no se le cobre los cero dólares — lo
primero que se le cobre es el depósito del cuarenta por ciento, y ya con su
tarjeta en Stripe es miembro y Stripe le cobra su plan. Smooth."*

## El cambio

**Antes (v54–v69):** dos pasos — sesión de suscripción sola (con invitación =
$0) → regreso → segundo checkout para el depósito.

**Ahora (v70):** UNA sesión de Stripe en modo suscripción (`kind: 'cart-join'`)
con DOS líneas:
- el precio recurrente del plan escogido (mapa servidor `MEMBERSHIP_PLANS`),
- el **depósito del 40% como línea one-time** — se cobra HOY en la primera
  factura de la suscripción. Con mes gratis (invitación, solo HomeCare) el
  trial difiere SOLO el plan: el depósito se cobra igual, hoy. Ya no existe
  el paso de $0.

Totales: planes con descuento (HomeCare/Plus) apartan sobre el total de
miembro; Yard aparta sobre el total de invitado (sin descuento, como siempre).
La sesión estampa `c.pendingJoin {plan, planCents, depositCents, totalCents,
memberApplied, inviteId}` + `pendingDeposit`, y `paySessionId == joinSessionId`.

**Settle — un solo camino, dos mitades:**
- `settleCartPayment` gana una rama `pendingJoin`: el `amount_total` esperado
  es depósito + primer cargo del plan ($0 con trial); convierte el carrito
  como depósito normal (40/60, v62) y limpia los stamps.
- **Webhook** `checkout.session.completed` kind `cart-join`: activa la
  membresía (`activateMembershipFromCheckout`), acepta la invitación si va en
  los metadatos, y convierte el carrito. Idempotente con el regreso.
- **Regreso** `?paid=1`: rama combinada — verifica la sesión registrada
  (modo suscripción, `payment_status` paid, suscripción paid/trialing vía
  `checkoutSessionSubscriptionPaid`) y hace AMBAS cosas en el mismo landing:
  el cliente queda **miembro y agendado en un paso**, sin segundo tap.
- El write de `trial_period_days` quedó en UN SOLO sitio compartido de
  `createCheckoutSession` (pin v60 intacto).

**Página:** el botón Pagar muestra el cobro real de hoy (depósito + primer
mes, o solo el depósito con mes gratis); las notas bajo el botón se
reescribieron (EN/ES): *"One single checkout: your 40% deposit ({dep}) plus
your first {planName} month… {due} charged today… No second step"* / *"Un
solo cobro…"*, y la del mes gratis dice el depósito y *"Sin paso de $0"*.

## Cláusula de materiales (la otra directiva de Gabriel, mismo día)

*"Tenemos que acordar con los clientes que los materiales pueden salir un
poquito más altos — en el primer bid tenemos que prepararnos."*
- Nota `matVarNote` (EN/ES) visible en la **página del carrito** y en la del
  **estimado**: los materiales se estiman a precios de hoy; si el costo real
  varía, el saldo final se ajusta al costo real — recibos disponibles, nunca
  cargo extra de labor.
- **Cláusula 2b** agregada al borrador de Términos
  (`TERMINOS-Y-PROCESOS-BORRADOR.md`, sigue siendo borrador pa' su aprobación).
- Es el respaldo del ajuste de saldo v69: pre-acordado desde el bid.

## Pruebas
Suite **829/829**. Los caminos de join se reescribieron al flujo nuevo:
- **Path C** (HomeCare): una sesión, `amount_total` $173 = $29 + depósito
  $144; sin pago no se activa ni se agenda nada; el regreso verificado hace
  AMBAS cosas (miembro + orden en depósito $144/$360, balance $216); un
  segundo checkout se rechaza (400) — ya no hay segundo paso.
- **Path P** (Plus): $244 = $100 + $144; miembro Plus + orden convertida.
- **Path Y** (Yard): $247 = $75 + depósito invitado $172; orden a total
  invitado, membership 'none', balance $258.
- **Path W**: el webhook `cart-join` activa yard2 Y convierte; el regreso
  posterior es no-op sin duplicar.
- **v61/Fran (el caso Brijesh)**: invitación + HomeCare = sesión única cuyo
  ÚNICO cobro de hoy es el depósito de $40 (plan $0 por el mes gratis);
  regreso único → miembro, invitación aceptada y trabajo agendado; el
  balance de $60 se cobra del mismo link. Pete (Plus en carrito invitado)
  sigue sin consumir la invitación.
- El mock de Stripe ahora modela `amount_total`/`payment_intent` de las
  sesiones de suscripción como Stripe real (primer periodo, 0 con trial,
  + líneas one-time).
- Seguridad v55 intacta: editar el carrito expira también la sesión
  combinada y su regreso viejo no activa nada.

SW: `ghs-app-v70`.
