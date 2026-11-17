# v110 — Canal de TEXTO para el panel de rescate de carritos (2026-11-16)

Orden de Gabriel: «Arma la #1 — rescate por texto (v110)» — el ítem #1 de la auditoría de mejoras del 2026-11-16. El panel de rescate de la v108 solo llegaba por **correo** (`sendAutomation('cart_reminder')`) y su botón se deshabilitaba sin correo en archivo; los dos carritos abiertos más grandes — paredes ($840) y Napa ($360) — son clientes de **texto por Google Voice, sin correo**, así que el panel no podía alcanzarlos. **Cero cambios de precios, menú, checkout, matemática de depósitos, del flujo de correo ni del barrido de 48h.**

## 1) El texto listo para copiar (server.js)

- Función nueva `cartReminderText(c)`: el gemelo SMS del correo de recordatorio — modelado en el mismo copy, construido de los **mismos valores vivos** (total con precio de miembro cuando aplica, depósito "para apartar hoy" vía `cartSplit`, link del carrito) y en el **idioma del carrito** (`c.lang`), pero en tamaño de mensaje de texto: saludo de General Handyman Solutions, el monto, el link y un cierre simple. Respeta la regla v101 (H4): un carrito payFull se cobra completo y el texto jamás lo llama depósito.
  - EN: `Hi {First}, this is General Handyman Solutions. Your proposal is still waiting and your job is not booked yet. Total: $X · Due to book today: $Y. Review & pay here (no account needed): {link} Already taken care of? Just ignore this message. Questions? Text/call (707) 862-3773.` (payFull: `Full payment due today: $Y`)
  - ES: `Hola {First}, te escribimos de General Handyman Solutions. Tu propuesta sigue esperando y tu trabajo aún no está apartado. Total: $X · Para apartar hoy: $Y. Revisa y paga aquí (sin cuenta): {link} ¿Ya lo resolviste? Ignora este mensaje. ¿Preguntas? Texto/llamada (707) 862-3773.` (payFull: `Pago completo hoy: $Y`)
- `cartRescueRows()` ahora incluye por fila: `textReminder` (el texto ya construido — el panel solo lo copia, **cero matemática en el cliente**), `textedAt` (= `lastManualTextAt`) y `manualTexts` (= `manualTextCount`). El payload de `GET /api/admin/cart-rescue` no cambia de forma en lo demás.

## 2) El sello — el endpoint que NO envía nada

- Endpoint nuevo `POST /api/admin/carts/:id/remind-text` (solo admin), junto al de correo. Guardas espejo del de correo: 404 si el carrito no existe, 400 si no está abierto (pagado/cancelado), 400 si ya tiene depósito registrado, 400 si no tiene teléfono en archivo.
- Al toque válido: `manualTextCount + 1`, `lastManualTextAt = ahora`, auditoría `cart.reminder_text` con el actor — y **no envía absolutamente nada**: ni correo, ni SMS, ni automatización. Gabriel pega el texto en Google Voice y lo manda él, desde su número, como siempre.
- El sello es **independiente del canal de correo a propósito**: NO toca `c.remindedAt`, así que el barrido de 48h puede seguir mandando su correo one-shot a un carrito ya texteado, y el flujo de correo quedó intacto byte a byte.

## 3) El panel (app.js)

- Cada tarjeta con teléfono muestra el botón **Copy text / Copiar texto** junto al de correo (deshabilitado con «No phone on file / Sin teléfono registrado» si no hay teléfono). La tarjeta muestra además el sello «Texted · {fecha} · ×N / Texteado · {fecha} · ×N» junto al sello de correo existente.
- `cartRescueText(id)`: toma el texto de la fila ya cargada (`cartRescueRowsCache`), lo copia al portapapeles (con fallback de textarea si el clipboard API falla), dispara el sello y recarga el panel; al final avisa «Text copied — paste it into Google Voice…». Labels ADM110 dentro del mismo bloque ADM108, espejo EN/ES.

## Housekeeping

- SW cache → `ghs-app-v110`; los 5 pins de SW de la suite actualizados v109→v110.
- Tests nuevos (bloque v110, 15): instancia propia con mocks (Resend capturado en :8981) y fixtures SOLO ficticios — **ningún texto ni correo real salió a nadie**; en producción solo se verificó el 401 sin auth. Cobertura: boot ×2 fases · fixtures por la API real (teléfono-solo EN, ES con correo+teléfono, sin-teléfono, cancelado, + seeds pagado y con-depósito) · payload con el texto EN correcto (saludo, Total $250.00, depósito $50.00 vía cartSplit, link, teléfono del negocio) · payload ES correcto (Total $1000.00, «Para apartar hoy: $400.00») · sellos vacíos al inicio · remind-text sin auth = 401 y CERO sellos/correos · un toque = `manualTextCount` + `lastManualTextAt` + auditoría `cart.reminder_text` con **cero correos enviados** y `remindedAt` intacto · segundo toque = ×2 visible en el listado · independencia de canales (carrito texteado SÍ recibe su correo después — un solo envío — y el correo no toca el conteo de textos) · guardas 400/400/400/400/404 sin sellar ni enviar · estáticos de cableado.
- **Suite completo: 2,098 PASS / 0 FAIL, corrido DOS VECES** (baseline v109: 2,083; +15 del bloque v110). La suite se corrió desde copia scratch en /tmp con `APP_DIR` apuntando al árbol fusion (la ruta canónica del harness sigue siendo `~/workspace/ghs-app/app`, sin tocar en el archivo commiteado).
- Sin jobs de fondo, sin mensajes salientes a nadie, sin cambios en data.json (los datos vivos mandan desde la nube, M24).

## Nota de publicación

- Snapshot de texto a GitHub main vía push_files con SOLO los archivos de este parche: `app/server.js`, `app/public/app.js`, `app/public/sw.js`, `tests/run.mjs`, este parche. Sin binarios en esta versión.
- Divergencia verificada ANTES de empujar, por SHA de blob, contra el head remoto de la v109. `app/data.json` NO viajó.
- Verificación en vivo post-despliegue (2026-11-16): sw sirve `ghs-app-v110`; homepage + las 5 puertas + las 13 páginas de la v109 en 200; sitemap con 19 URLs; `GET /api/admin/cart-rescue` y `POST /api/admin/carts/:id/remind-text` sin auth responden **401** (ruta viva, solo admin — la verificación jamás presionó el botón con datos reales); carrito de Charla intacto ($170/$50/$120, miembro $136) y carritos de Ernest intactos (trabajo $3,675 y materiales $1,885 payFull).
- ⚠️ Honestidad: el render del panel contra la app en producción NO se ejercitó con sesión admin real (exigiría entrar al panel en vivo); queda pineado por la suite (endpoint completo contra fixtures + estáticos del cliente EN/ES) y el código exacto desplegado se verificó en el app.js servido. Cuando Gabriel abra su admin, los carritos de teléfono (paredes $840, Napa $360) ya traen su botón **Copy text** con el texto listo.
