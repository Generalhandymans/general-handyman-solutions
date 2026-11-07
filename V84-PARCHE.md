# V84-PARCHE — Clasificación de trabajadores: TÉCNICO o AYUDANTE desde el registro (2026-11-07)

Orden de Gabriel (2026-11-07): **"necesito que todos nuestros sistemas estén clasificados pa' que toda persona en nuestra data entre ayudante [o] técnico"** — y la página de registro aprobada en draft se vuelve la puerta **/tecnico** del sistema REAL. Nada de página paralela: la clasificación entra INTO el registro de trabajadores que ya existe (el mismo `/api/signup`, el mismo formulario de aplicación de la entrada `#worker`), como su **paso 1 obligatorio**. Suite: **1724 → 1747 PASS / 0 FAIL** (verificada dos veces) (23 pins netos nuevos v84; los fixtures de signup de trabajadores de la suite ahora mandan la clase que el API exige — ninguna aserción existente cambió).

## 1. El dato — `workerClass` en `app/server.js`

- Campo nuevo en el usuario worker: `workerClass: 'tecnico' | 'ayudante'`. `pubUser()` lo expone para workers (normalizado: cualquier valor que no sea `'ayudante'` lee `'tecnico'`), y con él viaja en `GET /api/workers` (la lista admin lo mapea sobre `pubUser`).
- **Registro (POST /api/signup):** si `role === 'worker'`, la clase es REQUERIDA — sin `workerClass` válido la aplicación muere con `400 { code: 'WORKER_CLASS_REQUIRED' }`. El cliente no se toca (su signup no lleva clase y `pubUser` no se la inventa).
- **Migración de arranque — `ensureWorkerClasses()`:** idempotente, corre al boot (tras `loadFromSupabase`, antes de `listen`) y como no-op en el preámbulo de cada request junto a `ensureCaptainState()`. Solo toca workers SIN clase: **Keotis Patterson** y **Jesús Lopez Barajaa** (match insensible a mayúsculas y acentos — la llave se normaliza con NFD sin diacríticos y se busca `keotis`+`patterson` o `jesus`+`lopez`) → `'ayudante'`; **todos los demás** (activos o en revisión) → `'tecnico'`. Si cambió algo, guarda. Gabriel puede reclasificar a cualquiera después (§4), así que el default es seguro.
- Los campos de aplicación SOLO TÉCNICOS que manda el formulario (`profile.primaryTrade` — uno de los seis oficios del draft: handyman/plumbing/electrical/carpentry/painting/mechanic —, `profile.ownTools`, `profile.ownTransport`) se sanean en el signup: oficio fuera de la lista se borra; herramientas/transporte quedan como booleanos.

## 2. Las puertas — `/tecnico` y `/ayudante` en `app/server.js`

- `GET /tecnico` → `302 Location: '/#worker?class=tecnico'`; `GET /ayudante` → `302 Location: '/#worker?class=ayudante'`. Espejo del contrato de `/plus`: la clase viaja DENTRO del fragmento, la SPA la captura una vez y la limpia (ver §3), y el router sigue casando el hash pelón `#worker`.
- La puerta cae en el MISMO registro existente: la entrada `#worker` con su pestaña de aplicación — no hay página nueva ni signup paralelo.
- `/tech` NO cambió: sigue siendo la puerta de login del técnico (`/#worker`), y el pin v63 (que exige el literal `Location: '/#worker'` y el `#worker` en la Location de `/tecnico`) sigue verde.

## 3. El formulario — paso 1 visual del draft aprobado, en `app/public/index.html`

- **Tarjetas de clase (`#workerClassRow`, solo en modo worker):** dos tarjetas oscuras de marca (`--panel`, borde `--panel-line`; la elegida con borde rojo `#e42535` y ✓ en círculo rojo), replicando el draft que Gabriel aprobó:
  - **TÉCNICO** — "Tengo oficio y experiencia" · Handyman · Plomería · Electricidad · Carpintería · Pintura · Mecánica.
  - **AYUDANTE** — "Quiero trabajar y aprender" · Ayuda general · Limpieza · Yarda · Apoyo en trabajos · Sin experiencia — aprende aquí.
  - Debajo, el rótulo **"2 · Tus datos"** precede los campos de siempre (nombre/correo/teléfono/contraseña — los mismos del auth box, sin duplicar nada).
- **Sección SOLO TÉCNICOS (`#wTechOnly`):** envuelve oficio principal (select nuevo, los seis oficios del draft), herramientas propias Sí/No y transporte propio Sí/No (picks nuevos), y los campos de aplicación calificada que ya existían (skills, las 7 cajas de oficios con nivel+herramienta, gear, experiencia). Con AYUDANTE elegido la sección se oculta entera y nada de ella es requerido; con TÉCNICO se muestra. Oficio principal → `profile.primaryTrade`; experiencia → el `profile.experience` de siempre (el select de rangos existente); Sí/No de herramientas/transporte → `profile.ownTools` / `profile.ownTransport` (la herramienta por oficio y el vehículo siguen viviendo en sus campos históricos).
- **La clase manda en el submit:** `doAuth` rehúsa enviar la aplicación sin clase elegida (mensaje `classRequired`), y el payload lleva `workerClass` al mismo `/api/signup`. La pick histórica "Applying as" se sincroniza sola desde la clase (Skilled subcontractor ↔ Técnico, Helper ↔ Ayudante) para que el perfil guardado conserve su forma.
- **Captura de la puerta:** `captureWorkerDoorClass()` lee `#worker?class=…` al cargar — ANTES de que la captura de campaña (v24) limpie el query del hash — y lo deja en `sessionStorage 'ghsWorkerClass'`; `consumeDoorClass()` (desde `applyWorkerEntry` y desde `mode('worker')`) abre la aplicación con la tarjeta preseleccionada, una sola vez por visita. Un visitante logueado no consume nada: cae en su zona como siempre. El flujo de revisión queda intacto: la cuenta nace **On review** y al activarse el trabajador conecta su Stripe, como hoy.
- Todo el copy nuevo vive en `W_I18N` en pares EN/ES (`classStep`, `datosStep`, `classTecnico*`, `classAyudante*`, `classRequired`, `techOnlyStep`, `primaryTrade*`, `ownToolsLabel`, `ownTransportLabel`, `classYes`, `classNo`) — un solo idioma a la vez, con el toggle de la zona worker, nunca mezclado.

## 4. Admin — insignia, filtro y reclasificación

- Cada tarjeta de trabajador en la lista admin lleva su insignia de clase: **TÉCNICO** (negra) o **AYUDANTE** (dorada), junto a los pills de estatus/Stripe.
- Filtro por clase sobre la lista (`#adminWorkerClassFilter`: Todas / Técnicos / Ayudantes) — filtra solo lo RENDERIZADO; `adminWorkersCache` conserva a todos (los pickers de despacho lo leen completo).
- El detalle del trabajador muestra Class / Main trade / Own tools / Own transport, y los botones **Make TÉCNICO / Make AYUDANTE** reclasifican vía `PATCH /api/workers/:id` con `{ workerClass }` — el handler lo valida contra los dos únicos valores (otro valor = 400) y la auditoría registra `class <valor>`.

## 5. El menú de ventas es de TÉCNICOS — doble riel

- Servidor: `GET /api/worker/sales-menu` responde `403 { code: 'TECH_ONLY' }` a un worker activo con `workerClass === 'ayudante'` (además del 403 de no-activo que ya existía).
- SPA: `loadWorkerSales()` ni siquiera pinta la sección para un ayudante (la caja queda vacía).
- Los filtros de reclamo por tipo de trabajo NO entran en esta versión (fuera de alcance, como se acordó).

## 6. Pins — `tests/run.mjs` (23 nuevos, todos v84)

- **Statics (4):** puertas `/tecnico` + `/ayudante` con la clase dentro del fragmento; la regla `WORKER_CLASS_REQUIRED` + la exposición en `pubUser` + `ensureWorkerClasses` + la validación del PATCH; el doble riel `TECH_ONLY`; las piezas SPA (tarjetas, `#wTechOnly`, captura de puerta, filtro e insignia admin).
- **HTTP (13):** las tres puertas con `redirect: 'manual'` (Location exacta de cada una); signup de worker sin clase → 400, con clase inválida → 400, técnico → 201 On review con clase y perfil SOLO TÉCNICOS saneado, ayudante → 201 con clase, cliente sin clase → 201 sin clase; la lista admin trae la clase de cada quien; PATCH reclasifica ida y vuelta y rechaza un valor inválido; técnico activo abre el menú de ventas (200 + items) y ayudante activo recibe 403 `TECH_ONLY`.
- **VM (2):** en el formulario real, elegir AYUDANTE oculta `#wTechOnly` y elegir TÉCNICO lo vuelve a mostrar.
- **Migración (4):** usuarios sin clase sembrados directo en el data file (Keotis Patterson, Jesús Lopez Barajaa con acento, JESUS LOPEZ en mayúsculas sin acento, y un worker regular), reinicio de la instancia, y la clase se lee de vuelta por la lista admin — los dos ayudantes como `ayudante`, el regular como `tecnico` — y queda PERSISTIDA en el archivo (el cliente sembrado sigue sin clase).
- **Fixtures:** los 23 signups de trabajadores que la suite ya hacía ahora incluyen `workerClass: 'tecnico'` (el campo que el API nuevo exige); ninguna aserción existente se tocó. Los bumps de cache de la suite (2) pasan a v84.

## Versión

- SW `CACHE = 'ghs-app-v84'` (los dos statics de versión en la suite, actualizados).
- Archivos: `app/server.js`, `app/public/index.html`, `app/public/sw.js`, `tests/run.mjs`, este archivo.
- Sin cambios de precios, sin cambios al catálogo, y ninguna superficie de cliente tocada fuera de la vista de registro de trabajadores y la lista admin de trabajadores.
