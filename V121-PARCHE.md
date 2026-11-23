# V121-PARCHE — FUERA el email automático de "tu mes gratis está por terminar"

**Orden de Gabriel (2026-11-22, textual):** la app le mandó sola a un
miembro el email "Your free month is almost over · Tu mes gratis está
por terminar" (anunciando la fecha del primer cargo de $29 y cómo
cancelar, "No penalties, ever") — **y el miembro canceló POR ese
email.** Gabriel: "This message should have never been sent — this
produces us less money." Regla permanente desde hoy: **la app NO
manda emails de aviso de fin de prueba ni de renovación, de ningún
tipo.** El cargo cae según los términos aceptados al registrarse,
sin recordatorios.

## Dónde vivía el email (todo en `app/server.js`)

1. **El constructor** — `trialEndingEmailParts(p)`: armaba el cuerpo
   EN/ES ("…your free HomeCare month is almost over. Your first $29
   charge lands on … No penalties, ever.").
2. **El despachador** — la rama `type === 'trial_ending'` de
   `resendAutomation`: mandaba por Resend el asunto "Your free
   HomeCare month ends soon" / "Tu mes gratis de HomeCare termina
   pronto" / bilingüe según el idioma guardado (v80.19).
3. **El gatillo** — el punto (3) de `sweepFollowups()` (v80.15): el
   sweep de seguimiento que corre con la actividad normal (hub de
   `/api/jobs`, con throttle) buscaba miembros HomeCare a ~3 días del
   fin de su mes gratis (activación + `INVITE_TRIAL_DAYS`, vía el
   helper `trialEndMsFor` y la ventana `TRIAL_ENDING_WINDOW_MS`),
   mandaba el email una sola vez, estampaba `u.trialEndRemindedAt`
   y auditaba `trial.reminder`.

## Qué se quitó (solo esto)

- `trialEndingEmailParts` — eliminado.
- La rama `trial_ending` de `resendAutomation` — eliminada (un tipo
  sin rama cae en "no email template", como cualquier tipo
  desconocido; `googleAutomation` nunca tuvo rama para este tipo).
- El bloque (3) del sweep — eliminado, junto con `trialEndMsFor` y
  `TRIAL_ENDING_WINDOW_MS`. El sweep sigue corriendo igual para sus
  otros dos trabajos.
- Los comentarios de cabecera de ambas zonas documentan la remoción
  y la regla, para que nadie lo "repare" en el futuro.

## Qué NO se tocó

- **La prueba gratis y el cobro:** intactos. Las suscripciones se
  siguen creando con `trial_period_days` en los mismos dos sitios de
  siempre y convierten al cargo real de $29 vía Stripe exactamente
  igual — simplemente ya nadie recibe el email de aviso.
- **El resto del sweep:** el recordatorio de carritos (1) y el de
  facturas (2) siguen una sola vez, estampados y auditados, igual.
- **Los demás emails:** bienvenida de HomeCare, pago fallido, review
  ask, recordatorios de carrito/estimado/factura y recibos quedan
  byte-idénticos.

## Lado Stripe

- La app **nunca** configuró emails de Stripe de fin de prueba ni de
  renovación próxima: en ambos sitios de creación de suscripción
  solo se manda `trial_period_days` y metadata — no hay
  `trial_settings`, `end_behavior` ni ajustes de email en el código.
- Los emails propios de Stripe de "trial ending" / "upcoming
  invoice" son ajustes del **Dashboard de Stripe** (facturación), no
  del código. Por instrucción expresa **no se tocó el Dashboard** en
  este parche: si algún día Gabriel los activó ahí, apagarlos es un
  paso manual aparte — en el código no queda nada que remover.

## Pruebas — PASS 2203 / FAIL 0, dos corridas

Suite completa desde copia scratch en /tmp con `APP_DIR` apuntando
al árbol fusion, dos veces idénticas: **2203 PASS / 0 FAIL**
(base v120: 2202; +1 neto — un pin estático nuevo, el resto se
volteó 1:1).

- **Pin estático nuevo `v121`:** el server ya NO contiene
  `trialEndingEmailParts`, `type === 'trial_ending'`,
  `sendAutomation('trial_ending'`, `trialEndMsFor`,
  `trialEndRemindedAt`, `'trial.reminder'` ni ninguno de los tres
  asuntos del email.
- **v80.15 (app4) volteados a ausencia:** el miembro dentro de la
  vieja ventana de 3 días recibe CERO emails (ni bilingüe ni en un
  solo idioma); su usuario queda SIN estampilla
  `trialEndRemindedAt`; el audit trae `cart.reminder` e
  `invoice.reminder` pero NO `trial.reminder`; el segundo sweep
  mantiene los trials en cero — y los recordatorios de carrito y
  factura siguen llegando exactamente una vez.
- **v80.19 (app5) volteado:** el miembro trial con idioma `es`
  dentro de la ventana recibe NADA — el pin de idioma se retira
  junto con el email. Los fixtures de prueba (seis miembros trial
  semilla en app4, uno en app5) se conservaron: ahora prueban el
  silencio.

## Housekeeping

- Cambio solo de servidor → el SW cache se queda en
  `ghs-app-v120` (sin bump, sin pins que actualizar).
- `app/data.json` NO se tocó en este parche y NO viaja, como
  siempre.
- **Sin publicar:** queda en el repo local a la espera de la orden
  expresa de Gabriel, como manda la casa. Este parche se construyó
  SOBRE el árbol con v120 sin tocar ninguno de sus cambios.

## Brechas honestas

- Los récords de usuarios que ya recibieron el email en producción
  pueden conservar la estampilla `trialEndRemindedAt` en su data —
  queda **inerte**: nada en el código la lee ya (nunca se expuso en
  `pubUser`). No se corrió migración alguna; no hace falta.
- Los ajustes de email del Dashboard de Stripe no se inspeccionaron
  (fuera de alcance por instrucción): la garantía de este parche es
  sobre la app — la app ya no manda ni puede mandar ese aviso.
- El render contra producción no aplica aquí (cambio solo de
  servidor, sin superficie nueva): queda pineado por la suite.

## Archivos del parche

`app/server.js` · `tests/run.mjs` · `V121-PARCHE.md` (este).
