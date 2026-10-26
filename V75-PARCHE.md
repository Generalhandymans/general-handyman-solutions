# V75-PARCHE — Onboarding de técnicos bien hecho + arreglo del mapa maestro

**Fecha:** 2026-10-25 · **Base:** v74 EN VIVO (commit c91f78c) · **Suite: 881/881 PASS** (v74: 852; +29 de la v75, con 2 ajustes de fixtures explicados abajo)
**Archivos tocados:** `app/server.js`, `app/public/index.html`, `app/public/sw.js` (CACHE → `ghs-app-v75`), `tests/run.mjs`, este registro.
**Estado:** construido y verde, SIN commit ni push — esperando la revisión y la palabra de Gabriel.

---

## Pieza 1 — Candado Stripe Connect pa' desbloquear jales pagados

**Regla de Gabriel:** el técnico puede registrarse, ser activado y mirar — pero **no puede agarrar un jale pagado** (sobre todo on-demand) hasta que su Stripe Connect tenga los pagos habilitados. Su mensaje exacto, en los dos idiomas: ES *"Para desbloquear jales on-demand tienes que conectarte a Stripe Connect"* / EN *"To unlock on-demand jobs you need to connect Stripe Connect"*.

- **El candado vive en el servidor** (`POST /api/jobs/:id/claim`): si el jale paga (`payOffer > 0`) y el técnico no tiene Connect con `payouts_enabled` (estado refrescado contra Stripe con el caché de 5 min de `refreshWorkerConnect`), el claim se rechaza con **403 estructurado**: `{ code: 'CONNECT_REQUIRED', connect: { connected, ready }, message: { en, es } }` con el mensaje exacto de Gabriel. El cliente nunca decide — solo presenta.
- **En el cliente:** al recibir `CONNECT_REQUIRED`, la app muestra el diálogo propio (appConfirm) con el mensaje en el idioma del técnico (diccionario v71) y el botón lo manda directo al flujo de conexión de Stripe que ya existe (`startConnect`).
- **Tarjeta persistente:** nuevo `#connectGateCard` arriba del home del técnico (`#workerBox`): mientras su Connect no esté listo, ve la tarjeta roja con el mensaje + el botón "Conectar Stripe Connect"; desaparece en cuanto está listo. Llaves nuevas en `W_I18N` en paridad EN/ES (`connectGateTitle/Msg/Body/Btn`).
- **Override de Gabriel:** `POST /api/admin/jobs/:id/connect-override` `{ workerId }` — libera **un jale a un técnico** a pesar del candado, siguiendo el patrón del override de pago v30 (una sola acción de admin). Queda **registrado en la auditoría** (`job.connect_override`, con nombre y correo del técnico) y el técnico recibe aviso en la app. En la tarjeta del jale (admin, solo jales Open) hay selector de técnico + botón "Unlock claim for this worker" + insignia cuando ya hay una liberación. Ojo: el override libera el CLAIM, no el pago — el pago sigue esperando su setup de Stripe al terminar, como manda el flujo v29.
- **Estatus de Connect de un vistazo:** las tarjetas de técnico en admin ya traían la insignia de pagos de la v72 (ready / setup started / NOT set up) — se mantiene y ahora combina con la insignia de teléfono (Pieza 2).
- **Decisión anotada (conservadora):** si Stripe no está configurado en el despliegue, el candado no se aplica — en ese mundo nadie puede cobrar automático de todos modos (los pagos reportan `stripe_off`) y bloquear el tablero no ayudaría a nadie. En producción Stripe sí está configurado, así que el candado manda.

## Pieza 2 — Nadie ACTIVO sin teléfono en su ficha

- En la **única ruta de activación de técnicos** (`PATCH /api/workers/:id` — auditadas las demás rutas: el signup deja al técnico en `review`, capitanes exige ya estar activo, el bootstrap es solo del admin), activar a un técnico **sin teléfono** ahora se rechaza: **400 `{ code: 'PHONE_REQUIRED' }`** — "worker has no phone on file — add a phone number before activating (incomplete record)".
- El teléfono puede viajar **en el mismo PATCH** que la activación (la edición de perfil del admin): la guardia lee el número efectivo, así Gabriel corrige y activa en un solo paso.
- **Sin retroactividad:** quien ya está ACTIVO no se desactiva; su tarjeta en admin muestra la insignia **"⚠ Incomplete — no phone"** pa' que Gabriel lo complete cuando quiera.
- Contexto: el número de Jesús López (916-640-4578) sí existía en su ficha de la app — los registros ya están completos; esto es prevención pa' que no se repita.

## Pieza 3 — Disponibilidad con CHECKBOXES en la aplicación de técnico nuevo

- El campo de texto libre "Availability" de la aplicación se reemplazó por **checkboxes**: **días** (Lun–Dom), **turnos** (Mañanas / Tardes / Noches) y el checkbox solo **"⚡ Disponible para jales on-demand / urgentes"**. Etiquetas por el diccionario v71 (`availDaysLabel`, `availShiftsLabel`, `shiftMorning/Afternoon/Evening`, `availOnDemand` + los `day_0..6` que ya existían), paridad EN/ES.
- **Guardado estructurado:** el registro queda `u.availability = { preset, days[], paused, shifts[], onDemand }` — `cleanAvailability` se extendió con `shifts` (solo `morning|afternoon|evening`) y `onDemand`, sin tocar el comportamiento de preset/días/pausa que ya existía. El signup acepta el objeto `availability` y lo valida con tolerancia: un payload viejo (sin el objeto) o uno corrupto simplemente no aterriza — la aplicación nunca se cae por eso.
- El texto libre histórico se queda intacto: el formulario genera un resumen corto ("Mon Wed Fri · morning · on-demand OK") que sigue viviendo en `profile.availability` como historial, y las fichas viejas no se tocaron.
- **En admin:** la tarjeta compacta del técnico muestra su disponibilidad estructurada en una línea (días · turnos · ⚡ on-demand), además de la fila de detalle de siempre.

## Pieza 4 — Mapa maestro del admin: causa raíz y arreglo

**Síntoma:** Gabriel nunca ha podido verlo ("el mapa no lo he podido ver"); la auto-reparación de la v65 no bastó.

**Auditoría (con evidencia):**
- **(a) CSP — NO era el problema.** El header servido permite `unpkg.com` en script/style y **cualquier imagen https:** (`img-src … https:`), que es lo que Leaflet usa pa' los tiles (son `<img>`, no fetch — `connect-src` no necesita el host de tiles). Verificado leyendo el header real de la app servida localmente.
- **(c) Assets — NO era el problema.** `leaflet.js`, `leaflet.css` (unpkg, Leaflet 1.9.4) y un tile de muestra de `tile.openstreetmap.org` responden **200** (verificado con curl). Los pines son divIcons propios (sin imágenes de marcador que puedan 404).
- **(d) Datos — NO era el problema.** `/api/admin/worker-locations` filtra bien (activos, no pausados, punto fresco ≤10 min — probado desde la v41) y la lista de técnicos sobre el mapa se pinta primero, como contenido principal.
- **(b) LA CAUSA: tiempo/layout.** `loadAdmin()` construye el mapa al final de una cadena async larga; si el contenedor aún no tiene tamaño real (panel en transición), Leaflet se queda con viewport 0×0. La v46/v65 re-median una vez (400 ms) y se rendían; si el panel tardaba más, el mapa quedaba gris **en silencio, pa' siempre** — y si CUALQUIER paso anterior de `loadAdmin` lanzaba una excepción, `loadAdminMap` ni siquiera corría y la caja quedaba vacía sin explicación.

**Arreglos:**
1. **ResizeObserver permanente** sobre el contenedor: cualquier cambio de tamaño posterior (panel que aparece, rotación, teclado, layout tardío) vuelve a medir el mapa (`invalidateSize`) durante toda su vida. Se desconecta limpio en cada reconstrucción.
2. **Salud de tiles:** si a los 7 segundos del init **ningún tile cargó** (host bloqueado, red caída, regresión de CSP), el mapa se reemplaza por el **mensaje bilingüe de respaldo** con botón Reintentar — una caja gris silenciosa ya no puede volver a pasar.
3. **Watchdog en `loadAdmin`:** si la caja del mapa sigue vacía 1.5 s después de la carga, se rellena sola llamando `loadAdminMap()` (que trae sus propios datos; su guardia anti-dobles evita duplicados).
4. Un solo helper de respaldo (`adminMapFallbackHtml`) pa' todos los caminos de falla (Leaflet ausente, excepción, tiles muertos).

**Verificación:** suite con estáticas nuevas del mapa (ResizeObserver presente, `tileerror` + fallback, watchdog) + las de la v46 intactas; app servida localmente — `/api/health` OK, CSP leído del header real, la página servida contiene el código nuevo y `sw.js` reporta `ghs-app-v75`. La prueba visual final sigue siendo en la tablet de Gabriel (el entorno no tiene navegador con su sesión), pero ahora, si algo falla en su red, verá el mensaje con Reintentar en vez de un rectángulo gris.

## Pruebas

Suite completa **881/881 PASS**. Nuevas: estáticas de las 4 piezas (candado + mensajes exactos, override + auditoría, guardia de teléfono, availability estructurada, tarjeta y diálogo del técnico, checkboxes, paridad de diccionario, insignias de admin, mapa) y dinámicas en app2 (Stripe mock): claim rechazado sin Connect y el jale queda Open · el endpoint de override es solo-admin · el override libera y queda auditado · el override no se filtra a otro técnico · con Connect listo el mismo técnico agarra libre · aplicar sin teléfono sí, activar sin teléfono no, y teléfono+activación en un PATCH sí · round-trip de los checkboxes (días ordenados, turno inválido descartado, texto histórico intacto, payload viejo con defaults limpios).

**Dos ajustes de fixtures (no del producto):** (1) WA — el técnico de las pruebas de yarda de app2 — ahora completa su setup de Connect al crearse, porque bajo la regla nueva lo necesita pa' agarrar jales del tablero; (2) "Direct Dan" (v41 mail) ahora trae teléfono en su aplicación, porque sin él la guardia de la Pieza 2 correctamente le niega la activación. Ambos confirman que las reglas nuevas muerden donde deben.

## Decisiones ante ambigüedad (la opción conservadora)

- El candado aplica a jales **con pago** (`payOffer > 0`); un jale de $0 no mueve dinero y no se bloquea.
- El override es por (jale, técnico) y no expira solo: queda en la auditoría y Gabriel lo ve en la tarjeta; el pago sigue gated por el setup real del técnico.
- La guardia de teléfono solo bloquea la **transición** a activo — jamás desactiva a nadie por sí sola.
