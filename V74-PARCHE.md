# V74 — MES GRATIS PARA TODOS: el primer mes de HomeCare es gratis en cualquier unión

**Orden de Gabriel (2026-10-25):** *"Yo creo que el mes gratis debe ser para
todos."* Confirmado por él mismo en la tarjeta de opciones: **«Sí — mes gratis
pa' todos en HomeCare»**.

## La ley nueva (sustituye la regla de invitaciones de la v60/v61)

- **CUALQUIER unión a HomeCare ($29) empieza con 30 días gratis** — sin
  invitación, sin link personal, y **ya se puede anunciar públicamente**.
- **Candado: UNA vez por cuenta, PARA SIEMPRE.** No recibe trial la cuenta
  que ya usó un mes gratis (bandera `inviteFreeMonthUsed`, la misma de las
  invitaciones) **ni la que alguna vez tuvo una suscripción HomeCare** (de
  cualquier estado: activa, cancelada, vencida). Cancelar y volver no
  resucita el mes gratis.
- **Plus y Yard NUNCA llevan trial** — cobran completo desde el día uno,
  como siempre.
- **Las invitaciones siguen funcionando igual**: el link personal, su
  expiración de 7 días, su candado por correo y su banner en el carrito se
  quedan; reclamar una invitación también gasta el mes gratis de la cuenta
  (el beneficio ahora es el mismo que recibe todo el mundo).

## Cómo quedó implementado

**Helper único de elegibilidad — `homeCareTrialEligible(user)`** (server.js):
devuelve `true` solo si la cuenta nunca usó su mes gratis Y nunca tuvo
HomeCare. La prueba de "ya tuvo HomeCare" usa el registro de plan guardado
(`membershipPlan.since` sobrevive cancelaciones y cambios de plan) y, para
cuentas viejas sin registro de plan, los campos legados (`homeCareSince` /
`homeCareStatus`, que nunca se borran). Incluye chequeo cruzado por correo
contra otras cuentas. **Si la elegibilidad no se puede probar desde la
cuenta (no hay cuenta), la respuesta es NO** — opción conservadora.

**Los DOS únicos sitios que escriben el trial en todo el servidor**
(pineado por prueba estática: el literal aparece exactamente 2 veces):

1. El sitio compartido de Checkout (`createCheckoutSession`): los flujos
   hosted pasan `trialDays` solo si el plan es HomeCare y la cuenta pasó
   el helper. La sesión estampa `metadata.freeMonth = '1'` (y lo mismo en
   la metadata de la suscripción) para que los settles marquen el mes como
   gastado al activarse.
2. La creación de suscripción del flujo inline con tarjeta
   (`createInlineSubscription`): mismo candado, solo HomeCare elegible.

**Flujos cubiertos (todos los que unen a HomeCare):**

- `/join/INV-…` (invitación): mismo trial de siempre; el candado 400 ahora
  usa el helper completo — una cuenta que ya tuvo HomeCare tampoco puede
  reclamar otra invitación de mes gratis (mensaje: "one per account").
- SPA — botón Join HomeCare (`/api/stripe/checkout`, kind `homecare`):
  pasa el trial si la cuenta es elegible y la respuesta trae `trial: true/false`.
- SPA — formulario de unión con tarjeta (inline, `homecare-subscribe` /
  `homecare-confirm`): la suscripción nace en trial; el confirm marca la
  bandera si la sub quedó `trialing` y responde `trial` pa' el texto de
  bienvenida.
- Cart-join (v70, un solo cobro): el trial ya no depende de que haya
  invitación pegada al carrito — depende solo de la elegibilidad.
  `planFirst` baja a $0 con trial y **el depósito del 40% se cobra hoy
  igual**; la invitación, si viene pegada, sigue viajando en la metadata y
  se marca aceptada en el settle, como antes.
- Join desde la página de estimado (`/estimate/:id/join-checkout`): pasa el
  trial con el mismo helper. Su retorno (`?joined=1`) ahora acepta la
  prueba trial-aware (sesión completa + suscripción activa/trialing, la de
  las invitaciones) como respaldo, porque una sesión de mes gratis trae
  `payment_status: 'no_payment_required'`, nunca `'paid'`.

**El mes se marca gastado al activarse la suscripción en trial**, en cada
camino de settle: `activateHomeCareFromCheckout` (lee el sello `freeMonth`
de la sesión — cubre webhook, retorno de invitación, de carrito y de
estimado), el webhook `customer.subscription.created` (sub `trialing` de
plan HomeCare) y `homecare-confirm` del flujo inline. Todos escriben la
misma bandera `inviteFreeMonthUsed`.

**`pubUser` expone `freeMonthAvailable`** (la verdad del servidor vía el
helper) pa' que el SPA pinte la oferta sin adivinar.

## Textos (EN/ES, un idioma a la vez, como manda la regla del producto)

- **Carrito**: el renglón de HomeCare lleva la etiqueta «FIRST MONTH FREE /
  PRIMER MES GRATIS» siempre que la oferta aplique al visitante (invitación
  pegada, visitante nuevo — su cuenta nueva es elegible por definición — o
  cuenta elegible conectada); el banner de «invitación personal» se queda
  solo cuando sí hay invitación. El botón de pago y la nota de un solo
  cobro usan ese mismo interruptor, y el servidor vuelve a checar la
  cuenta real al crear el checkout — la etiqueta nunca otorga el trial.
  `joinBody` EN/ES dice ahora: "HomeCare starts with your first month FREE
  — then $29/mo (one free month per account)" / «HomeCare empieza con tu
  primer mes GRATIS — luego $29/mes (un mes gratis por cuenta)».
- **Estimado**: `joinBody` EN/ES con la misma frase del mes gratis.
- **Página de invitación**: sin cambios — ya ofrecía el mes gratis; su
  marco de invitación personal sigue siendo cierto.
- **SPA**: tarjeta HomeCare de la parrilla de membresías con la viñeta
  «First month FREE — for everyone (one per account)»; intro de la página
  de membresías lo anuncia; perks del formulario de unión; las notas de
  cargo (`hcChargeNote`, `joinChargeNote`, etiqueta de tarjeta) de HomeCare
  dicen «$0 charged today, then $29/mo (one free month per account)» en
  vez de «charged $29 today»; el resumen de una orden del menú que agrega
  HomeCare muestra la línea del primer mes como **FREE** y ya no suma $29
  al "due today" cuando la cuenta es elegible; la bienvenida del flujo
  inline celebra el mes gratis cuando el confirm reporta `trial`.
- **Website**: la caja HomeCare de las seis cajas gana la línea «First
  month FREE — for everyone (one per account)» + su traducción en el
  diccionario ES («Primer mes GRATIS — para todos (uno por cuenta)»).

## Pruebas

- Suite completa: **852/852** (base v72: 843).
- Actualizadas: pin del SW (v74), pin estático del trial (dos sitios,
  candado por helper), pin v61 del cart-join, y la ruta C de la v70 — un
  cart-join SIN invitación ahora cobra hoy SOLO el depósito ($144 de
  $360), con `freeMonth` estampado en la sesión.
- Nuevas (bloque v74): unión plana del SPA entra en trial ($0 hoy, sello
  en la sesión, `trial: true`); el webhook la activa y la cuenta queda
  sin mes gratis; tras cancelar, la misma cuenta se une a $29 completos;
  el flujo inline crea la suscripción con trial de 30 días y, tras vivir
  y cancelar esa membresía, el historial solo (sin bandera) cierra la
  puerta a otro mes gratis; Plus nunca entra en trial ($100 hoy, sin
  sello); cart-join sin invitación: trial + depósito de $40 hoy, y el
  retorno verificado activa al miembro, aparta el trabajo y gasta el mes.

## Decisiones y notas

- **Invitación pegada + cuenta NO elegible**: la invitación se sigue
  marcando aceptada en el settle (el cliente sí se unió por ese link),
  pero NO hay trial ni mes gratis — la ley nueva manda que quien ya tuvo
  HomeCare no recibe otro mes gratis, venga de donde venga.
- **Visitante del carrito que entra con una cuenta vieja no elegible**
  (signup da 409 → login): la página le mostró la etiqueta (era visitante
  al pintar), pero el checkout real — creado ya con su cuenta — no otorga
  trial y Stripe le muestra el cobro verdadero antes de pagar. La
  etiqueta es vitrina; el candado vive en el servidor.
- **`homeCareTrialEligible` no cuenta una suscripción `incomplete`
  abandonada** como "haber tenido HomeCare": solo gasta el mes la
  ACTIVACIÓN en trial, igual que una invitación abandonada nunca gastó
  nada. Reintentar el pago no quema el mes gratis de nadie.
- La v75 (Stripe Connect casi requerido pa' agarrar jales) queda intacta
  en la lista — esta versión no la toca.
- **Sin push ni commit**: el árbol queda listo pa' revisión de Gabriel.
