# v80 — CONVERSIÓN (tanda aprobada por Gabriel 2026-10-25 22:36 + pieza 7 urgente de su captura en vivo 22:39)

**Estado:** construida y verificada en local — **suite completa 1018/1018** (la v79 cerró en 984; +34 pruebas netas). **SIN PUBLICAR** — el árbol queda listo para la corrida de confirmación del agente principal y el tap de Gabriel. SW cache: `ghs-app-v80`.

**Origen:** la tanda CONVERSIÓN de la `AUDITORIA-GENERAL-2026-10-25.md` (Semana 1 del sprint: CONVERSION) — P1-4, P1-1, P1-2, el `locale`/textos del checkout alojado (mitad en código del "Nivel 1" de Stripe; la marca del dashboard quedó verificada/arreglada por Muse vía navegador la misma noche), P1-7 y la plomería A-7. La **pieza 7** entró a las 22:40 desde la captura del teléfono real de Gabriel probando el checkout de la v79.

---

## PIEZA 1 — P1-4: notificaciones con destino real

**Antes:** cada aviso era texto plano y el Web Push siempre llevaba `url:'/'` — todo clic aterrizaba en la raíz de la app.

**Ahora:**
- `notify(userId, type, text, target)` acepta un 4º parámetro: el destino estructurado se guarda en el registro (máx. 200 caracteres; los avisos viejos sin destino simplemente abren la app) y el payload del Web Push usa ese destino como `url`.
- Destinos por evento: eventos de solicitud → `#req=<id>`; eventos de trabajo del cliente → `#job=<id>`; eventos del técnico → `#wjob=<id>`; membresías (bienvenidas, cancelación, pago fallido, cambio de plan, estimado gratis) → `#memberships`; eventos de capitán, pagos y activación del técnico → `#worker`; estimado listo → `/estimate/<id>`; factura pagada/marcada/recordatorio → `/invoice/<id>`. Las notificaciones a admins van sin destino a propósito.
- **SPA:** las filas con destino son tocables (`notifGo`); hashes profundos nuevos `#req=` / `#job=` / `#wjob=` que aterrizan en la vista dueña y **enfocan la tarjeta exacta** (scroll + anillo rojo parpadeante, clase `.flash`). Seguridad de rol intacta y reforzada: `notifTargetFor` jamás enruta a un técnico a una superficie de cliente (cae a `#worker`) y las guardas de la v79 siguen siendo el respaldo en el servidor.

**Pruebas:** API — el aviso del estimado trae `target === '/estimate/<id>'`; el del técnico asignado trae `#wjob=<id>`; push real (mock v66 en :8982) descifrado: el payload del estimado trae `"url":"/estimate/<id>"`; VM — la guarda de rol del SPA y el fallback de facturas legadas por texto.

## PIEZA 2 — P1-1: el historial huérfano se reclama por correo

**Antes:** lo creado anónimo/invitado bajo un correo quedaba huérfano para siempre aunque la persona abriera su cuenta con ese mismo correo.

**Ahora:** `claimOrphanRecords(u)` corre al **registrarse**, al **entrar** (login) y cuando el checkout del carrito **crea la cuenta al final**. Reclama SOLO registros sin dueño cuyo correo guardado coincide EXACTAMENTE con el de la cuenta (case-insensitive): solicitudes, trabajos colgando de esas solicitudes, facturas, y los carritos de Gabriel (sello `accountId`, el mismo matching de correo de las propuestas v79). Idempotente, y cuando reclama algo deja asiento en el log de actividad (`account.claim_orphans` con el detalle por tipo).

**Pruebas:** signup reclama solicitud + factura + carrito del correo exacto (y NO el de otro correo); el asiento de auditoría existe; en login, un carrito emitido a un correo que YA tenía cuenta queda reclamado (auditoría + propuesta visible). Nota: `POST /api/requests` ya enlazaba al vuelo si la cuenta existía — el hueco real era lo anterior a la cuenta y los carritos/facturas, que es lo que cierra esta pieza.

## PIEZA 3 — P1-2: estados asíncronos honestos

**Antes:** una falla de red pintaba el vacío falso ("No requests yet") porque los loaders tragaban el error como lista vacía.

**Ahora:** patrón compartido `listLoadingHtml` / `listErrorHtml` en las listas del cliente (solicitudes, trabajos, facturas, propuestas) y la lista de trabajos del técnico: **CARGANDO** (esqueleto, solo si el contenedor está vacío — sin parpadeo al refrescar), **VACÍO real** (solo tras respuesta exitosa, con los textos vacíos de siempre byte-exactos) y **ERROR con botón Reintentar** que vuelve a correr el loader. Decisión documentada: en propuestas, el vacío genuino sigue sin pintar nada (diseño anti-molestia de la v79); el esqueleto durante la carga y la tarjeta de error son lo que distingue los estados.

**Pruebas:** pins estáticos del patrón en los cinco loaders + el slice de `loadRequests` sin `.catch` tragador; VM — la tarjeta de error trae su botón de reintento cableado.

## PIEZA 4 — Checkout alojado: `locale` + textos en el idioma del cliente

**Ahora:** TODA sesión de Stripe Checkout sale con `locale` explícito ('es' o 'en', **nunca** 'auto') vía `checkoutLang(opts)` y `custom_text` localizado del diccionario `CHECKOUT_TEXTS {en, es}` (submit + after-submit): pagos, membresías (consciente del trial: el texto del mes gratis), y el hold de estimado conserva SU texto de siempre — ahora también en español. El idioma se enhebra desde donde cada flujo lo conoce: las páginas públicas de carrito/estimado/join mandan su `LANG`, el carrito pasa el idioma de la página (o el guardado en el carrito), la factura acepta `lang` en el cuerpo, y el SPA manda `menuLang()` en sus tres llamados (HomeCare, planes, hold). **Montos y el diseño de sesión única de la v70 intactos.**

**Pruebas:** el mock de Stripe ahora captura `locale` + `custom_text` de cada sesión: carrito ES → `locale:'es'` + texto ES con el monto intacto ($50 de apartado sobre $125); sin idioma → 'en' explícito; join HomeCare ES → sesión trial con el texto del mes gratis en español; hold ES → texto de retención localizado; factura ES → locale + texto ES.

## PIEZA 5 — P1-7: el +25% ASAP jamás toca el fee de estimado

**Ley de Gabriel:** el 25% es sobre LABOR. El `wzFee()` del wizard lo aplicaba también al fee de visita ($75 → $93.75 en pantalla).
**Ahora:** `wzFee()` es plano — $75 regular / $50 miembro / $0 primer estimado de miembro, urgente o no. El espejo del servidor ya era plano (`estimateDue` 75/50/0 al crear la solicitud); la pantalla por fin concuerda. El +25% sobre labor queda exactamente como estaba (miembro: sobre la labor ya descontada).
**Pruebas:** VM — wizard en ASAP: invitado $75, miembro $50, sin rastro de ASAP en la etiqueta; API — solicitud ASAP en persona queda con `estimateDue === 75`; los pins existentes del +25% sobre labor siguen verdes.

## PIEZA 6 — A-7 PLOMERÍA SOLAMENTE: carrito recuperable, cero envíos

**Ahora (solo plomería):** cuando un invitado llega al checkout con correo (o una cuenta compra con artículos), el servidor guarda una foto recuperable del carrito (`db.recoverableCarts`): correo + snapshot validado contra el catálogo del servidor (forma SPA `{id, q, x}`) + marcas de tiempo + expiración **30 días**; del token solo se guarda su **SHA-256**. Una foto viva por correo: guardar de nuevo reemplaza la foto y rota el token. Endpoints: `POST /api/cart/save-recovery`, `GET /api/cart/recovery/:token` (404 si no existe/consumido/expirado), `GET /api/me/recoverable-cart` (por sesión, **sin** filtrar el token). Cuando el checkout apartado se liquida, el registro se marca consumido. Superficies: el link `/#cart-recover=<token>` rehidrata el carrito invitado y aterriza en `#cart`; en la cuenta, la tarjeta honesta *"You left N item(s) in your cart"* con botón Restaurar (solo dentro de la app).
**STOP TOTAL intacto:** NINGÚN correo/SMS sale de este flujo — no hay `sendMail`, ni automaciones, ni timers en toda la sección (pin estático), y la prueba verifica que el conteo de correos del mock no se mueve. El ENVÍO de recuperación queda como decisión aparte de Gabriel, no tomada.

**Pruebas:** creación + token + ruta de restauración; la restauración devuelve la foto EXACTA; rotación de token (el link viejo muere); expiración ~30 días fijada por valor + guardia de expiración en el GET; la cuenta encuentra su foto sin filtrar el token; snapshot inválido → 400; cero correos en todo el flujo.

## PIEZA 7 — URGENTE (captura de Gabriel, 22:39): copy que contradecía el apartado + falso "pago no conectado"

**(A) Copy viejo:** la tarjeta de pago del carrito en el SPA aún decía *"You pay the full total today — one charge, no balance later"* — copy de la v78 (pago completo) contradiciendo las líneas de apartado directamente arriba y el pie directamente abajo. **Ahora** dice la ley de apartado: solo el apartado hoy ($50 plano hasta $300, 40% arriba de $300), el saldo al terminar; cancelación: reembolso completo antes de despachar, $75 no reembolsables después. Revisadas las gemelas: las páginas alojadas de carrito/estimado NO traían la frase (su `refundLine` ya dice la ley) y el "Paid in full" de la página de carrito solo aparece cuando el saldo YA se pagó — correcto. Pin estático: la frase no existe en SPA ni servidor.

**(B) Falso "sigue conectándose":** la captura mostraba el banner *"Online payment is still being connected…"* con la caja de pago vacía. **Causa raíz (verificada por el agente principal en producción): el servidor estaba BIEN** — `GET /api/stripe/config` devuelve `configured:true` y la llave `pk_live` real. La falla era del cliente: si `js.stripe.com` no cargaba en el teléfono (lento/bloqueado), `cartEnsureStripe()` devolvía falso SIN reintentos y un fallo pasajero se pintaba como estado permanente.
**Ahora:** Stripe.js se carga por un inyector resiliente (`loadStripeJsOnce`/`loadStripeJs`: script dinámico con timeout de 8 s y hasta 3 intentos con backoff, promesa compartida que no se traba — la disciplina de la v35 llevada al propio script; la etiqueta estática queda como vía rápida), la config también reintenta, y la caja de pago pinta **estados honestos**: "⏳ Loading secure payment… · Cargando pago seguro…" mientras carga, y en fallo una tarjeta de error con **"↻ Try again · Reintentar"** que vuelve a montar. El mensaje de la casa ("still being connected") queda reservado para el único caso real: el servidor responde sin llave.
**Pruebas (VM, el escenario del teléfono reproducido):** Stripe indefinido en el primer intento y disponible en el reintento → el Payment Element monta; config del servidor vacía → SOLO ahí sale el mensaje de la casa; fallo total → error honesto + Reintentar, y Reintentar recupera.

---

## Notas de construcción / hallazgos

- **Bug serio cazado por la suite durante la construcción:** el hook de reclamo en `/api/signup` se insertó sobre una línea física gigante del handler y el comentario `//` se tragó el resto de la línea (`save()` + `return 201`) — el signup caía al 404. La suite lo detectó en la primera corrida (FAIL en el signup base del bloque 1); quedó reparado y el signup verificado a mano además de por la suite. Lección registrada en el patrón de ediciones: en este archivo hay líneas-handler gigantes — los comentarios de parche van en su PROPIA línea.
- Los ids de catálogo canónicos son los del `SERVER_MENU` (`faucet-replacement`, `closet-doors`); las pruebas de recuperación los usan.
- El endpoint legado `POST /api/carts/:id/pay` (cargo completo, compatibilidad API según la auditoría P2-7) NO se tocó — su retiro corresponde a la unificación de checkout de una tanda posterior; ningún copy de cliente lo usa.

## Pendientes que NO son de esta tanda

- **El ENVÍO de la recuperación de carrito (A-7):** la plomería está lista; mandar el correo/SMS es decisión aparte de Gabriel (STOP TOTAL).
- **Prueba de pago en el teléfono real de Gabriel** antes de dar la v80 por buena (regla nueva aprobada con la v81): la verificación local/VM no sustituye el tap real en su teléfono, que es donde la pieza 7B se prueba de verdad.
- v81 (aprobada, en fila): tablero del sprint (A-1), reseñas verificadas publicables (A-2), línea de tiempo permanente del jale (P1-3).
