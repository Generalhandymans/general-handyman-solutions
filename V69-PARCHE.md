# V69 — Ajuste de saldo en órdenes con depósito (materiales actualizados, un solo link)

**Orden de Gabriel (2026-10-25):** en el trabajo de Brijesh los materiales reales
superaron las líneas de materiales del carrito (el cable UF-B solo se vende en
rollo de 50 ft + las válvulas angle-stop estaban muertas). Gabriel pidió:
*"modifica el total para que paguen al final todo, con los materiales
actualizados — labor extra no cobro."*

**El problema:** un carrito ya pagado (depósito) está sellado por diseño (v55):
sus líneas no se editan y el balance quedó fijo al convertirse la orden.

## La solución (sin romper el sello)

- **Las líneas originales NUNCA cambian.** El ajuste vive en una lista
  append-only `payment.adjustments[]` = `{at, by, deltaCents, note}`.
- **Endpoint admin:** `POST /api/admin/carts/:id/adjust-balance {delta, note}`
  - Solo admin; solo órdenes en estado depósito (status paid + depósito, sin
    balance pagado). Carritos abiertos → 400 (esos se editan por líneas).
  - `delta` en dólares, con signo; ≠ 0; tope ±$2,000 (guard anti-typo).
  - El balance nunca baja de $0 (el depósito ya pagado es un hecho).
  - Mueve `payment.amountCents` y `payment.balanceCents` (el depósito no se
    toca); expira cualquier sesión de Checkout viva (expireCartSessions) para
    que un monto viejo nunca se pueda completar; sincroniza la orden
    (`payment.totalCents/balanceCents`, `menuOrder.totals.due`), deja mensaje
    del Team en el hilo de la orden, notifica al cliente y registra auditoría
    `cart.adjust-balance`.
  - **Balance ajustado a $0** = orden liquidada: se marca `balanceAt` y se
    voltea la orden a PAID IN FULL vía `recordRequestPayment` al total
    ajustado (el depósito cubre todo).
- **La página del cliente (mismo link)** muestra cada ajuste como línea
  firmada con su nota — EN `Materials adjustment` / ES `Ajuste de
  materiales` — arriba del total y del balance nuevos, tanto en estado
  depósito como en la vista de pagado. Transparencia total: el cliente ve
  qué cambió y por qué; nada de sorpresas.
- **Admin (SPA):** botón **Adjust balance** en la tarjeta del carrito cuando
  hay depósito y balance pendiente; diálogo propio (v65): monto → nota
  visible al cliente → confirmación. La tarjeta también lista los ajustes
  ya aplicados (🧾).

## Pruebas
Suite **831/831** (+15): estática de rieles + flujo completo — carrito
$300 (labor $200 + materiales $100) → depósito $120 → 403 a no-admin,
$0 y >$2,000 rechazados → **+$35** (total $335, balance $215, depósito
intacto) → la página muestra la línea, la nota y `Pay balance $215.00` →
la orden se sincroniza → el checkout del balance cobra exactamente $215 →
piso $0 respetado → **−$215** liquida la orden PAID IN FULL en $120 → la
página cerrada muestra ambas líneas → ajustes posteriores rechazados →
carrito abierto rechazado.

SW: `ghs-app-v69`.

## Pendiente (acción de Gabriel)
Aplicar el ajuste real a la orden de Brijesh **GHS-25E72F** / CRT-511F03
cuando Gabriel dé la **cifra final de materiales** (delta = materiales
finales − $160 ya incluidos en la orden).
