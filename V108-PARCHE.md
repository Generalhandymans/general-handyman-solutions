# v108 — Panel de rescate de carritos en admin (2026-11-16)

Orden de Gabriel: «Arma el panel de rescate de carritos (v108)» — el ítem ① de la lista de mejoras del 2026-11-15: los carritos abiertos con depósito sin pagar son trabajo YA vendido que nadie está cobrando (en la auditoría v101: 12 carritos abiertos, $5,289 en depósitos esperando). Hoy el único empuje era el recordatorio automático de 48h; Gabriel no veía quién debe qué ni podía actuar a mano. **Cero cambios de precios, menú, checkout, matemática de depósitos ni del comportamiento del recordatorio automático de 48h.**

## Cómo funciona lo que ya existía (la base que el panel reutiliza)

- El recordatorio automático de carritos vive en `sweepFollowups()` (v80.15): barre con la actividad normal (sin cron), y a los carritos `status 'open'` sin depósito, creados por admin, con correo del cliente y de ≥48h, les manda `sendAutomation('cart_reminder', { cart: publicCart(c) })` — un correo con la plantilla localizada del carrito (EN/ES según `c.lang`, con el link `/cart/<id>` y el monto "para apartar hoy"). Al enviar, sella `c.remindedAt` y audita `cart.reminder`: es **one-shot**, el sello es la garantía de que nunca se repite.
- Un carrito deja de estar abierto cuando el depósito aterriza: la conversión a orden sella `status 'paid'` (+ `requestId`, `paidAt`).

## 1) La lista de rescate (server.js)

- Helper nuevo `cartRescueRows()`: todo carrito `status === 'open'` **sin depósito registrado** (guarda extra: `!(c.payment && c.payment.depositCents > 0)` — un récord abierto que ya cargue un depósito tampoco es rescate). Cada fila: id, nombre/correo/teléfono del cliente **exactamente como están guardados**, total, depósito pendiente, `createdAt`, edad en días, `remindedAt`, recordatorios manuales y el link del carrito.
- La matemática es la MISMA del carrito y del propio correo de recordatorio — total = `memberApplied ? memberTotal : listTotal`, depósito = `cartSplit(c, total)` (ley asentada: $50 fijo ≤$300, 40% arriba; payFull cobra todo) — el panel jamás cotiza un depósito distinto del que el link le pide al cliente.
- Orden: **depósito pendiente descendente** (el dinero grande primero).
- Endpoint nuevo `GET /api/admin/cart-rescue` (solo admin, `requireRole`): `{ ok, count, totalDepositDue, carts }` — el encabezado (cuántos carritos + cuánto depósito espera) se computa de los récords vivos, sin nada hardcodeado.

## 2) El botón de recordatorio — un toque, el mecanismo de siempre

- Endpoint nuevo `POST /api/admin/carts/:id/remind` (solo admin), junto a la ruta de cancelación de carritos. Validaciones: el carrito existe (404), sigue abierto (400 si pagado/cancelado), no tiene depósito registrado (400) y tiene correo del cliente (400 si no hay a dónde enviar).
- Dispara **exactamente** la llamada del barrido automático: `sendAutomation('cart_reminder', { cart: publicCart(c) })` — mismo canal (correo), misma plantilla, mismo link. Sin espera de 48h: el toque ES la decisión de Gabriel. Un toque = un envío.
- Si el envío sale, sella el MISMO `c.remindedAt` que el barrido revisa — un carrito rescatado a mano **nunca recibe el recordatorio automático después** (la regla de sello compartido que el recordatorio manual de facturas ya usa) — y además marca `manualReminderCount` + `lastManualReminderAt` y audita `cart.reminder` con el actor. Si el correo no sale, no se sella nada y la respuesta lleva el resultado de la automatización para que la UI avise (patrón del botón de facturas).
- El comportamiento del barrido automático de 48h NO se tocó: mismos filtros (incl. la exclusión de carritos de venta de técnicos, que es regla de los envíos AUTOMÁTICOS; el panel lista todo carrito abierto sin pagar y el botón manual es decisión de Gabriel caso por caso).

## 3) El panel (index.html + app.js)

- Sección nueva tras el embudo del bot: `Cart rescue — open proposals` con host `#adminCartRescue`; `loadAdminCartRescue()` corre dentro de `loadAdmin()` junto a Tráfico/Dinero/Bot.
- Encabezado: «Cart rescue: N open carts · $X in deposits waiting». Cada tarjeta: id + cliente, contacto, edad («3 days old» / «created today»), total y **depósito pendiente** en destaque, sello «Reminder sent» cuando ya hubo recordatorio (con conteo de manuales), y el botón **Remind** (deshabilitado si el carrito no tiene correo). El botón confirma con `appConfirm` (el texto dice que el cliente recibe el mismo correo automático de las 48h) y al terminar recarga el panel; si el correo no salió, alerta con el motivo — mismo patrón que `invoiceAct('remind')`.
- Labels ADM108 EN/ES espejo según el idioma de la app. Estado vacío honesto: «No open carts — every proposal already has its deposit. 🎉»

## Housekeeping

- SW cache → `ghs-app-v108`; los pins de SW de la suite actualizados v107→v108.
- Tests nuevos (bloque v108, 17): instancia propia con mocks (Resend capturado en :8981) y fixtures SOLO ficticios — **jamás se disparó un recordatorio real a un cliente real**; en producción solo se verificó el 401 sin auth y la presencia del panel en el código servido, sin presionar el botón. Cobertura: boot · fixtures por la API real · listado admin-only · exactamente los 5 carritos abiertos sin pagar (excluidos pagado/cancelado/con-depósito-registrado) · matemática ($1,000→$400 · $250→$50 · payFull $500→$500 · miembro $800→$320) · orden descendente · encabezado computado (5 carritos, $1,320) · edad en días y contacto tal cual guardado · remind sin auth = 401 y CERO correos · un toque = exactamente UN `cart_reminder` con el asunto/link de siempre · sellos `remindedAt` + `manualReminderCount` + auditoría · sin-correo→400, pagado→400, desconocido→404 · **el barrido posterior NO re-recuerda el carrito rescatado a mano (sello compartido)** y sí manda el automático a los demás vencidos · estáticos de cableado.
- **Suite completo: 2,050 PASS / 0 FAIL, corrido DOS VECES** (baseline v107: 2,033; +17 del bloque v108). La suite se corrió desde copia scratch en /tmp con `APP_DIR` apuntando al árbol fusion (la ruta canónica del harness sigue siendo `~/workspace/ghs-app/app`, sin tocar en el archivo commiteado).
- Sin jobs de fondo, sin mensajes salientes a nadie, sin cambios en data.json (los datos vivos mandan desde la nube, M24).

## Nota de publicación

- (Se completa con el commit remoto y la verificación en vivo al publicar.)
