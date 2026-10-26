# v78 — Carrito Amazon + checkout embebido (Payment Element)

**Orden de Gabriel (2026-10-25 21:27–21:39):** carrito virtual estilo Amazon que siempre existe (invitados incluidos), cuenta creada AL FINAL dentro del checkout, y la ruta AVANZADA de pago: checkout embebido en la app, sin mandar al cliente a páginas hospedadas de Stripe. Aprobado con "Dale avanzado hijo".

**Estado:** construido y verificado (suite 954/954). **Sin publicar** — espera el visto bueno de Gabriel, como manda la regla de lanzamientos.

---

## Parte 1 — El carrito de invitado (solo clientes)

- **Persistente en el teléfono:** `localStorage` clave `ghsCart`. Sobrevive cerrar la app; al iniciar sesión sigue a la cuenta (mismo dispositivo); al completarse el pago se limpia solo.
- **Botón 🛒 con contador** en el header, visible SIEMPRE para invitados y clientes. Al añadir: el contador sube, el botón "salta" (animación) y aparece un toast "… added to your cart · View cart →" — sin salir de la página.
- **Botones "＋ Add to cart / ＋ Al carrito"** en cada tarjeta del Menú in-app y un botón ＋🛒 compacto en cada fila del panel del wizard (Solicitud Profesional). Textos por el diccionario del menú (EN|ES, clave `ghsMenuLang` como el resto del menú).
- **Vista del carrito (`#cart`):** líneas con nombre, precio unitario, cantidad +/−, quitar, total por línea; botón de vaciar. Tema GHS Premium (tokens v77).
- **Precios honestos, dos caras:**
  - **Miembro verificado** (su cuenta trae HomeCare/Plus activo — el estado lo pone SOLO el servidor tras verificar con Stripe): el precio de miembro (−20% labor) se aplica EN VIVO en cada línea y en el total.
  - **Invitado:** ve el total normal Y el total de miembro presentado como gancho de ahorro ("HomeCare members pay $X — save $Y · Join at checkout, first month FREE"). Nunca se le aplica un descuento falso.
- **LEY DE ROLES (Gabriel, 2026-10-25 21:31):** el carrito vive SOLO en la zona de clientes. El botón se oculta para sesiones worker/admin y dentro de la entrada de técnico (`#worker`); el markup de `#workerBox` y `#adminBox` no contiene NADA del carrito. Fijado con pruebas estáticas Y de comportamiento (ver Evidencia).

## Parte 2 — Checkout embebido (lo avanzado)

La página `#cart` contiene el checkout completo, con el tema de la app de principio a fin:

1. **Resumen** del carrito (mismos totales de la vista).
2. **Cuenta AL FINAL (modelo de Gabriel):** nombre/correo/teléfono/contraseña dentro del checkout. Sin cuenta previa el registro nace con el checkout mismo; si el correo YA tiene cuenta, la contraseña funciona como login en línea (con el mismo candado anti-intentos de `/api/login`) y el checkout continúa — la cuenta nunca bloquea la compra.
3. **Dónde y cuándo:** dirección de servicio, ciudad, chips Today/Tomorrow/ASAP + texto libre de horario y notas. Es una PREFERENCIA que el Team confirma — el carrito NO cobra el recargo ASAP (eso queda para la cotización confirmada; ver Notas).
4. **Membresía OPCIONAL (patrón v77):** checkbox HomeCare con el mes gratis universal (v74). Default: nada. Si la marca, la suscripción se crea por los rieles inline existentes, se cobra/confirma la tarjeta de la membresía, se verifica la activación, y el precio de miembro se aplica a ESTA orden. Si no marca nada, se cobra solo la orden.
5. **Pago con Stripe Payment Element montado EN la página** (Stripe.js, `elements({clientSecret})` + `create('payment')` + `confirmPayment({redirect:'if_required'})`, apariencia con el rojo de marca `#e42535`). Cero redirecciones a páginas de Stripe para este flujo.
6. **Éxito 100% in-app:** confirmación temática con el folio de la orden ("✅ Order placed — GHS-… · Paid in full"), carrito limpio, cero páginas externas de éxito.

### P0-4 (auditoría) — la orden nace SOLO con el pago verificado

El flujo legado del menú creaba la orden ANTES de cobrar (un pago fallido igual enseñaba "Order placed"). **Este flujo NO hereda ese agujero:**

- `POST /api/cart/checkout` (paso `pay`) crea únicamente un **checkout pendiente** (`db.cartCheckouts`): un snapshot validado del carrito + un PaymentIntent. **No crea ninguna orden.**
- La orden nace en `settleCartCheckout()`, llamada SOLO desde dos lugares verificados: `POST /api/cart/checkout-confirm` (tras comprobar contra Stripe: estado `succeeded`, metadata `kind/checkoutId` coincidentes, monto == total del snapshot) y el **webhook** `payment_intent.succeeded` con `kind: 'cart-checkout'` (paridad total: si el cliente cierra la pestaña tras pagar, la orden nace igual, una sola vez — el sello `pc.requestId` hace idempotentes ambas vías).
- **Tarjeta declinada = cero órdenes, cero pantallas de éxito:** el cliente ve el error en tema, el botón se rehabilita y el carrito queda intacto (la intención se puede reintentar con otra tarjeta).

### Endpoints nuevos (server.js)

| Endpoint | Qué hace |
|---|---|
| `POST /api/cart/quote` | Precios de exhibición desde el catálogo del servidor. Miembro = sesión verificada, o el estado del registro por el correo tecleado (solo exhibición, igual que la página pública de carritos; el COBRO siempre se re-deriva de la cuenta verificada con contraseña). |
| `POST /api/cart/checkout` | Paso `join`: crea la suscripción inline de HomeCare (con trial v74) y devuelve su secreto + vista previa a precio de miembro. Paso `pay`: resuelve/crea la cuenta, valida el carrito, guarda el checkout pendiente y crea el PaymentIntent. Devuelve también `user` + cookie de sesión cuando la cuenta nace aquí. |
| `POST /api/cart/checkout-confirm` | Verifica el PI contra Stripe (estado, metadata, monto exacto) y recién entonces crea la orden vía `settleCartCheckout` + `recordRequestPayment` (el mismo registrador idempotente de siempre: pago, notificaciones, payout al técnico cuando aplique). |

### Cómo se validan los montos (nunca se confía en el cliente)

- Nueva función `serverCartTotals(items, isMember)`: cada línea se valida contra `SERVER_MENU` (el catálogo espejo pineado por la suite) — id de servicio desconocido, add-on desconocido, cantidad fuera de 1–10 ⇒ TODO el carrito se rechaza (400), jamás se adivina un precio. Reutiliza el cálculo por unidad de `serverMenuTotals` (miembro = catálogo miembro + add-ons con descuento ×0.8, add-ons `nodisc` completos).
- El total cobrado sale del `totals.due` calculado en el servidor según el estado de miembro REAL de la cuenta verificada. Un total manipulado por el cliente se ignora (probado: se manda `due: 1` y se cobran $250).
- La secuencia membresía→orden garantiza que nunca se cobra precio de miembro sin membresía activa verificada: primero se activa (rieles existentes `homecare-subscribe`/`homecare-confirm`), después se crea la intención de la orden ya con `homeCareStatus === 'active'`.
- El PaymentIntent lleva `metadata {kind:'cart-checkout', checkoutId, userId}`; la confirmación exige coincidencia de metadata Y de monto al centavo contra el snapshot guardado en el servidor. El snapshot — no el cliente — es la fuente de las líneas de la orden.

### Degradación sin Stripe

Si el entorno no tiene Stripe configurado, `POST /api/cart/checkout` se detiene ANTES de crear cuenta, pendiente u orden, con el mensaje de la casa ("payments are not connected yet — the Team will confirm your booking for now"), y el cliente lo muestra en tema con la salida de llamar/texto al (707) 862-3773. Nunca una página rota (probado contra la instancia sin llave).

## P0-3 — los puntos de entrada viejos y el leftover declarado

- Los botones nuevos (Add) y la vista `#cart` alimentan SOLO el flujo nuevo con Payment Element — nada de lo construido en v78 enruta al checkout legado.
- **LEFTOVER CONOCIDO (declarado, no escondido):** la página legada `#order/<servicio>` (Card Element viejo) sigue alcanzable por los botones "Order" del menú y por los enlaces de las páginas de servicio del website, y conserva el comportamiento P0-4 (crea la orden antes de cobrar). No se tocó en v78 porque la suite la fija en decenas de pruebas y su retiro es un cambio de producto mayor: es pieza del programa **v79 BLINDAJE P0** (retirar `#order` o re-apuntarlo al carrito, y con ello cerrar el "checkout en dos productos"). Queda escrito aquí para que nadie lo descubra por accidente.

## Refinamiento (Gabriel, 2026-10-25 21:57) — el carrito se edita EN el checkout

**Su orden:** "que ellos puedan también cancelar los servicios — si ya metieron un servicio al carrito, que lo puedan cancelar para añadir otro en caso que se equivoquen. Añadir cosas y remover cosas: que tengan la opción de modificar el carrito." Aplicado sobre la v78 ya construida, antes de publicar.

### Qué cambió en el cliente (`#cart`, tarjeta de checkout)

- **Resumen editable dentro del checkout (`#ccLines`):** cada línea del resumen trae cantidad +/− y botón Remove — los mismos controles del carrito, sin salir del paso de pago. El precio por línea respeta el estado de miembro (o el join marcado), igual que los totales.
- **"＋ Add more services" en el checkout:** despliega el catálogo completo (nombre, precio, precio de miembro, "In cart ×q" si ya está) con botón Add por servicio. Añadir desde ahí sigue el mismo camino de edición que tocar una cantidad.
- **El estado NUNCA se pierde:** los campos tecleados (nombre, correo, teléfono, contraseña, dirección, ciudad, cuándo, notas) viven en inputs del DOM que este código jamás reconstruye — tras añadir/quitar/editar, todo sigue exactamente como el cliente lo dejó (probado campo por campo).
- **Toda edición re-cotiza contra el servidor:** `POST /api/cart/quote` con el carrito editado; los totales pintados salen de la respuesta del servidor (`cartQuote`), no de matemática local vieja. La vista del carrito (arriba) y el checkout quedan sincronizados en ambas direcciones.
- **Candado durante el pago:** mientras un pago se prepara o se procesa (`cartBusy`), las ediciones se ignoran — nadie puede cambiar el carrito a mitad de una confirmación.

### La intención vieja NUNCA se cobra — comportamiento exacto elegido

1. **Cliente:** al primer toque de edición, el Payment Element montado se desmonta y el contexto de pago (`cartPayCtx`) se descarta. Sin secreto montado, la intención anterior no se puede confirmar desde la app.
2. **Si ya había una intención armada**, tras re-cotizar el checkout se **re-prepara solo**: nace un checkout pendiente NUEVO con una PaymentIntent NUEVA por el total editado, y el botón Pay siempre nombra el total nuevo del servidor. (Si el formulario aún no validaba — no había intención — solo se re-cotizan los totales; el Pay arma la intención al toque, como antes.)
3. **Servidor:** al crear el checkout pendiente nuevo (paso `pay`), el servidor **reemplaza (supersede)** los pendientes anteriores sin liquidar DEL MISMO usuario: cancela sus PaymentIntents en Stripe (`POST /payment_intents/:id/cancel`, mejor esfuerzo) y marca el snapshot `superseded = true`. Un snapshot reemplazado **no liquida por ninguna vía**: `checkout-confirm` lo rechaza (400 "this checkout was replaced by a newer one") y el webhook lo salta; `settleCartCheckout` además lo devuelve nulo como cinturón extra.
4. **La excepción honesta:** una intención que YA tuvo éxito en Stripe no se puede cancelar — ese snapshot NO se marca reemplazado y sigue liquidable por la vía verificada normal. Es deliberado: el cliente sí la pagó, así que su orden debe nacer; lo que jamás puede pasar es cobrar la intención VIEJA por el monto VIEJO tras una edición (sin secreto montado no se confirma, y si el cargo ya había ocurrido, era el cargo que el cliente confirmó).

### Carrito vacío DENTRO del checkout

- **Cliente:** quitar el último servicio cierra la tarjeta de checkout, limpia líneas/totales/elemento de pago y deja el estado vacío del carrito con su botón "Browse the menu" — sin callejón sin salida. **Vaciar el carrito no crea ninguna cuenta:** la cuenta solo nace dentro de `cartPrepare`, que nunca corre con el carrito vacío.
- **Servidor (blindaje nuevo):** `POST /api/cart/checkout` con `items` vacío o ausente se rechaza (400 "your cart is empty") **ANTES** de resolver/crear la cuenta — llegar al checkout sin artículos ya no puede dejar una cuenta huérfana (antes la cuenta se creaba primero y el cobro de $0 la seguía).

### Evidencia del refinamiento (suite 941 → **954/954**)

- **Cliente (VM):** el resumen del checkout renderiza controles `ccQty`/`ccRemove` por línea; subir cantidad en el checkout re-cotiza (`quote`) y recrea la intención UNA vez con el botón en el total nuevo ($250 → $375); quitar una línea la elimina, re-cotiza y el botón nombra $250; el picker de add-more lista el catálogo y añadir un servicio conserva nombre/correo/dirección/cuándo/notas EXACTOS y deja el total en $375; quitar el último artículo esconde el checkout, enseña el estado vacío, `cartPayCtx === null` y el elemento de pago vacío. (El stub de la VM ahora PRECIA desde los artículos enviados — tv/fan $125/$100 — así los totales editados se mueven como en el servidor; los escenarios viejos dan los mismos 375/300 de antes.)
- **Servidor (app2 + mock):** primer checkout $125 → re-checkout con el carrito editado = id NUEVO y $250; la intención vieja, forzada a `succeeded`, es rechazada en confirm (400, "replaced by a newer one") y por el webhook — cero órdenes con el id viejo; el checkout editado liquida pagado con sus 2 líneas y `totals.due = 250`; `items: []` = 400 y el padrón de clientes NO crece (sin cuenta huérfana). El mock de Stripe ganó el endpoint de cancelación de PaymentIntent (fiel a Stripe: cancelar un `succeeded` da error).

## Notas de alcance

- **Política de pago intacta:** órdenes del menú/carrito se pagan COMPLETAS por adelantado (sin cambio). Los flujos hospedados de carritos de Gabriel, estimados y joins independientes NO se tocaron — siguen en Checkout hospedado.
- **Migración v79 (candidata):** mover carritos de Gabriel + estimados + joins a estos mismos rieles embebidos (checkout pendiente + settle al verificar), y retirar la página legada `#order` re-apuntando menú y website al carrito.
- El `when` del carrito es preferencia sin recargo: el +25% ASAP se sigue aplicando donde ya vivía (flujo `#order` y cotizaciones), no en el carrito — si Gabriel quiere ASAP cobrado en el carrito, es un cambio de una línea en `serverCartTotals` (hoy se invoca con `asap=false` por línea, igual que el quote).
- Los checkouts pendientes abandonados quedan como snapshots huérfanos en el estado (sin orden, sin cobro) — inofensivos; una limpieza periódica puede añadirse si el volumen lo pide.

## Evidencia de pruebas (suite completa: **954/954 PASS** — 941 de la construcción original + 13 del refinamiento, ver su sección)

- **Cliente (VM):** añadir fusiona cantidades (2× TV + 1× fan = 3), persiste en `localStorage ghsCart`, el badge enseña el conteo; matemática invitado $375 / miembro $300 (ahorro $75); la vista de invitado enseña AMBOS totales con el gancho; la de miembro enseña el precio aplicado; prepare llama paso `pay` y monta el Payment Element; el éxito limpia el carrito y enseña la confirmación in-app; **P0-4: tarjeta declinada = carrito intacto + error en tema + ningún `checkout-confirm` + botón rehabilitado**; rama membresía en orden exacto `join → homecare-confirm → pay (joinedMembership) → checkout-confirm`; **pin de rol conductual** (worker/admin/entrada técnico ocultan el botón; invitado lo ve).
- **Servidor (app2 + Stripe mock):** quote invitado 250/200/250 y miembro `due` 200; id desconocido = 400; checkout de invitado crea la cuenta y devuelve el total DEL SERVIDOR pese a total manipulado; **P0-4: con la intención creada NO existe orden; confirm temprano = 400 y sigue sin existir**; al verificar el pago la orden nace PAGADA con sus líneas; re-confirmar es idempotente; correo existente + contraseña mala = 409 `ACCOUNT_EXISTS`, con la buena continúa; rama join completa (activación → orden a $200 con `joinedMembership`); **paridad webhook** (la orden nace del webhook cuando el confirm nunca llega); degradación sin Stripe en app1 (400 con el mensaje, nada creado).
- **Estáticas:** `serverCartTotals` + los 3 endpoints presentes; `settleCartCheckout` + `kind 'cart-checkout'` en el webhook; el cliente usa `ghsCart`, `create('payment')`, `confirmPayment` y `/api/cart/checkout`; **pin de rol**: el markup de worker y admin no contiene `ghsCart`/`cartBtn`/`id="cartBox"`/`cartAdd('`; SW `ghs-app-v78` pineado.
- El mock de Stripe de la suite ahora también guarda `metadata[checkoutId]` en los PaymentIntents (Stripe real devuelve toda la metadata; el mock estaba incompleto — ninguna aserción existente cambió).

## Archivos tocados

- `app/server.js` — `serverCartTotals`, `cartCheckoutsOf`, `settleCartCheckout`, endpoints `/api/cart/quote|checkout|checkout-confirm`, rama `cart-checkout` en el webhook.
- `app/public/index.html` — CSS del carrito, botón 🛒 + badge en el header, vista `#cart` (carrito + checkout + confirmación), botones Add en menú y wizard, rama `#cart` en `render()`, módulo JS del carrito/checkout.
- `app/public/sw.js` — CACHE `ghs-app-v78`.
- `tests/run.mjs` — bloque v78 (VM + servidor + estáticas), pin del SW, metadata del mock.
- `V78-PARCHE.md` — este registro.
