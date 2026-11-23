# V120-PARCHE — CRM: textos de seguimiento en la ficha (un toque, copiar y pegar)

**Orden de Gabriel (2026-11-22):** eligió "Seguimiento" de la lista de
mejoras — desde la ficha de cada cliente, los textos de seguimiento
listos para copiar, sin que la app envíe nada (el patrón v110 del
panel de rescate, ahora por cliente).

**Alcance:** aditivo sobre v118/v119. Cero cambios de precios, menú,
checkout, depósitos ni del comportamiento de cara al cliente. La app
sigue sin enviar ni un solo mensaje: Gabriel copia el texto y lo manda
por su canal (Google Voice, Messenger…).

## Cómo funciona

- **Los textos se construyen EN EL SERVIDOR** (`crmFollowUpTexts(e)`)
  y viajan en la ficha: `GET /api/admin/crm/:key` ahora incluye
  `followUpTexts` con SOLO las claves que aplican al estado del
  cliente. Sin endpoints nuevos y sin estampillas: copiar es copiar,
  no cambia ningún estado.
- **Depósito** (`followUpTexts.deposit`) — presente cuando el cliente
  tiene un carrito abierto sin depósito. El texto es
  **`cartReminderText` de v110 VERBATIM**: misma matemática
  `cartSplit`, mismo link del carrito, el idioma del propio carrito.
  El CRM jamás cotiza un depósito distinto del que el link le pide al
  cliente. Con varios carritos abiertos gana el de MAYOR depósito
  (el mismo que `crmFollowUps` pone primero).
- **Review** (`followUpTexts.review`) — presente cuando hay una orden
  pagada en su totalidad sin `reviewAskedAt`. Texto corto tipo SMS,
  modelado en `reviewAskEmailParts`, con el link de review
  CONFIGURADO: `googleReviewUrl()` — la misma URL que las landing
  llevan desde v111 (`%%REVIEW%%`), con su respaldo
  `https://g.page/r/Ce0oW03tmveIEBM/review`.
- **Reactivación** (`followUpTexts.reactivation`) — SIEMPRE presente:
  saludo corto ofreciendo ayuda en casa (los cinco oficios) con el
  link de la app `https://generalhandymans.app` y el teléfono del
  negocio. Es el único texto de los leads manuales de v119 (no tienen
  carritos ni órdenes de donde colgar los otros dos).
- **Idioma:** el texto de depósito hereda el idioma del carrito
  (v110). Review y reactivación usan la preferencia guardada de la
  cuenta cuando existe (`u.lang`, v80.19) y EN por defecto — no hay
  señal de idioma por lead manual, y la base de rescate es EN-first.

## El panel (app.js — index.html sin cambios)

- Bloque **"Seguimiento / Follow-up texts"** en la ficha, entre los
  seguimientos computados y el historial: por cada texto presente,
  su etiqueta (Depósito / Review / Reactivación), un `textarea`
  de solo lectura con el texto exacto y un botón **Copiar** (con el
  mismo fallback de portapapeles de v110) que confirma en línea
  "Copiado — la app no envió nada".
- Etiquetas nuevas en bloque `ADM120` EN/ES, espejo de ADM118/119;
  el render no hace ninguna matemática: solo muestra `followUpTexts`.

## Tests — PASS 2202 / FAIL 0, dos veces

Suite completa corrida **dos veces** desde copia scratch en /tmp con
`APP_DIR` apuntando a este repo: **PASS 2202 / FAIL 0** en ambas
corridas (2,190 de v119 + **12 nuevos de v120**). El bloque v120 usa
instancia propia (:8998) y fixtures SOLO ficticios (API real + dos
órdenes pagadas sembradas, dos fases como v118). Cobertura: boots ·
ficha 401 sin auth · **el texto de depósito trae el depósito exacto
($50) y el link del carrito, y es IDÉNTICO al `textReminder` del
panel de rescate para el mismo carrito** (garantía anti-fork) · el
texto de review nombra al cliente y al trabajo pagado y trae el link
de Google configurado · la reactivación siempre presente con el link
de la app · cliente con el review YA pedido no recibe texto de
review ni de depósito (solo reactivación) · lead manual recibe SOLO
reactivación · estáticos de cableado. Los bloques v118/v119 pasan
sin cambios.

## Housekeeping

- SW cache → `ghs-app-v120` (los 10 pins de la suite actualizados).
- `app/data.json` NO se tocó en este parche (su diff local
  preexistente es del 2026-11-10) y NO viaja, como siempre.
- **Sin publicar:** queda en el repo local a la espera de la orden
  expresa de Gabriel, como manda la casa.

## Brechas honestas

- Copiar un texto NO deja estampilla en el CRM (a diferencia del
  `remind-text` de v110, que marca el carrito como texteado): si
  Gabriel quiere registro de "ya le mandé el review", hoy lo anota en
  las notas de la ficha. Estampillar por tipo queda como mejora
  futura, no se fingió.
- Con varios carritos abiertos, el bloque muestra UN solo texto de
  depósito (el del mayor monto); los demás carritos se siguen
  trabajando desde el panel de rescate, como hasta hoy.
- El render del panel contra producción NO se ejercitó con sesión
  admin real (igual que v108/v118/v119): queda pineado por la suite
  (payload completo contra fixtures + estáticos del cliente EN/ES).

## Archivos del parche

`app/server.js` · `app/public/app.js` · `app/public/sw.js` ·
`tests/run.mjs` · `V120-PARCHE.md` (este). `app/public/index.html`
sin cambios (el host `#adminCrmFicha` ya existía).
