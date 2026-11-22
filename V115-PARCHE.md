# V115-PARCHE — payFull A NIVEL DE SERVICIO: los combos de árbol se cobran COMPLETOS al ordenar

**Orden de Gabriel (2026-11-22):** "Arreglame todo con su parches completos."
**El hueco que dejó v114:** el `payFull` existía SOLO como interruptor del
cart builder del admin. Los tres combos de árbol (v114) son servicios del
menú público, así que un cliente que se auto-sirve un combo caía en la ley
de depósito normal (≤$300 → $50; >$300 → 40%) y GHS terminaba poniendo de
su bolsa el árbol y la base. La regla de Gabriel para los combos es
absoluta: **se pagan COMPLETOS al ordenar — GHS nunca pone los materiales.**

## La solución: la bandera vive en el SERVICIO, no en el carrito

Semántica elegida — **carrito completo** (la más simple y la correcta en
este código: un solo cargo de Stripe por carrito, un solo split por
carrito): si el carrito contiene AL MENOS un servicio marcado payFull,
**todo el carrito se cobra entero hoy** — el combo, su add-on de
decoración y cualquier otra línea del mismo carrito viajan en el mismo
cargo único. Sin combo → la ley de depósito queda byte-idéntica.

Servicios marcados (SOLO estos tres):
`tree-combo-small` ($199) · `tree-combo-medium` ($299) · `tree-combo-premium` ($499)

### Servidor (`app/server.js`)
- Nuevo bloque v115 junto a `cartSplit`: `PAYFULL_SERVICE_IDS` (Set de 3)
  + `servicePayFull(id)` + `itemsPayFull(items)` + `cartPayFull(c)` +
  `dueSplitForItems(items, totalCents)`. **`cartPayFull(c)` = el toggle
  del builder O un servicio payFull dentro del carrito** — el toggle del
  admin sigue funcionando exactamente igual que antes (v100 intacto).
- `cartSplit` ahora consulta `cartPayFull(c)` → de una sola pasada quedan
  cubiertos: la página pública del carrito (rótulos "Due today — full
  payment", botón Pay con el total, sin fila de saldo, `PAY_FULL=true`,
  línea de reembolso full), los recordatorios email/texto (nunca llaman
  "depósito" a un combo), `/api/me/proposals` (depositDue = total,
  balanceDue = 0) y el panel de rescate.
- `publicCart` expone además `payFullEffective: cartPayFull(c)` junto al
  `payFull` guardado (el toggle sigue visible tal cual en el builder).
- Checkout de carritos del admin (`/api/carts/:id/checkout`): el split ya
  salía de `cartSplit`; los rótulos de la sesión y el `payStep` de los
  metadatos ahora usan la bandera EFECTIVA ('paid in full' / `'full'`).
- Auto-servicio embebido (`/api/cart/checkout`): totales, monto del
  PaymentIntent y su descripción ('Cart order — paid in full — …') salen
  de `dueSplitForItems`; el pending checkout guarda `payFull` calculado
  de sus líneas; la confirmación (`checkout-confirm`) verifica contra el
  MISMO split por líneas.
- Auto-servicio hosted (`/api/cart/checkout-hosted`): `splitH` y el rótulo
  de AMBAS sesiones (join y pago) salen del split por líneas.
- **El settle comparte la misma ley** (`settleCartCheckout` y
  `settleHostedCartSession` verifican/registran con
  `dueSplitForItems(pc.items, …)`): un pago completo de combo se acepta
  como tal y la orden nace **PAID** (nunca 'deposit'), sin falsos avisos
  de "pago no registrado". Los webhooks caen en el mismo settle.
- Fuera de alcance a propósito (verificado inalcanzable para los combos):
  el asistente (el bot no vende combos — no están en ASSISTANT_ROUTES) y
  los servicios de temporada (nunca son combos); sus splits no cambian.

### Cliente (`app/public/app.js`)
- Espejo del set: `PAYFULL_SERVICE_IDS` + `cartHasPayFull()`.
- `cartDepositEstimate()` y `cartPayLabel()`: con un combo en el carrito,
  lo debido hoy es el TOTAL y el botón dice "Pay $X in full".
- `renderCartTotalsDue()`: la fila pasa a "Due today — full payment" por
  el total, el saldo queda en $0 (sin fila de saldo) y la letra chica de
  la tarjeta de pago cambia a la versión de pago completo (EN+ES nuevos:
  `cartFullDue`, `cartPayFullTpl`, `ccFullNote`, `ccFullFoot`) — un
  carrito con combo NUNCA lee "deposit today, balance at completion".
  El paso de join (crear la membresía) no se toca: la membresía se cobra
  aparte y el pedido se paga completo en su paso.
- Admin SPA: `depFor90` y la línea dormida del builder leen la bandera
  efectiva (`payFull || payFullEffective`); el checkbox del builder sigue
  leyendo/guardando SOLO el toggle guardado.

### Lo demás
- `app/public/sw.js`: caché `ghs-app-v115`.
- `MASTER-SERVICE-LIST.md`: las tres filas de combos marcan
  "PAGO COMPLETO al ordenar (v115…)".
- El catálogo NO se tocó: ni precios, ni el add-on, ni la forma de los
  registros (la bandera vive en su propio set, fuera del catálogo).

## Cuánto se cobra ahora (verificado por tests, total del carrito)
| Carrito | Antes (depósito) | **v115: hoy** | Saldo |
|---|---|---|---|
| Basic $199 | $50 | **$199** | $0 |
| Basic + decoración $75 | $109.60 | **$274** | $0 |
| Medium $299 | $50 | **$299** | $0 |
| Medium + decoración $100 | $119.60 | **$399** | $0 |
| Premium $499 | $199.60 | **$499** | $0 |
| Premium + decoración $150 | $259.60 | **$649** | $0 |
| Combo + otro servicio (ej. TV $175) | split normal | **todo el carrito** | $0 |
| Cualquier carrito SIN combo | sin cambio | sin cambio | sin cambio |

## Tests — PASS 2140 / FAIL 0, dos veces
Suite completa corrida dos veces desde copia scratch en /tmp con APP_DIR
apuntando a este repo: **PASS 2140 / FAIL 0** en ambas corridas
(2,123 de v114 + 17 nuevos de v115). Los 17 de v115 cubren: estáticos del
mecanismo (set + helpers + bandera efectiva + settle por líneas);
auto-servicio embebido — Basic+decoración $274 con el PaymentIntent por
$274 y la orden naciendo PAID, Medium $299, Premium+decoración $649;
semántica de carrito completo (combo + TV mounting = $374 hoy);
regresión (TV mounting solo sigue con su depósito de $50); hosted —
Medium+decoración $399 con la sesión por $399.00 y settle PAID; y
carrito del admin con el toggle APAGADO — `payFullEffective: true`,
página con rótulo full y botón Pay $299.00 sin fila de saldo,
proposals $299/$0, checkout con `payStep: 'full'` y conversión PAID.
Tres pins viejos se actualizaron a la nueva forma (el assert de
`cartSplit`, el de `payStep` y el conteo de banderas en recordatorios) y
el pin del caché SW subió a v115 — mismo patrón de siempre.

Nota de proceso: la primera corrida localizó el bloque de tests nuevo
DESPUÉS de los kills de limpieza del harness (app2 ya estaba apagada) y
el harness moría al primer fetch; el bloque se movió ANTES de la limpieza,
junto a los demás bloques funcionales, y la suite quedó verde dos veces.

## Archivos del parche
`app/server.js` · `app/public/app.js` · `app/public/sw.js` ·
`tests/run.mjs` · `MASTER-SERVICE-LIST.md` · `V115-PARCHE.md` (este).
`app/data.json` NO viaja, como siempre.
