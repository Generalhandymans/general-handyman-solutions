# V119-PARCHE — CRM: registro manual de leads

**Orden de Gabriel (2026-11-22, textual):** eligió "Leads manuales en
el CRM" de la lista de mejoras — el CRM de v118 solo derivaba clientes
de la app; los leads de Messenger, Instagram, Google Voice y
Marketplace nunca entraban hasta que compraban.

**Alcance:** aditivo sobre v118. Cero cambios de precios, menú,
checkout, depósitos ni del comportamiento de los clientes derivados —
los leads manuales son una capa nueva al lado, en la misma sección
`db.crm`.

## Cómo funciona

- **El lead manual es un récord propio en `db.crm`**, con clave
  `m:<id>` (generada con el helper `id('LD')` de la casa) y
  `manual: true`. Guarda SUS campos: `name` (obligatorio), `phone`,
  `email`, `address`, `zone`, `source`, `stage`, `notes`,
  `createdAt`/`updatedAt`. A diferencia del cliente derivado, su
  contacto NO se deriva de cuentas/carritos/órdenes: vive en el récord.
- **La lista fusiona ambos mundos** (`crmAllCustomers()` =
  `crmCustomers()` de v118 + cada récord `m:`), y las filas manuales
  salen con la misma forma (nombre, zona, contacto, etapa, fuente,
  lifetime 0, sin depósitos abiertos) más la bandera `manual: true`.
  Entran en los conteos por etapa y por zona, en el buscador por
  nombre y en el filtro por zona, igual que cualquier cliente.
- **Zona:** al crear se normaliza con el mismo `crmZoneFromCity()` de
  v118 (las 8 ciudades de servicio); vacío o desconocido cae en
  "Otra / sin zona". **Etapa:** debe ser una del pipeline de v118
  (`nuevo → cotizado → deposito_pendiente → agendado → hecho →
  review_repetir`); default `nuevo`.
- **La ficha de un lead manual** devuelve el récord con historial
  vacío (sin carritos ni órdenes), sin membresía y sin seguimientos
  computados — honesto: todavía no hay actividad que computar.
- **Fuentes sugeridas** (select en el panel): Google, Instagram,
  Facebook, Marketplace, Google Voice, Referido, Otro. El servidor
  acepta texto libre, como en v118.

## Endpoints (solo admin — 401 sin sesión, `requireRole`, como v118)

- `POST /api/admin/crm/leads` → crea el lead. Sin nombre (o nombre en
  blanco) = 400; etapa fuera del set = 400. Audita `crm.lead.create`
  y responde la ficha del lead creado.
- `POST`/`PUT /api/admin/crm/:key` (el de v118, extendido) → si la
  clave es manual, también actualiza `name`/`phone`/`email`/`address`
  del récord (nombre en blanco = 400). Para clientes DERIVADOS esos
  campos se ignoran: su contacto sigue siendo de solo lectura, como
  en v118.
- `DELETE /api/admin/crm/leads/:key` → borra SOLO leads manuales
  (audita `crm.lead.delete`). Una clave derivada se RECHAZA con 400 —
  los datos reales de un cliente jamás se borran desde el CRM — y una
  clave manual inexistente responde 404.

## El panel (app.js — index.html no cambia: los hosts ya existían)

- Botón **"+ Agregar lead"** en la tarjeta del CRM que abre un
  formulario corto (nombre*, teléfono, correo, dirección, zona select
  con las 8 + respaldo, fuente select, etapa select, notas) que
  postea y refresca la lista, abriendo la ficha del lead nuevo.
- Las filas manuales llevan una **pastilla "Manual"** roja junto al
  nombre.
- La ficha de un lead manual suma los campos editables de contacto
  (nombre/teléfono/correo/dirección) y el botón **"Borrar lead"** con
  confirmación; al guardar viajan en el mismo POST de v118.
- Etiquetas nuevas en bloque `ADM119` EN/ES, espejo de `ADM118`; las
  compartidas (zona/etapa/fuente/notas/guardar/nombres de etapa) se
  reusan de ADM118.

## Tests — PASS 2190 / FAIL 0, dos veces

Suite completa corrida **dos veces** desde copia scratch en /tmp con
`APP_DIR` apuntando a este repo: **PASS 2190 / FAIL 0** en ambas
corridas (2,174 de v118 + **16 nuevos de v119**). El bloque v119 usa
instancia propia (:8997) y fixtures SOLO ficticios por la API real:
cuenta derivada ancla + dos leads manuales. Cobertura: boot · 401 en
crear y borrar sin auth · validación (sin nombre 400, etapa inválida
400) · creación completa (clave `m:`, bandera manual, zona en
minúsculas normalizada a Vacaville, etapa/fuente/notas, lifetime 0) ·
defaults del lead pelón (etapa nuevo, zona respaldo) · fusión en la
lista con conteos por etapa y zona (cotizado 1, nuevo 2, Vacaville 1,
Fairfield 1, respaldo 1) · ficha con historial vacío · edición de
contacto persistente en `db.crm` · nombre en blanco al editar = 400 ·
edición de contacto en cliente derivado IGNORADA (comportamiento
v118 intacto) · borrado de clave derivada rechazado (400) y de clave
inexistente (404), con la derivada intacta · borrado real del lead
(sale de la lista, su ficha 404, el récord desaparece del disco) ·
estáticos de cableado.

## Housekeeping

- SW cache → `ghs-app-v119` (los 9 pins de la suite actualizados).
- `app/data.json` NO se tocó en este parche (su diff local
  preexistente es del 2026-11-10) y NO viaja, como siempre.
- **Sin publicar:** queda en el repo local a la espera de la orden
  expresa de Gabriel, como manda la casa.

## Brechas honestas

- Si un lead manual después se registra en la app con el mismo correo
  o teléfono, aparecerá DOS veces (su ficha manual y la derivada):
  v119 no fusiona récords a mano; Gabriel puede borrar el manual
  cuando el cliente ya vive en la app. Detectarlo automáticamente
  queda como mejora futura, no se fingió.
- El render del panel contra producción NO se ejercitó con sesión
  admin real (igual que v108/v118): queda pineado por la suite
  (endpoints completos contra fixtures + estáticos del cliente EN/ES).
- La dirección del lead se guarda en una línea (el `cleanText` de la
  casa colapsa saltos de línea), suficiente para dirección postal.

## Archivos del parche

`app/server.js` · `app/public/app.js` · `app/public/sw.js` ·
`tests/run.mjs` · `V119-PARCHE.md` (este). `app/public/index.html`
sin cambios (los hosts `#adminCrm`/`#adminCrmFicha` ya existían).
