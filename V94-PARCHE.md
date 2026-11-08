# V94-PARCHE — El saldo que Stripe cobró y la app nunca registró: auto-reparación + alarmas (2026-11-07)

Bug real de producción, diagnosticado y reparado. **El caso:** la orden **GHS-EF134AE44AAC2BA4A5** (carrito CRT-6DC34DC47B8AADBE5F, cliente Brijesh) — total $492.00, depósito de $166.40 registrado sin problema el 2026-11-05. El **saldo de $325.60 se pagó hoy (2026-11-07) por el link del carrito** — confirmado en Stripe (bruto $325.60, neto $315.86, payout el Nov 12) — y sin embargo la app siguió mostrando la orden en estado `deposit` con el saldo abierto. El dinero estaba; el registro, no.

## 1. El diagnóstico (con evidencia en el código)

**Descartado — monto viejo o incorrecto.** La sesión de saldo se crea en el momento del clic (`POST /api/carts/:id/checkout`, rama `b.balance === true`) cobrando `c.payment.balanceCents` **actual** del carrito, y el handler de ajustes (`/api/admin/carts/:id/adjust-balance`) actualiza carrito y orden juntos en cada ajuste. Los tres ajustes del día (+$112 materiales, +$14 pieza del latch, −$50 laundry) dejaron el saldo en 32560¢, y eso es exactamente lo que Stripe cobró: $325.60. La metadata también estaba bien: la sesión y el PaymentIntent llevan `kind: 'cart-order'` + `cartId` (+ `payStep: 'balance'`).

**Las tres vías de registro que existían:**
1. **El regreso del navegador** — `GET /cart/:id?paid=1&session_id=…`: verifica contra Stripe que la sesión registrada (`c.paySessionId`) está pagada y asienta por `settleCartPayment`. Es la vía que registró el depósito del Nov 5.
2. **Webhook `checkout.session.completed`** (`kind 'cart-order'`) → `settleCartPayment`.
3. **Webhook `payment_intent.succeeded`** (metadata `cart-order`) → `settleCartPayment`.

**Por qué fallaron las tres para ESTE pago:**
- La vía 1 depende de que el navegador del cliente complete el regreso a la página. La ventana del pago (≈13:48–14:15 PST) coincide con la **suspensión del servicio en Render (≈14:15–17:46, «Service Suspended» 503)**: el regreso del cliente cayó sobre un servicio muerto y la verificación síncrona nunca corrió. (Un cliente que paga y cierra la pestaña produce el mismo efecto: la vía 1 es un punto único de fallo.)
- Las vías 2 y 3 dependen **por completo** de que `POST /api/stripe/webhook` pase `verifyStripeSig` (`STRIPE_WEBHOOK_SECRET` del entorno). Ese webhook se re-apuntó al dominio apex y su **handshake de firma nunca se verificó**; nunca había procesado un evento real — todos los pagos anteriores se registraron por regresos de navegador, enmascarando un webhook muerto. Las entregas durante la suspensión habrían fallado con 503, y Stripe reintenta — pero a las 18:12 y 18:20, ya con el servicio de vuelta (17:46), la orden **seguía** en `deposit`: si la firma verificara, un reintento post-reanudación ya la habría asentado. Conclusión: **la verificación de firma del webhook está fallando en producción** (el secreto del entorno no corresponde al endpoint vivo, o no está puesto — `verifyStripeSig` devuelve `false` en ambos casos) y cada entrega se rechaza 400 en la puerta. La suspensión fue el gatillo; el webhook silenciosamente muerto es la causa raíz de la clase.
- **La evidencia que NO existe, y por qué:** una alerta `balance.duplicate` vive en `db.auditLog` + notificaciones admin — aquí no pudo existir, porque el pago nunca llegó a ningún handler. Y el rechazo de firma no dejaba rastro en **ningún** sitio: la ruta devolvía 400 sin log, sin auditoría, sin aviso. Además, `settleCartPayment` tenía caídas silenciosas (`return false` sin log ni alerta) para un carrito reservado con un monto que no cuadra al centavo.

## 2. La reparación (código — los datos de producción los repara el padre)

**Ninguna guarda se debilitó:** el requisito de centavos exactos de `settleCartPayment`/`completeCartBalance` y las protecciones anti-duplicado del sello v80.5 quedan intactos — un segundo cobro sigue siendo imposible.

1. **Auto-reparación en la página del carrito (`GET /cart/:id`).** En cualquier carga de un carrito reservado con saldo abierto y sin sellar, la página verifica con Stripe la sesión de saldo que el propio carrito registró (`c.paySessionId`) — la misma prueba estricta del regreso (solo la sesión registrada, `payment_status: 'paid'`, y `settleCartPayment` decide con su guarda de centavos exactos). Si el dinero cayó y no se registró, **la próxima vez que cualquiera abra el link** — el cliente o Gabriel revisando la orden — el saldo se asienta solo. Un carrito anulado (`balanceVoid`) nunca se auto-repara.
2. **Alarma de pago no registrado.** `alertUnrecordedCartPayment(...)`: cuando un pago probado por Stripe cae sobre un carrito reservado y no cuadra con el saldo al centavo (el agujero silencioso de `settleCartPayment`), ahora hace ruido — `console.error`, notificación admin y auditoría `cart.payment_unmatched` — sin tocar los libros. El PI del depósito queda excluido (su webhook tardío en totales de patas iguales no es un evento de saldo — v80.5 F).
3. **El webhook deja de fallar en silencio.** Firma rechazada = `console.error` siempre, y como máximo una vez por hora: notificación admin + auditoría `stripe.webhook_bad_signature` («revisa el secreto contra el endpoint vivo»). Los eventos `cart-order` que nombran un carrito desconocido también dejan `console.error` en ambas ramas del webhook (antes: caída silenciosa).

## 3. Ritual de versión

- `app/public/sw.js`: caché `ghs-app-v93` → **`ghs-app-v94`**.

## 4. Pines

- **Nuevos (estáticos)**: `static v94` ×2 — existen la auto-reparación (`healSid94` + `effSid94` en la ruta del carrito) y las alarmas (`alertUnrecordedCartPayment`, `'cart.payment_unmatched'`, `'stripe.webhook_bad_signature'`).
- **Nuevos (en vivo, bloque v94)**: el escenario del bug, de punta a punta — carrito reservado, ajuste de saldo, sesión de saldo pagada en Stripe **sin regreso y sin webhook**: una carga plana de la página del carrito asienta la orden PAID IN FULL (vía `link`), la segunda carga no duplica (una sola línea «Balance received», cero alertas `balance.duplicate`) y el checkout de saldo posterior se rehúsa (400). Un segundo carrito recibe por webhook un PI de monto que **no** cuadra tras un ajuste: la orden NO se mueve y queda la auditoría `cart.payment_unmatched`. Un POST al webhook con firma inválida responde 400 y deja la auditoría `stripe.webhook_bad_signature`.
- **Actualizados**: los 2 pins de caché de siempre ahora esperan `ghs-app-v94`.
- Suite: **1792 → 1812 PASS / 0 FAIL**, dos corridas completas sobre copia temporal con `APP_DIR` reapuntado (pasada la suite: el bloque REPRO refleja la secuencia exacta de Brijesh; el bloque en vivo reproduce el agujero — pago sin regreso ni webhook — y verifica la auto-reparación).

## 5. Lo que queda fuera de este parche (producción)

1. **Corregir el secreto del webhook en Render:** `STRIPE_WEBHOOK_SECRET` debe ser el `whsec_…` del endpoint vivo que apunta al apex. Con eso, las vías 2 y 3 vuelven a existir (la auto-reparación de la página queda como red permanente).
2. **Reparar el registro de la orden GHS-EF134AE44AAC2BA4A5** (lo ejecuta el padre): con la v94 publicada, basta abrir una vez el link del carrito CRT-6DC34DC47B8AADBE5F — la sesión de saldo registrada sigue siendo la del pago y la auto-reparación asienta la orden por la vía normal, dejando el estado exacto que `completeCartBalance` + `recordRequestPayment` producen (ver el detalle campo por campo en el reporte del parche).
