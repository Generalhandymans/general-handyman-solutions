# V118-PARCHE — CRM permanente: cada cliente por NOMBRE y ZONA

**Orden de Gabriel (2026-11-22, textual):** "Necesito que nuestro
sistema incluya CRM — y para siempre" · "Así como habíamos guardado
los trabajadores necesitamos guardar clientes con zonas y nombres" ·
"A medida que crecemos, data" · "Nombre y zona."

**Alcance:** capa CRM permanente en admin, espejo del registro de
trabajadores. Cero cambios de precios, menú, checkout, depósitos ni de
ningún comportamiento de cara al cliente — todo es aditivo y solo-admin.

## Cómo funciona

- **La lista se DERIVA en vivo** (`crmCustomers()` en server.js) de los
  récords que la app ya guarda: cuentas de cliente fusionadas con sus
  carritos y órdenes, emparejados por id de cuenta, luego correo, luego
  teléfono. Nunca puede desincronizarse de los datos reales y crece
  sola con el negocio. Clave estable por cliente: `u:<userId>` si tiene
  cuenta; si no, `e:<correo>`, `p:<teléfono>`, `n:<nombre>`.
- **Los campos propios del CRM viven en una sección NUEVA de datos,
  `db.crm`**, indexada por esa misma clave: `zone`, `source`, `stage`,
  `notes`, `updatedAt`. Todos opcionales — si no hay récord, todo se
  computa de los datos vivos; ningún script reescribe data.json.
- **Zona:** automática desde la ciudad de la orden más reciente →
  ciudad del checkout del carrito → ciudad detectada en la dirección,
  normalizada a las 8 ciudades de servicio (Fairfield, Suisun City,
  Vacaville, Vallejo, Benicia, Napa, Concord, Antioch); respaldo
  "Otra / sin zona". Gabriel puede sobreescribirla por cliente.
- **Pipeline (set exacto):** `nuevo → cotizado → deposito_pendiente →
  agendado → hecho → review_repetir`. Etapa automática sugerida del
  estado vivo: orden pagada o trabajo "Done — photos sent" → hecho;
  orden aprobada / job posteado / job asignado → agendado; carrito
  abierto sin depósito → deposito_pendiente; hay carrito u orden →
  cotizado; solo cuenta → nuevo. **La etapa manual guardada gana**;
  limpiarla (Auto) vuelve a la sugerida.
- **Seguimientos computados** (`crmFollowUps()`): carritos abiertos
  sin depósito (mismo `cartSplit` del panel de rescate — el CRM jamás
  cotiza un depósito distinto del que el link le pide al cliente),
  ordenados por depósito descendente; y órdenes pagadas en su totalidad
  sin `reviewAskedAt` (pendientes de pedir el review de Google).
- **Valor histórico (lifetime paid):** suma de pagos completos de
  órdenes (`payment.amountCents` con `payment.status 'paid'`) más
  carritos pagados SIN orden ligada (sin doble conteo: un carrito con
  `requestId` presente en las órdenes del cliente no se suma dos veces).

## Endpoints (solo admin — 401 sin sesión, `requireRole`, como rescate)

- `GET /api/admin/crm` → `{ ok, count, stages, zones, followUps:
  { depositCustomers, depositDue, reviewPending }, customers }` —
  filas con nombre, zona, contacto, etapa (+ la automática), fuente,
  membresía, lifetime paid, depósito abierto, conteos y follow-ups.
- `GET /api/admin/crm/:key` → la ficha: todo lo de la fila + historial
  completo (carritos con estado/total/depósito/link; órdenes con
  estado/total/pago/ciudad/dirección y sus mensajes) + `followUpsList`.
- `POST` o `PUT /api/admin/crm/:key` → actualiza `zone`, `source`,
  `stage`, `notes` (etapa fuera del set = 400; clave desconocida =
  404). Audita `crm.update` y guarda.

## El panel (index.html + app.js)

Sección nueva tras el rescate: **"Clientes — CRM"** (`#adminCrm` +
`#adminCrmFicha`), cargada por `loadAdminCrm()` dentro de `loadAdmin()`,
mismo patrón visual del panel de rescate (tarjetas `.card`, etiquetas
ADM118 EN/ES según el idioma de la app):

- Chips con el conteo por etapa, filtro por zona (con conteos) y
  buscador por nombre.
- Filas: nombre, zona, etapa, # carritos/órdenes, lifetime y depósito
  pendiente en destaque, conteo de seguimientos.
- Click en una fila → la ficha: contacto, dirección, membresía,
  editables de zona (select de las 8 + respaldo), etapa (Auto + las 6),
  fuente y notas con Guardar; abajo, seguimientos y el historial
  completo con los mensajes de cada orden.

## Tests — PASS 2174 / FAIL 0, dos veces

Suite completa corrida **dos veces** desde copia scratch en /tmp con
`APP_DIR` apuntando a este repo: **PASS 2174 / FAIL 0** en ambas
corridas (2,156 de v117 + **18 nuevos de v118**). El bloque v118 usa
instancia propia (:8994) y fixtures SOLO ficticios: cuenta + carrito
por la API real, orden pagada y cliente sin cuenta sembrados en el
archivo de la instancia. Cobertura: boot en dos fases · 401 en los tres
endpoints sin auth · lista con nombre+zona por clave de cuenta y de
correo · etapas automáticas (pagada → hecho gana al carrito abierto;
carrito sin depósito → deposito_pendiente) · totales (lifetime $135,
depósitos $50/$400, encabezado $450) · conteos por etapa y zona ·
ficha agrega el carrito y la orden correctos con mensajes y bloque de
membresía · follow-ups computados (depósito + review) · la etapa
manual SOBREESCRIBE la automática y persiste en `db.crm` · PUT limpia
la etapa y vuelve a auto · etapa inválida 400 · clave desconocida 404 ·
edición de zona en cliente sin cuenta · estáticos de cableado.

## Housekeeping

- SW cache → `ghs-app-v118` (los 8 pins de la suite actualizados).
- `app/data.json` NO se tocó en este parche (su diff local preexistente
  es del 2026-11-10) y NO viaja, como siempre.
- **Sin publicar:** este parche queda en el repo local a la espera de
  la orden expresa de Gabriel, como manda la casa.

## Brechas honestas

- El render del panel contra producción NO se ejercitó con sesión
  admin real (igual que v108): queda pineado por la suite (endpoints
  completos contra fixtures + estáticos del cliente EN/ES).
- La zona automática depende de que la orden/carrito traiga ciudad o
  de que la dirección contenga el nombre de una ciudad de servicio;
  una dirección sin ciudad reconocible cae en "Otra / sin zona" hasta
  que Gabriel la corrija en la ficha (para eso es el override).
- Los mensajes del asistente (casos) viven dentro de las órdenes
  (`r.messages`) y se incluyen vía el historial de órdenes; no hay un
  hilo de mensajes suelto por cliente fuera de órdenes.

## Archivos del parche

`app/server.js` · `app/public/app.js` · `app/public/index.html` ·
`app/public/sw.js` · `tests/run.mjs` · `V118-PARCHE.md` (este).
