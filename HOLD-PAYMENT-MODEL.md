# ⚠️ SUPERSEDED EN PARTE (2026-10-23, v44) — ver DISENO-PAGO-COMPLETO.md

> **El hold de $75 de las ÓRDENES DEL MENÚ murió** por decisión de Gabriel
> ("necesito cobrar completo todo"): el checkout del menú y el carrito del
> admin ahora cobran el TOTAL al ordenar, y el estimado aprobado se paga
> completo al agendar (bookingDue = total). Lo que sigue vivo de este
> documento es SOLO el flujo de autorización del **fee del estimado en
> persona** ($75/$50), que no es el hold de la orden y se queda como está.

# Modelo de cobro con hold — Especificación (2026-10-20)

APROBADO por Gabriel: "siempre los $75 en hold y al final se cobra el final",
y el cliente va viendo su factura en vivo. Esto detalla cómo se construye.

**Estado (2026-10-20, actualizado): Gabriel revirtió la pausa — construir
HOY con lo que Stripe ya permite, sin esperar el correo, siguiendo el
diseño tipo DoorDash (v9). El parámetro de incremento va incluido desde el
día uno (`if_available`): mientras Stripe no lo active, el app usa la
segunda autorización de saldo como respaldo automático.**

## La opción en Stripe (nombre exacto)

No es un interruptor del panel: se pide por pago, en el código, al crear la
sesión de checkout:
- `mode = payment`
- `payment_intent_data[capture_method] = manual` → autoriza (hold), NO cobra.
- `payment_method_options[card][request_incremental_authorization] =
  if_available` → permite SUBIR la autorización antes de capturar.
- `custom_text` en el checkout (práctica requerida por Stripe): avisar al
  cliente que el monto inicial es un estimado en hold y que puede aumentar
  si aprueba un presupuesto mayor.
- Después: `POST /payment_intents/:id/increment_authorization` con el total
  nuevo, y al terminar `POST /payment_intents/:id/capture` con el monto
  final (igual o menor). El cliente ve cargos pendientes separados y UN
  solo cargo final al capturar.
- La disponibilidad real se lee en
  `latest_charge.payment_method_details.card.incremental_authorization.status`
  (`available` / `unavailable`).

### Lo que Gabriel tiene que hacer (una sola vez)
Pedir a soporte de Stripe el acceso a **incremental authorizations**
(función IC+; con precios estándar no viene activa). El hold con captura
manual funciona SIN ese acceso; solo el incremento lo necesita. Mensaje
listo en la sección final de este documento. Ojo: preguntar primero cuánto
cambia IC+ sus comisiones antes de aceptar el cambio de precios.

### Si el incremento no está disponible para una tarjeta
(Discover restringido, algunos Amex, o Stripe aún no activa la función):
respaldo automático — al aprobar el estimado, el cliente autoriza el SALDO
con un segundo checkout (está presente en el app) y se captura al terminar.
La protección es la misma; son dos pendientes en vez de uno.

## Control de Gabriel (pedido expreso, 2026-10-20)

- Gabriel edita la factura/estimado cuando quiera; el objetivo a autorizar
  se recalcula del estimado vigente y el panel muestra si falta autorizar
  o si el pool excede el total.
- El monto de captura es editable por Gabriel (default = objetivo): menos
  = captura parcial y se libera el resto; más que el pool = primero subir
  la autorización (incremento o saldo), nunca cobrar de más en silencio.
- NADA se captura automáticamente: ni al terminar el trabajo ni por fecha.
  Gabriel decide cuándo cobrar.
- Cerrar la factura/pedido es acción manual de Gabriel, después de cobrar;
  si quedan holds autorizados sin capturar, el app avisa antes de cerrar.

## Flujo exacto en el app

1. Cliente agenda estimado en persona → checkout de **$75 con captura
   manual** (kind nuevo `estimate-hold`, metadata `requestId`).
   - Webhook `checkout.session.completed` → guardar `request.hold`:
     { paymentIntentId, status: 'authorized', authorizedCents: 7500,
       capturedCents: 0, captureBefore, incremental: available|unavailable }.
     La cita queda "asegurada con hold" (NO pagada todavía).
   - `payment_intent.amount_capturable_updated` → actualizar montos/status.
2. Visita hecha (o no-show) → el estimado existe; si el cliente NO sigue:
   admin captura $75 y cierra. Si cancela con aviso (regla por definir de
   Gabriel: ¿cuántas horas de aviso?), admin libera el hold (cancelar el
   PaymentIntent) y no se cobra nada.
3. Cliente aprueba el estimado (flujo actual) → el app incrementa la
   autorización al total aprobado (o autoriza el saldo, ver respaldo).
   **El trabajo no se publica a técnicos hasta que la autorización pase.**
   Si el incremento es rechazado por el banco → aviso a Gabriel y el app
   manda el link de pago normal (depósito) como respaldo.
4. Trabajo terminado → admin captura el **final exacto** (≤ autorizado);
   si salió menos, captura menos y el resto se libera solo.
   - Webhook `payment_intent.succeeded` → marcar pagado, cerrar el pedido,
     disparar el correo de "pagado" actual y pedir calificación (v9).
5. Propina: se define ANTES de autorizar (el cliente la elige al agendar y
   entra en el monto autorizado) o se cobra al final por la factura, como
   hoy. No se puede agregar después de capturar.
6. Vencimiento: el hold vive ~7 días (`captureBefore`). Si la fecha del
   trabajo queda fuera de la ventana, el app avisa a Gabriel: re-autorizar
   al acercarse la fecha o convertir a depósito cobrado (`bookingDue`).

## La factura en vivo del cliente (lo que pidió Gabriel)

La página pública del estimado/factura (`/estimate/:id`, luego
`/invoice/:id` y el seguimiento v9) gana un panel **"Tu pago"** que se
actualiza con cada paso, sin cuenta:
- Estimado — $75: **En hold (reservado, aún no cobrado)** → **Cobrado** →
  o **Liberado**.
- Total aprobado: $X — **Autorizado** (fecha/hora).
- Cargo final: **Pendiente** → **$Y cobrado el [fecha]** + "se liberaron
  $Z que no se usaron".
- Texto claro: "Un hold reserva el dinero pero no lo cobra. Solo se cobra
  el monto final cuando el trabajo está terminado."
- La página se refresca sola cada 30 s mientras está abierta.
- Los mismos estados le llegan por correo en cada cambio (avisos v9 §5E).

## Cambios de código (mapa)

- `server.js`: kind `estimate-hold` en `createCheckoutSession` (capture
  manual + request incremental + custom_text); handlers de webhook nuevos
  (sin tocar los de cobro inmediato); endpoints admin
  `POST /api/requests/:id/hold/capture|increment|release`; chequeo de
  vencimiento al abrir el admin (sin procesos externos).
- `index.html`: botón de pago del estimado usa el kind nuevo; panel admin
  del hold (monto autorizado, vence en, botones Capturar / Subir
  autorización / Liberar); panel "Tu pago" en la página pública.
- Service worker → v9 al lanzar esta pieza.
- Después: el mismo patrón para pedidos del menú On Demand
  (`service-order` con hold al pedir y captura al terminar).

## Pruebas (Stripe modo test, antes de vivo)

- [ ] Agendar estimado → hold de $75 visible, nada cobrado.
- [ ] Aprobar estimado de $400 → incremento a $400 aprobado (tarjeta de
      prueba habilitada) y rechazado (tarjeta sin fondos) → respaldo.
- [ ] Terminar en $350 → captura $350, se liberan $50, cliente ve su panel.
- [ ] No-show → captura de $75. Cancelación → liberación total.
- [ ] Webhook duplicado no duplica estados ni avisos.
- [ ] Un pago real chico en vivo solo cuando Gabriel lo apruebe.

## Mensaje listo para Stripe (Gabriel lo manda desde su cuenta)

> Hello — I run General Handyman Solutions (US, home services, account
> acct_1U3igbLu9cCIcixB). I would like access to incremental
> authorizations for online card payments. My use case: when a customer
> books an in-person estimate I authorize $75 with manual capture; after
> they approve a written quote I increment the authorization to the
> approved total and capture the final amount when the work is done,
> within the authorization window. I am on standard pricing — please tell
> me how to enable this (I understand it is an IC+ feature) and exactly
> how IC+ pricing would change my per-transaction fees compared to my
> current pricing before I switch anything. Thank you, Gabriel Mendoza.
