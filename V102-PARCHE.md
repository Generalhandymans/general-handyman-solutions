# v102 (CANDIDATO — NO PUBLICADO) — ASISTENTE DE CONTACTO GHS

Orden de Gabriel (2026-11-09, diseño aprobado; 2026-11-10: «dale eso»):
el asistente de contacto de la spec
`~/workspace/ghs-app/ASISTENTE-BASE-ENTRENAMIENTO.md`, construido SOLO en
el clon local `ghs-app-fusion`. **Nada se empujó, publicó ni desplegó.**
Gabriel revisa antes de que salga vivo, como siempre.

## Qué es

Un chat **determinista, basado en reglas** — sin IA libre, sin llamadas a
ningún LLM externo. Cotiza ÚNICAMENTE desde `SERVER_MENU` (la misma
fuente de precios del menú, los carritos y la auditoría de cobros): si un
precio cambia en el catálogo, la respuesta del asistente cambia con él.
Nunca cotiza de memoria, nunca inventa un precio, nunca agrega el viaje
+$25, y el concreto SIEMPRE escala (spec §2.7).

## Archivos cambiados

- `app/server.js`
  - Bloque v102 tras `serverCartTotals`: tabla de ruteo por palabras
    (EN+ES, ~40 servicios reales del catálogo con su trade: carpintería,
    electricidad, plomería, jardinería, mecánica móvil), sesiones de chat
    en memoria, `assistantQuoteFor` (precios vía `serverMenuTotals` +
    depósito vía `depositSplit` — las ÚNICAS fuentes), textos de la
    biblioteca de la spec §4 (saludo, cobertura, membresías con Plus
    primero, depósito, materiales, horario/contacto, escalación §5).
  - Endpoints (tras `/api/events`, con `rateLimitHit` estilo v101):
    - `POST /api/assistant/message` — ruteo con «sentido común»:
      problema en palabras del cliente → servicio del menú; cotización
      con precio de lista como titular, línea propia de miembro −20%
      (solo labor), depósito y saldo; add-ons naturales detectados
      (ejemplo de la casa: TV $175 + raceway $50 + soundbar $75 = $300,
      miembro $240, depósito $50, saldo $250 — exacto a la spec §3.3).
    - `POST /api/assistant/photo` — foto dentro del chat, validada con
      `isPhotoDataUrl` estructural de v101 (ALTA-2 intacta: SVG/script
      rechazados); máx. 6 por chat; las fotos viajan al caso o al
      carrito (`assistantPhotos`).
    - `POST /api/assistant/checkout` — crea un carrito REAL por el mismo
      camino de los carritos existentes (`cartsOf()` + `cartTotals` +
      `depositSplit`) y devuelve el link `/cart/CRT-…`.
    - `POST /api/assistant/escalate` — captura los 6 puntos de la spec §5
      (nombre, teléfono, dirección, servicio en sus palabras, fotos,
      resumen de 2 líneas) y lo guarda como **request** normal
      (`source: 'assistant'`, `assistantCase{…}`) → visible en el admin
      existente vía `/api/requests`, con `notifyAdmins`.
    - `GET /api/admin/assistant-cases` — lista admin de esos casos con
      sus 6 puntos.
  - Escalación automática: concreto, ruta de estimado (remodelaciones,
    panel eléctrico, líneas de gas, estructural, permisos, varios días,
    piso/cerca completa), servicios estimate-first (turbo — ley v82),
    total > $1,000, quejas, fuera de cobertura (ciudades fuera de Solano
    detectadas) y «quiero hablar con una persona». El mensaje de
    escalación promete SOLO atención personal de Gabriel, lunes a
    sábado, y el número público (707) 862-3773 — **nunca** promete
    tiempo ni hora de respuesta (PENDIENTES de la spec).
- `app/public/index.html` — markup del widget: botón flotante
  `#assistantFab` + panel `#assistantPanel` con mensajes, formulario de
  captura (nombre/teléfono/email/dirección/ciudad) y barra con foto.
- `app/public/app.js` — cliente delgado del chat (IIFE v102 al final):
  renderiza SOLO lo que responde el servidor (nunca calcula precios),
  textos con `textContent` (sin superficies XSS nuevas), idioma desde el
  toggle unificado `menuLang()`/`ghsMenuLang`, fotos reusando
  `fileToDataUrl` existente; `updateContactPill` ahora también muestra/
  oculta el botón del asistente con la misma regla de superficies de
  cliente.
- `app/public/app.css` — estilos del widget: tema oscuro de marca
  (panel `#101013`, nunca blanco), rojo `#e42535`, mobile-first.
- `app/public/sw.js` — cache `ghs-app-v102`.
- `tests/run.mjs` — pins SW v101→v102 actualizados + bloque v102 con
  **24 pins nuevos** (cotización vs catálogo, depósito $50/40%, línea de
  miembro, ejemplo TV+add-ons, ruteo ES «se me moja abajo del sink»,
  concreto/turbo/persona escalan, validación de foto ALTA-2, captura de
  6 puntos visible en admin, carrito real en la lista admin, Plus
  primero EN+ES, estáticos del widget).

## Pruebas

Suite completa corrida DOS veces contra el clon fusion (copia de la
suite con `APP_DIR` apuntando a `ghs-app-fusion/app`, como se corrió en
v101; la suite del repo sigue apuntando al clon viejo en su línea 14 —
sin cambios):

- **Corrida 1: PASS 1979 / FAIL 0** (baseline v101: 1955 → +24 pins)
- **Corrida 2: PASS 1979 / FAIL 0**

Verificación local adicional (servidor en `PORT=3100` con DATA_FILE
temporal, curl): markup del widget servido en `/`, `/app.css` y SW
v102; cotizaciones EN/ES correctas; foto válida aceptada y SVG
rechazada; escalación crea el caso; checkout crea el carrito y su link;
`/api/admin/assistant-cases` sin login = 401; ASAP suma +25% sobre la
labor sin línea de viaje.

## Decisiones / reutilización

- Las escalaciones NO crean una estructura nueva: son `db.requests`
  (la estructura existente) con `assistantCase`, así caen en el admin y
  en las notificaciones que Gabriel ya usa (spec §6).
- El carrito del asistente sigue el patrón de los carritos de venta de
  técnicos: líneas re-preciadas desde `SERVER_MENU` en el servidor; el
  nombre visible lo manda el cliente (solo display, saneado con
  `cleanText`, igual que en `/api/worker/carts`).
- Los nombres EN/ES de la tabla de ruteo son etiquetas de display; los
  precios jamás viven ahí.

## Pendientes (no decididos — Gabriel)

1. **Hora exacta de atención personal** (la spec la deja pendiente;
   propuesta 8 AM–7 PM sin fijar). El asistente NO la promete.
2. BAJA-17 y BAJA-15 de v101 siguen abiertas, sin tocar.
3. El root fix del `STRIPE_WEBHOOK_SECRET` en Render sigue pendiente
   (requiere a Gabriel en los dashboards).
4. Al publicar: la suite del repo (`tests/run.mjs`) necesita que su
   `APP_DIR` apunte al árbol que se publica, como en los releases
   anteriores.

**Estado: candidato local. NO publicado.**

---

# ADDENDUM DE PUBLICACIÓN (2026-11-14) — v102 SALE CON FOTOS EN EL CARRITO + AUDITORÍA

Orden de Gabriel (2026-11-14, en sesión): «Arreglame eso bien fino» →
«Haz todo. El sistema primero.» → «tenemos que terminar el bot y también
poner un chequeo de bug masivo» → «No pares.» Este addendum documenta lo
que se sumó a v102 antes de publicar y la auditoría masiva previa.

## Fotos en la página pública del carrito (Fase 0)

- `cartPageHtml` (app/server.js): cada línea de catálogo ahora enseña su
  foto `/menu-img/<serviceId>.webp?v=4` (54×54, lazy, esquinas redondas)
  junto al nombre — el mismo archivo y patrón `svcImgHtml` del menú.
  Solo reciben imagen los ids que existen en `SERVER_MENU`; el `onerror`
  la oculta, así un archivo faltante jamás se ve roto. Las líneas custom
  (labor/materiales/fees/travel) no traen serviceId y van SIN miniatura.
  Presentación pura: montos, depósito, textos y flujo de pago intactos.
- El arreglo nació en el clon viejo (ghs-app, .jpg) y se PORTÓ a este
  árbol (el de verdad, .webp). El clon viejo quedó ~50 precios atrás —
  NUNCA publicar desde ahí.
- Pins nuevos (4): la línea de catálogo renderiza su .webp; 2×
  curtain-rod-install = $170 lista / $136 miembro con $50 depósito /
  $120 saldo EN LA PÁGINA; la línea custom de materiales no recibe
  miniatura (exactamente un /menu-img/ en la página mixta).

## Auditoría masiva previa a publicar (estándar v101)

- **Precios:** SERVER_MENU (102) vs MENU_CATALOG cliente (102):
  consistentes en los 102 ids; las 102 fotos .webp existen en disco
  (0 rotas). Cortinas $85/$68 CONFIRMADO en servidor, cliente y bot.
  Única «deriva» real: el clon viejo trae la constitución de precios
  anterior (~50 diferencias) — es el clon el que está viejo, no vivo.
- **Bot — hallazgo y arreglo:** la tabla de ruteo NO tenía
  curtain-rod-install ni blinds-install (trabajos reales del menú; el de
  cortinas es literal el trabajo de Charla). Agregadas ambas rutas
  (EN+ES) con 2 pins: cortinas cotiza $85/$68, persianas $85/$68.
- **Bot — verificado a mano:** TV $175/$140 con depósito $50; concreto
  escala sin precio y sin prometer tiempos; ES «se me moja abajo del
  sink» → p-trap $135/$108 en español; checkout crea carrito real;
  escalación cae en admin con los 6 puntos (pins v102).
- **Dinero/auth/Stripe/XSS/datos:** cubiertos por la suite (pins v101 de
  los 4 ALTA + familia de webhooks + Connect + depósito $50/40% +
  miembro −20% solo labor + ASAP +25% sobre precio de miembro).
- **Tema/idioma:** la página del carrito en este árbol YA es oscura
  (fondo #0a0a0c, color-scheme dark); el panel del asistente es #101013;
  toggle único EN|ES intacto (las miniaturas no llevan texto).
- **Nota (fuera de alcance, no tocado):** el carrito DENTRO de la app
  (SPA `renderCart()` en app.js) también lista sin fotos — otra ruta de
  render; queda como mejora aparte para aprobación de Gabriel.

## Pruebas finales del build que publica

- Suite completa contra este árbol (copia con APP_DIR → ghs-app-fusion):
  **PASS 1985 / FAIL 0 — corrida 1**
  **PASS 1985 / FAIL 0 — corrida 2**
  (baseline v101: 1955; +24 pins del bot, +4 de fotos de carrito,
  +2 de rutas cortinas/persianas)
- Prueba renderizada guardada:
  `hidden_files/proof-cart-curtain-v102.html` (carrito 2× cortinas con
  su foto y $170/$50/$120 + «Members $136.00»).

## Ruta de publicación

Snapshot a GitHub `main` SOLO con los archivos de código (app/server.js,
app/public/app.js, app/public/app.css, app/public/index.html,
app/public/sw.js, tests/run.mjs, este parche) — como v99/v100/v101.
`app/data.json` NO viaja (los datos vivos mandan desde la nube, M24) y
ningún asset baja: origin/main guarda las imágenes que este clon no
trackea; empujar el árbol entero las borraría.
